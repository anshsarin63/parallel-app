require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const redis = require('redis');
const { PROFILES, PROMPTS, AUTO_REPLIES, DEMO_DATA } = require('./data/profiles');

// --- Redis Setup ---
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect().then(() => console.log('✦ Connected to Redis')).catch(console.error);
// --- Mongoose Models ---
const User = require('./models/User');
const Chat = require('./models/Chat');
const Like = require('./models/Like');
const Swipe = require('./models/Swipe');
const Match = require('./models/Match');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- In-memory stores (prototype — not persisted) ---
const waitlist = [];
const reports = [];

// ===== Helpers for converting registered users to profile cards =====
const GENDER_EMOJIS = { '👨 Male': '👨', '👩 Female': '👩', '🌈 Other': '🧑' };
const GRADIENTS = [
  'linear-gradient(135deg,#c4522a,#d4a853)',
  'linear-gradient(135deg,#5a8a6e,#3a6a8a)',
  'linear-gradient(135deg,#6b3a9a,#d4a853)',
  'linear-gradient(135deg,#2a6aaa,#c4522a)',
  'linear-gradient(135deg,#8a5a2a,#5a8a6e)',
  'linear-gradient(135deg,#1a5a9a,#8a2a4a)',
  'linear-gradient(135deg,#9a3a6a,#d4a853)',
  'linear-gradient(135deg,#3a7a5a,#c4822a)'
];

function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob), now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
}

// Extract the base city name from formats like "North Campus, Delhi" → "delhi"
function extractBaseCity(cityStr) {
  if (!cityStr) return '';
  const parts = cityStr.split(',');
  return parts[parts.length - 1].trim().toLowerCase();
}

function userToProfile(u) {
  const cleanStage = (u.stage || '').replace(/^[^\w]*/, '').trim() || 'User';
  const cleanCity = (u.city || '').split(',')[0].trim() || 'Unknown';
  const tags = (u.interests || []).map(i => i.replace(/^[^\w]*/, '').trim()).slice(0, 3);
  const age = calcAge(u.dob);
  const idNum = u._id ? u._id.toString().slice(-4) : '0000';
  const numericId = 1000 + parseInt(idNum, 16) % 9000; // stable numeric ID from MongoDB _id
  return {
    id: numericId,
    mongoId: u._id,
    emoji: GENDER_EMOJIS[u.gender] || '🧑',
    name: u.name || 'User',
    age: age || '?',
    stage: cleanStage,
    city: cleanCity,
    fullCity: u.city || cleanCity,
    s1: 70 + Math.floor(Math.random() * 25),
    s2: 75 + Math.floor(Math.random() * 22),
    tags: tags.length ? tags : ['New Member'],
    bio: u.bio || `Hey! I'm ${u.name || 'new here'}. Let's connect!`,
    gradient: GRADIENTS[numericId % GRADIENTS.length],
    isRegistered: true,
    email: u.email,
    relocated: u.relocated || false,
    lat: u.lat || null,
    lng: u.lng || null,
    photo: u.photo || null
  };
}

// ===== API ROUTES =====

// GET /api/profiles — all profile data needed by the frontend
app.get('/api/profiles', async (req, res) => {
  try {
    const excludeEmail = req.query.email || '';
    const filterCity = req.query.city || '';
    const baseCity = extractBaseCity(filterCity);

    // Get registered users from MongoDB
    const query = excludeEmail ? { email: { $ne: excludeEmail } } : {};
    const users = await User.find(query).lean();

    let registeredProfiles = users.map(userToProfile);
    let botProfiles = [...PROFILES];

    // If a city filter is provided, only show profiles in the same city
    if (baseCity) {
      registeredProfiles = registeredProfiles.filter(p => {
        const pCity = extractBaseCity(p.fullCity || p.city || '');
        return pCity === baseCity;
      });
      botProfiles = botProfiles.filter(p => {
        const pCity = (p.city || '').trim().toLowerCase();
        return pCity === baseCity;
      });
    }

    res.json({
      profiles: [...botProfiles, ...registeredProfiles],
      demoData: DEMO_DATA
    });
  } catch (err) {
    console.error('[API] Error fetching profiles:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/prompts — chat prompt suggestions
app.get('/api/prompts', (req, res) => {
  res.json({ prompts: PROMPTS });
});

// GET /api/auto-replies — auto-reply map
app.get('/api/auto-replies', (req, res) => {
  res.json({ autoReplies: AUTO_REPLIES });
});

// POST /api/waitlist — join waitlist
app.post('/api/waitlist', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  waitlist.push({ email, timestamp: new Date().toISOString() });
  console.log(`[WAITLIST] New signup: ${email} (total: ${waitlist.length})`);
  res.json({ success: true, message: 'Added to waitlist' });
});

// POST /api/report — report/block a user and send email
app.post('/api/report', async (req, res) => {
  const { reporterEmail, reporterName, reportedId, reportedName, reason, source, profileDetails, chatMessages } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'Reason required' });
  }

  // Store in-memory
  reports.push({
    reporterEmail,
    reporterName,
    reportedId,
    reportedName,
    reason,
    source,
    timestamp: new Date().toISOString()
  });

  console.log(`[REPORT] ${reportedName} (ID: ${reportedId}) reported by ${reporterName} — Reason: ${reason} — Source: ${source} (total reports: ${reports.length})`);

  // Compose email
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const pd = profileDetails || {};

  let emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:linear-gradient(135deg,#a83e20,#c05a35);color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="margin:0;font-size:24px">🚩 Report Submitted</h1>
        <p style="margin:8px 0 0;opacity:0.9;font-size:14px">${timestamp} IST</p>
      </div>
      
      <div style="background:#fff;border:1px solid #e0d0c0;padding:20px;border-radius:0 0 12px 12px">
        <h2 style="color:#a83e20;font-size:16px;margin:0 0 12px;border-bottom:2px solid #f0e0d0;padding-bottom:8px">📋 Report Details</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#888;width:140px">Reporter:</td><td style="padding:6px 0;font-weight:600">${reporterName || 'Unknown'} (${reporterEmail || 'N/A'})</td></tr>
          <tr><td style="padding:6px 0;color:#888">Reason:</td><td style="padding:6px 0;font-weight:600;color:#c04040">${reason}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Report Source:</td><td style="padding:6px 0">${source === 'chat' ? '💬 Chat Window' : '👤 Profile / Swipe Card'}</td></tr>
        </table>

        <h2 style="color:#a83e20;font-size:16px;margin:24px 0 12px;border-bottom:2px solid #f0e0d0;padding-bottom:8px">👤 Reported Profile</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#888;width:140px">Name:</td><td style="padding:6px 0;font-weight:600">${pd.name || reportedName || 'Unknown'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Profile ID:</td><td style="padding:6px 0">${pd.id || reportedId || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Email:</td><td style="padding:6px 0">${pd.email || 'N/A (bot profile)'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Age:</td><td style="padding:6px 0">${pd.age || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Life Stage:</td><td style="padding:6px 0">${pd.stage || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">City:</td><td style="padding:6px 0">${pd.city || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Bio:</td><td style="padding:6px 0">${pd.bio || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Interests:</td><td style="padding:6px 0">${(pd.tags || []).join(', ') || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#888">Registered User:</td><td style="padding:6px 0">${pd.isRegistered ? '✅ Yes' : '❌ No (bot profile)'}</td></tr>
        </table>`;

  // If reported from chat, include chat messages
  if (source === 'chat' && chatMessages && chatMessages.length > 0) {
    emailHtml += `
        <h2 style="color:#a83e20;font-size:16px;margin:24px 0 12px;border-bottom:2px solid #f0e0d0;padding-bottom:8px">💬 Chat Messages (${chatMessages.length})</h2>
        <div style="background:#fdf7f0;border:1px solid #ecddd0;border-radius:10px;padding:12px;max-height:500px;overflow:auto">`;

    chatMessages.forEach(msg => {
      const isReporter = msg.from === reporterName;
      emailHtml += `
          <div style="margin-bottom:10px;text-align:${isReporter ? 'right' : 'left'}">
            <div style="display:inline-block;max-width:80%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.5;
              ${isReporter 
                ? 'background:linear-gradient(135deg,#a83e20,#d4692e);color:#fff;border-bottom-right-radius:4px'
                : 'background:#fff;color:#2e2218;border:1px solid #ecddd0;border-bottom-left-radius:4px'}">
              <strong style="font-size:11px;display:block;margin-bottom:2px;opacity:0.8">${msg.from}</strong>
              ${msg.text}
            </div>
            ${msg.timestamp ? `<div style="font-size:10px;color:#9a8878;margin-top:2px">${new Date(msg.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>` : ''}
          </div>`;
    });

    emailHtml += `
        </div>`;
  }

  emailHtml += `
        <div style="margin-top:24px;padding:12px;background:#fff3f0;border:1px solid rgba(192,64,64,0.2);border-radius:8px;font-size:12px;color:#a03030;text-align:center">
          ⚠️ This report requires review within 24 hours per community guidelines.
        </div>
      </div>
    </div>`;

  // Send email via nodemailer
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.REPORT_EMAIL_USER || 'customersupport.parallel@gmail.com',
        pass: process.env.REPORT_EMAIL_PASS || ''
      }
    });

    await transporter.sendMail({
      from: `"Parallel Reports" <${process.env.REPORT_EMAIL_USER || 'customersupport.parallel@gmail.com'}>`,
      to: 'customersupport.parallel@gmail.com',
      subject: `🚩 Report: ${reportedName} — ${reason}`,
      html: emailHtml
    });

    console.log(`[REPORT] Email sent successfully for report against ${reportedName}`);
  } catch (emailErr) {
    console.error(`[REPORT] Failed to send email:`, emailErr.message);
  }

  // --- Clean up server-side data: remove reported user from reporter's data ---
  const reportedProfileId = reportedId;
  const reportedEmailAddr = (profileDetails && profileDetails.email) || (reportedId ? `profile_${reportedId}@parallel` : null);

  try {
    // Remove matches
    if (reporterEmail && reportedProfileId) {
      const mRes = await Match.deleteMany({ email: reporterEmail, profileId: reportedProfileId });
      console.log(`[REPORT] Cleaned ${mRes.deletedCount} match(es)`);
    }
    // Remove chats
    if (reporterEmail && reportedEmailAddr) {
      const cRes = await Chat.deleteMany({
        $or: [
          { from: reporterEmail, to: reportedEmailAddr },
          { from: reportedEmailAddr, to: reporterEmail }
        ]
      });
      console.log(`[REPORT] Cleaned ${cRes.deletedCount} chat message(s)`);
    }
    // Remove likes
    if (reporterEmail && reportedEmailAddr) {
      const lRes = await Like.deleteMany({
        $or: [
          { from: reporterEmail, to: reportedEmailAddr },
          { from: reportedEmailAddr, to: reporterEmail }
        ]
      });
      console.log(`[REPORT] Cleaned ${lRes.deletedCount} like(s)`);
    }
    // Remove swipes
    if (reporterEmail && reportedProfileId) {
      const sRes = await Swipe.deleteMany({ email: reporterEmail, profileId: reportedProfileId });
      console.log(`[REPORT] Cleaned ${sRes.deletedCount} swipe(s)`);
    }
  } catch (cleanupErr) {
    console.error('[REPORT] Cleanup error:', cleanupErr.message);
  }

  res.json({ success: true, message: 'Report submitted' });
});

// POST /api/users — save a new user from onboarding
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password, dob, gender, stage, city, lat, lng, interests, energy, bio, photo } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check for duplicate email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const newUser = await User.create({
      name, email, password, dob, gender, stage, city, lat, lng,
      interests: interests || [], energy, bio, photo: photo || null, relocated: false
    });

    console.log(`[USER] New signup: ${name} (${email}) — ID: ${newUser._id}`);
    res.json({ success: true, message: 'User saved', userId: newUser._id });
  } catch (err) {
    console.error('[API] Error creating user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/update — update user fields (e.g. relocated toggle)
app.patch('/api/users/update', async (req, res) => {
  try {
    const { email, ...updates } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const allowedFields = ['relocated'];
    const updateObj = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) updateObj[field] = updates[field];
    });

    const u = await User.findOneAndUpdate({ email }, updateObj, { new: true });
    if (!u) return res.status(404).json({ error: 'User not found' });

    console.log(`[USER] Updated ${u.name} (${email}): ${JSON.stringify(updateObj)}`);
    res.json({ success: true, message: 'User updated' });
  } catch (err) {
    console.error('[API] Error updating user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/send-code — generates and emails a 6-digit OTP
app.post('/api/auth/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });

    // Check if user already exists
    const existing = await User.findOne({ email }).lean();
    if (existing) return res.status(400).json({ error: 'An account with this email already exists. Try logging in!' });

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with 15 mins (900s) expiry
    await redisClient.setEx(`otp:${email}`, 900, code);

    // Send Email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.REPORT_EMAIL_USER || 'customersupport.parallel@gmail.com',
        pass: process.env.REPORT_EMAIL_PASS || ''
      }
    });

    const mailOptions = {
      from: `"CoHive" <${process.env.REPORT_EMAIL_USER || 'customersupport.parallel@gmail.com'}>`,
      to: email,
      subject: 'Your CoHive Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
          <h2 style="color: #c4522a;">Welcome to CoHive!</h2>
          <p>Please use the verification code below to complete your sign-up process. This code will expire in 15 minutes.</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; margin: 30px 0; padding: 20px; background: #fdf7f0; color: #333; border-radius: 8px;">
            ${code}
          </div>
          <p style="color: #888; font-size: 12px; margin-top: 40px; text-align: center;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[AUTH] Sent verification code to ${email}`);
    res.json({ success: true, message: 'Verification code sent' });

  } catch (err) {
    console.error('[API] Error sending verification code:', err);
    res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
  }
});

// POST /api/auth/verify-code — validates the OTP
app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const storedCode = await redisClient.get(`otp:${email}`);
    if (!storedCode) {
      return res.status(400).json({ error: 'Verification code expired or not found. Please resend.' });
    }

    if (storedCode === code.trim()) {
      // Code is valid, remove it so it can't be reused
      await redisClient.del(`otp:${email}`);
      console.log(`[AUTH] Verified code for ${email}`);
      return res.json({ success: true, message: 'Email verified' });
    } else {
      return res.status(400).json({ error: 'Incorrect verification code.' });
    }
  } catch (err) {
    console.error('[API] Error verifying code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/login — authenticate user with email + password
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const u = await User.findOne({ email }).lean();
    if (!u) {
      return res.status(401).json({ error: 'No account found with this email. Try signing up instead!' });
    }
    if (u.password !== password) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const { password: _, ...userData } = u;
    console.log(`[LOGIN] ${u.name} (${email}) logged in`);
    res.json({ success: true, user: userData });
  } catch (err) {
    console.error('[API] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:email — validate session / get user data
app.get('/api/users/:email', async (req, res) => {
  try {
    const u = await User.findOne({ email: req.params.email }).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: u });
  } catch (err) {
    console.error('[API] Error fetching user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/swipes — record a swipe decision
app.post('/api/swipes', async (req, res) => {
  try {
    const { email, profileId, direction } = req.body;
    if (!email || !profileId || !direction) {
      return res.status(400).json({ error: 'email, profileId, and direction are required' });
    }

    // Upsert to avoid duplicates
    await Swipe.findOneAndUpdate(
      { email, profileId },
      { email, profileId, direction, timestamp: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[API] Swipe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/swipes/:email — get all swipe history for a user
app.get('/api/swipes/:email', async (req, res) => {
  try {
    const swipes = await Swipe.find({ email: req.params.email }).lean();
    res.json({ success: true, swipes });
  } catch (err) {
    console.error('[API] Error fetching swipes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/matches — save a match
app.post('/api/matches', async (req, res) => {
  try {
    const { email, profileId } = req.body;
    if (!email || profileId === undefined) {
      return res.status(400).json({ error: 'email and profileId are required' });
    }

    await Match.findOneAndUpdate(
      { email, profileId },
      { email, profileId, timestamp: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[API] Match error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/matches/:email — get all matches for a user
app.get('/api/matches/:email', async (req, res) => {
  try {
    const matches = await Match.find({ email: req.params.email }).lean();
    res.json({ success: true, matches });
  } catch (err) {
    console.error('[API] Error fetching matches:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/chats/:email — get all chat messages involving a user
app.get('/api/chats/:email', async (req, res) => {
  try {
    const chats = await Chat.find({
      $or: [{ from: req.params.email }, { to: req.params.email }]
    }).lean();
    res.json({ success: true, chats });
  } catch (err) {
    console.error('[API] Error fetching chats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/logout — log out user (clear session)
app.post('/api/logout', (req, res) => {
  console.log(`[LOGOUT] User logged out at ${new Date().toISOString()}`);
  res.json({ success: true, message: 'Logged out successfully' });
});

// --- Fallback: serve index.html for any non-API route ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== SOCKET.IO — Real-Time Chat =====
const onlineUsers = new Map(); // email -> socket.id

io.on('connection', (socket) => {
  let userEmail = null;

  // User identifies themselves after login
  socket.on('chat:join', (email) => {
    userEmail = email;
    socket.join(email);
    onlineUsers.set(email, socket.id);
    io.emit('user:online-list', Array.from(onlineUsers.keys()));
    console.log(`[SOCKET] ${email} connected (${socket.id})`);
  });

  // Send a chat message
  socket.on('chat:send', async (data) => {
    const msg = {
      from: data.from,
      to: data.to,
      text: data.text,
      timestamp: new Date()
    };

    // Persist to MongoDB
    try {
      await Chat.create(msg);
    } catch (err) {
      console.error('[CHAT] Error saving message:', err.message);
    }

    // Send to recipient's room
    io.to(data.to).emit('chat:receive', msg);
    io.to(data.from).emit('chat:receive', msg);
    console.log(`[CHAT] ${data.from} → ${data.to}: ${data.text.substring(0, 50)}`);
  });

  // Request chat history between two users
  socket.on('chat:history', async (data) => {
    try {
      const history = await Chat.find({
        $or: [
          { from: data.user1, to: data.user2 },
          { from: data.user2, to: data.user1 }
        ]
      }).sort({ timestamp: 1 }).lean();

      socket.emit('chat:history-response', { withUser: data.user2, messages: history });
    } catch (err) {
      console.error('[CHAT] Error fetching history:', err.message);
      socket.emit('chat:history-response', { withUser: data.user2, messages: [] });
    }
  });

  // Like a user (for mutual matching)
  socket.on('swipe:like', async (data) => {
    try {
      // Upsert the like
      await Like.findOneAndUpdate(
        { from: data.from, to: data.to },
        { from: data.from, to: data.to, timestamp: new Date() },
        { upsert: true }
      );
      console.log(`[LIKE] ${data.from} liked ${data.to}`);

      // Check for mutual like
      const mutualLike = await Like.findOne({ from: data.to, to: data.from });
      if (mutualLike) {
        console.log(`[MATCH] Mutual match: ${data.from} ↔ ${data.to}`);
        io.to(data.from).emit('match:mutual', { matchedWith: data.to });
        io.to(data.to).emit('match:mutual', { matchedWith: data.from });
      }
    } catch (err) {
      console.error('[LIKE] Error:', err.message);
    }
  });

  // Typing indicator
  socket.on('chat:typing', (data) => {
    io.to(data.to).emit('chat:typing', { from: data.from });
  });

  socket.on('chat:stop-typing', (data) => {
    io.to(data.to).emit('chat:stop-typing', { from: data.from });
  });

  socket.on('disconnect', () => {
    if (userEmail) {
      onlineUsers.delete(userEmail);
      io.emit('user:online-list', Array.from(onlineUsers.keys()));
      console.log(`[SOCKET] ${userEmail} disconnected`);
    }
  });
});

// --- Connect to MongoDB and start server ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('\n  ✖ MONGODB_URI not found in .env. Please add your MongoDB Atlas connection string.\n');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('  ✦ Connected to MongoDB Atlas');
    server.listen(PORT, () => {
      console.log(`  ✦ Parallel server running at http://localhost:${PORT}\n`);
    });
  })
  .catch(err => {
    console.error('  ✖ MongoDB connection error:', err.message);
    process.exit(1);
  });
