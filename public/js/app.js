// ===== app.js — Core Application Module =====
// This is loaded first. It defines shared state, fetches data from the API,
// and handles onboarding, navigation, profile, toasts, and the landing page demo.

// ===== SHARED STATE =====
let PROFILES = [];
let PROMPTS = [];
let AUTO_REPLIES = {};
let DEMO_DATA = [];

let user = { name: '', email: '', password: '', photo: '', dob: '', gender: '', stage: '', city: '', lat: null, lng: null, interests: [], energy: '', bio: '', relocated: false };
let matches = [];
let currentDeck = [];
let swipeCount = 0;
let currentChatId = null;
let chatHistories = {};
let socket = null;
let faceModelsLoaded = false;

// Load face-api models asynchronously
async function loadFaceModels() {
  try {
    if (typeof faceapi === 'undefined') {
      // face-api.js is loading asynchronously, wait and try again
      setTimeout(loadFaceModels, 100);
      return;
    }
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    faceModelsLoaded = true;
    console.log('[FaceAPI] Models loaded successfully.');
  } catch (err) {
    console.error('[FaceAPI] Failed to load models:', err);
  }
}
loadFaceModels();

// ===== FETCH DATA FROM BACKEND =====
// Generic auto-replies for registered users
const GENERIC_REPLIES = [
  "Hey! So cool to connect 😊 What are you working on these days?",
  "That's really interesting! I'd love to hear more about it.",
  "We should totally meet up sometime! ☕",
  "I feel the same way! It's great connecting with like-minded people.",
  "That's awesome! Let's chat more about this 🙌"
];

async function loadAppData(excludeEmail = '', filterCity = '') {
  try {
    const params = new URLSearchParams();
    if (excludeEmail) params.set('email', excludeEmail);
    if (filterCity) params.set('city', filterCity);
    const profileUrl = params.toString()
      ? `/api/profiles?${params.toString()}`
      : '/api/profiles';

    const [profilesRes, promptsRes, repliesRes] = await Promise.all([
      fetch(profileUrl),
      fetch('/api/prompts'),
      fetch('/api/auto-replies')
    ]);
    const profilesData = await profilesRes.json();
    const promptsData = await promptsRes.json();
    const repliesData = await repliesRes.json();

    PROFILES = profilesData.profiles;
    DEMO_DATA = profilesData.demoData;
    PROMPTS = promptsData.prompts;
    AUTO_REPLIES = repliesData.autoReplies;

    // Generate auto-replies for registered users (IDs 1000+)
    PROFILES.forEach(p => {
      if (p.id >= 1000 && !AUTO_REPLIES[p.id]) {
        AUTO_REPLIES[p.id] = [...GENERIC_REPLIES];
      }
    });

    currentDeck = [...PROFILES];

    // Start landing page demo cycle
    startDemoCycle();
  } catch (e) {
    console.error('Failed to load app data:', e);
  }
}

// ===== PHOTO UPLOAD (with compression) =====
function previewPhoto(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = async () => {
      const errorEl = document.getElementById('photo-error');
      if (errorEl) errorEl.style.display = 'none';

      // Verify a human face is present
      if (faceModelsLoaded) {
        document.getElementById('upload-placeholder').innerHTML = '<div class="upload-hint">Scanning face...</div>';
        try {
          const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions());
          if (detections.length === 0) {
            if (errorEl) errorEl.style.display = 'block';
            input.value = ''; // Clear file input
            document.getElementById('upload-placeholder').innerHTML = '<div class="upload-icon">📷</div><div class="upload-hint">Tap to add<br>your photo</div>';
            return;
          }
        } catch (err) {
          console.error('[FaceAPI] Detection failed:', err);
        }
      }

      // Resize to max 600px on longest side
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.7);
      user.photo = compressed;
      const preview = document.getElementById('photo-preview');
      preview.src = compressed;
      preview.style.display = 'block';
      document.getElementById('upload-placeholder').style.display = 'none';
      document.getElementById('photo-area').style.border = '2.5px solid var(--gold)';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function selectGender(el) {
  document.querySelectorAll('.gender-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  user.gender = el.textContent.trim();
}

// ===== GEOLOCATION: Auto-detect user's city =====
let locationDetected = false;

async function detectLocation() {
  const statusEl = document.getElementById('location-status');
  const resultEl = document.getElementById('location-result');
  const retryBtn = document.getElementById('location-retry-btn');
  const spinnerEl = document.getElementById('location-spinner');
  const hiddenInput = document.getElementById('ob-city');
  const manualContainer = document.getElementById('manual-location-container');

  // Reset UI
  statusEl.style.display = 'block';
  statusEl.innerHTML = '<span id="location-spinner" style="display:inline-block;animation:spin 1s linear infinite">📍</span> Detecting your location...';
  resultEl.style.display = 'none';
  retryBtn.style.display = 'none';
  manualContainer.style.display = 'none';
  locationDetected = false;

  if (!navigator.geolocation) {
    statusEl.innerHTML = '⚠️ Geolocation is not supported by your browser.';
    retryBtn.style.display = 'inline-block';
    manualContainer.style.display = 'block';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        // Reverse geocode using OpenStreetMap Nominatim (free, no API key needed)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        const addr = data.address || {};

        // Extract city: try city, then town, then county, then state
        const city = addr.city || addr.town || addr.county || addr.state_district || addr.state || 'Unknown';
        const area = addr.suburb || addr.neighbourhood || addr.city_district || '';

        // Build the display and stored value
        const cityDisplay = area ? `${area}, ${city}` : city;

        hiddenInput.value = cityDisplay;
        user.city = cityDisplay;
        user.lat = latitude;
        user.lng = longitude;
        locationDetected = true;

        statusEl.style.display = 'none';
        resultEl.style.display = 'block';
        resultEl.innerHTML = `📍 <span style="color:var(--gold)">${cityDisplay}</span>`;
        retryBtn.style.display = 'none';
        manualContainer.style.display = 'none';

        showToast(`📍 Location detected: ${city}`);
      } catch (err) {
        console.error('Reverse geocoding failed:', err);
        statusEl.innerHTML = '⚠️ Could not determine your city. Please try again or enter manually.';
        retryBtn.style.display = 'inline-block';
        manualContainer.style.display = 'block';
      }
    },
    (error) => {
      console.error('Geolocation error:', error);
      let msg = '⚠️ Could not detect your location. Please enter it manually.';
      if (error.code === 1) msg = '⚠️ Location permission denied. Please enter manually.';
      if (error.code === 2) msg = '⚠️ Location unavailable. Please enter manually.';
      if (error.code === 3) msg = '⚠️ Location detection timed out. Please enter manually.';
      statusEl.innerHTML = msg;
      retryBtn.style.display = 'inline-block';
      manualContainer.style.display = 'block';
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

function saveManualLocation() {
  const manualCity = document.getElementById('manual-city').value.trim();
  if (!manualCity) {
    showToast('Please enter your city name 🌆');
    return;
  }
  
  const hiddenInput = document.getElementById('ob-city');
  const statusEl = document.getElementById('location-status');
  const resultEl = document.getElementById('location-result');
  const manualContainer = document.getElementById('manual-location-container');
  const retryBtn = document.getElementById('location-retry-btn');

  hiddenInput.value = manualCity;
  user.city = manualCity;
  // Default lat/lng to roughly center of India/world if manual to prevent null errors later
  user.lat = 0; 
  user.lng = 0; 
  locationDetected = true;

  statusEl.style.display = 'none';
  resultEl.style.display = 'block';
  resultEl.innerHTML = `📍 <span style="color:var(--gold)">${manualCity}</span> (Manual)`;
  retryBtn.style.display = 'inline-block';
  retryBtn.innerHTML = '📍 Edit/Retry Location';
  manualContainer.style.display = 'none';

  showToast(`📍 Location set manually: ${manualCity}`);
}

// ===== ONBOARDING =====
function obNext(step) {
  if (step === 1) {
    const n = document.getElementById('ob-name').value.trim();
    if (!n) { showToast('Please enter your name 😊'); return; }
    const e = document.getElementById('ob-email').value.trim();
    if (!e || !e.includes('@')) { showToast('Enter a valid email 📧'); return; }
    const p = document.getElementById('ob-password').value;
    if (!p || p.length < 6) { showToast('Password must be at least 6 characters 🔒'); return; }
    
    const btn = document.getElementById('ob-btn-1');
    btn.innerHTML = 'Sending Code...';
    btn.disabled = true;

    fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e })
    })
    .then(res => res.json())
    .then(data => {
      btn.innerHTML = 'Continue →';
      btn.disabled = false;
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      user.name = n; user.email = e; user.password = p;
      document.getElementById('welcome-name').textContent = n;
      document.getElementById('verify-email-display').textContent = e;
      document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
      document.getElementById('ob-verify').classList.add('active');
      startResendTimer();
    })
    .catch(err => {
      console.error(err);
      btn.innerHTML = 'Continue →';
      btn.disabled = false;
      showToast('Server error. Please try again.', 'error');
    });
    return; // Don't auto-proceed
  }

  if (step === 2) {
    const dob = document.getElementById('ob-dob').value;
    if (!dob) { showToast('Add your date of birth 🎂'); return; }
    if (!user.gender) { showToast('Select your gender 👤'); return; }
    user.dob = dob;
    if (user.photo) {
      const fin = document.getElementById('ob-final-photo');
      fin.innerHTML = `<img src="${user.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
    // Auto-detect location when entering step 3
    setTimeout(() => detectLocation(), 300);
  }
  if (step === 3) {
    const s = document.querySelector('#stage-chips .selected');
    if (!s) { showToast('Pick your life stage 🎯'); return; }
    
    let stageText = s.textContent.trim();
    if (stageText.includes('Professional')) {
      const prof = document.getElementById('ob-profession').value.trim();
      if (prof) {
        stageText = `Professional (${prof})`;
      } else {
        stageText = 'Professional';
      }
    }
    user.stage = stageText;

    const c = document.getElementById('ob-city').value;
    if (!c) { showToast('Waiting for location detection... 📍'); return; }
    user.city = c;
  }
  if (step === 4) {
    const sel = [...document.querySelectorAll('#interest-chips .selected')];
    if (sel.length < 2) { showToast('Pick at least 2 interests ✨'); return; }
    user.interests = sel.map(e => e.textContent.trim());
  }
  if (step === 5) {
    const e = document.querySelector('#energy-chips .selected');
    if (!e) { showToast('Pick your energy style ⚡'); return; }
    user.energy = e.textContent.trim();
    user.bio = document.getElementById('ob-bio').value.trim();
    // Update final step with detected city
    const finalCityEl = document.getElementById('ob-final-city');
    if (finalCityEl && user.city) finalCityEl.textContent = user.city;
  }
  document.getElementById('ob' + step).classList.remove('active');
  document.getElementById('ob' + (step + 1)).classList.add('active');
}

let resendInterval;
function startResendTimer() {
  const resendBtn = document.getElementById('resend-btn');
  if (!resendBtn) return;
  
  resendBtn.disabled = true;
  resendBtn.style.opacity = '0.5';
  resendBtn.style.cursor = 'not-allowed';
  
  let timeLeft = 30;
  resendBtn.innerHTML = `Resend Code (${timeLeft}s)`;
  
  clearInterval(resendInterval);
  resendInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(resendInterval);
      resendBtn.disabled = false;
      resendBtn.style.opacity = '1';
      resendBtn.style.cursor = 'pointer';
      resendBtn.innerHTML = 'Resend Code';
    } else {
      resendBtn.innerHTML = `Resend Code (${timeLeft}s)`;
    }
  }, 1000);
}

async function verifyEmailCode() {
  const code = document.getElementById('ob-verify-code').value.trim();
  if (!code || code.length !== 6) {
    showToast('Please enter the 6-digit code', 'error');
    return;
  }

  const btn = document.getElementById('ob-btn-verify');
  btn.innerHTML = 'Verifying...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, code })
    });
    const data = await res.json();
    btn.innerHTML = 'Verify Code';
    btn.disabled = false;

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    
    // Success! Proceed to Step 2
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    document.getElementById('ob2').classList.add('active');
    showToast('Email verified successfully! ✅');
  } catch (err) {
    console.error(err);
    btn.innerHTML = 'Verify Code';
    btn.disabled = false;
    showToast('Server error. Please try again.', 'error');
  }
}

async function resendVerificationCode() {
  if (!user.email) return;
  showToast('Resending code...');
  
  const resendBtn = document.getElementById('resend-btn');
  resendBtn.disabled = true;

  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email })
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, 'error');
      resendBtn.disabled = false;
    } else {
      showToast('New code sent to your email! 📧');
      startResendTimer();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to resend code.', 'error');
    resendBtn.disabled = false;
  }
}

function selectChip(el, group) {
  if (group === 'stage' || group === 'energy') {
    document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
  } else {
    el.classList.toggle('selected');
  }

  if (group === 'stage') {
    const profField = document.getElementById('profession-field');
    if (profField) {
      if (el.textContent.includes('Professional')) {
        profField.style.display = 'block';
      } else {
        profField.style.display = 'none';
      }
    }
  }
}

function startOnboarding() {
  document.getElementById('ob-screen').classList.remove('hidden');
}

function cancelOnboarding() {
  document.getElementById('ob-screen').classList.add('hidden');
}

// ===== LOGIN =====
function openLogin() {
  document.getElementById('login-modal').classList.add('open');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
  setTimeout(() => document.getElementById('login-email').focus(), 100);
}

function closeLogin() {
  document.getElementById('login-modal').classList.remove('open');
}

async function submitLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-submit-btn');

  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Please enter a valid email address.';
    errorEl.style.display = 'block';
    return;
  }
  if (!password) {
    errorEl.textContent = 'Please enter your password.';
    errorEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Logging in...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      errorEl.textContent = errData.error || 'Invalid email or password. Try again!';
      errorEl.style.display = 'block';
      btn.textContent = 'Log In →';
      btn.disabled = false;
      return;
    }

    const data = await res.json();
    const u = data.user;

    // Populate user state from server data
    user.name = u.name || '';
    user.email = u.email || '';
    user.dob = u.dob || '';
    user.gender = u.gender || '';
    user.stage = u.stage || '';
    user.city = u.city || '';
    user.lat = u.lat || null;
    user.lng = u.lng || null;
    user.interests = u.interests || [];
    user.energy = u.energy || '';
    user.bio = u.bio || '';
    user.photo = u.photo || '';
    user.relocated = u.relocated || false;

    // Close login modal
    closeLogin();

    // Load profiles excluding self
    await loadAppData(user.email, user.city);

    // Restore matches and chats from server
    await restoreMatchesAndChats();

    // Switch to app view
    document.getElementById('landing').classList.remove('active');
    document.getElementById('app').classList.add('active');
    document.getElementById('app').style.display = 'flex';
    buildProfile();
    await buildDeck();
    initSocket();
    buildMatchesGrid();
    buildChatList();
    saveSession();

    showToast(`Welcome back, ${user.name}! 👋`);
  } catch (err) {
    console.error('Login error:', err);
    errorEl.textContent = 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
  }

  btn.textContent = 'Log In →';
  btn.disabled = false;
}

async function launchApp() {
  // Save user to backend
  try {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        password: user.password,
        dob: user.dob,
        gender: user.gender,
        stage: user.stage,
        city: user.city,
        lat: user.lat,
        lng: user.lng,
        interests: user.interests,
        energy: user.energy,
        bio: user.bio,
        photo: user.photo || null,
        relocated: user.relocated || false
      })
    });
  } catch (err) {
    console.error('Failed to save user:', err);
  }

  // Reload profiles excluding the current user, filtered to same city
  await loadAppData(user.email, user.city);

  document.getElementById('ob-screen').classList.add('hidden');
  document.getElementById('landing').classList.remove('active');
  document.getElementById('app').classList.add('active');
  document.getElementById('app').style.display = 'flex';
  buildProfile();
  buildDeck();
  initSocket();
  saveSession();
}

// ===== SOCKET.IO INITIALIZATION =====
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('[SOCKET] Connected:', socket.id);
    socket.emit('chat:join', user.email);
  });

  // Incoming chat message
  socket.on('chat:receive', (msg) => {
    handleIncomingMessage(msg);
  });

  // Chat history response
  socket.on('chat:history-response', (data) => {
    handleChatHistory(data);
  });

  // Typing indicators
  socket.on('chat:typing', (data) => {
    handleTyping(data);
  });

  socket.on('chat:stop-typing', (data) => {
    handleStopTyping(data);
  });

  // Online presence
  socket.on('user:online-list', (emails) => {
    console.log('[SOCKET] Online users:', emails);
  });

  // Mutual match — server confirmed both users liked each other
  socket.on('match:mutual', (data) => {
    // data: { matchedWith } — email of the matched user
    const profile = findProfileByEmail(data.matchedWith);
    if (profile && !matches.some(m => m.id === profile.id)) {
      showMatch(profile);
      showToast(`🎉 It's a match with ${profile.name}!`, true);
      console.log(`[MATCH] Mutual match with ${profile.name} (${data.matchedWith})`);
    }
  });

  // Set up typing detection on chat input
  setupTypingDetection();
}

// ===== SESSION PERSISTENCE =====
function saveSession() {
  localStorage.setItem('parallel_user', JSON.stringify(user));
  localStorage.setItem('parallel_matches', JSON.stringify(matches.map(m => m.id)));
}

async function restoreMatchesAndChats() {
  if (!user.email) return;

  // Restore matches from server
  try {
    const matchRes = await fetch(`/api/matches/${encodeURIComponent(user.email)}`);
    const matchData = await matchRes.json();
    if (matchData.matches && matchData.matches.length > 0) {
      const matchIds = matchData.matches.map(m => m.profileId);
      matches = matchIds.map(id => PROFILES.find(p => p.id === id)).filter(Boolean);
    }
  } catch (e) {
    console.error('Failed to restore matches:', e);
  }

  // Restore chat histories from server
  try {
    const chatRes = await fetch(`/api/chats/${encodeURIComponent(user.email)}`);
    const chatData = await chatRes.json();
    if (chatData.chats && chatData.chats.length > 0) {
      // Group by conversation partner and convert to local format
      chatHistories = {};
      chatData.chats.forEach(msg => {
        const partnerEmail = msg.from === user.email ? msg.to : msg.from;
        const partnerProfile = findProfileByEmail(partnerEmail);
        if (!partnerProfile) return;
        const pid = partnerProfile.id;
        if (!chatHistories[pid]) chatHistories[pid] = [];
        chatHistories[pid].push({
          from: msg.from === user.email ? 'me' : 'them',
          text: msg.text,
          timestamp: msg.timestamp
        });
      });
    }
  } catch (e) {
    console.error('Failed to restore chats:', e);
  }
}

async function restoreSession() {
  const saved = localStorage.getItem('parallel_user');
  if (!saved) return false;

  const savedUser = JSON.parse(saved);
  if (!savedUser.email) return false;

  // Validate session against backend
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(savedUser.email)}`);
    if (!res.ok) {
      localStorage.removeItem('parallel_user');
      localStorage.removeItem('parallel_matches');
      return false;
    }
    const data = await res.json();
    // Restore user state from saved data (keep photo from localStorage since backend doesn't store it)
    user = { ...savedUser };
    // Also update from server data in case anything changed
    user.name = data.user.name || savedUser.name;
    user.dob = data.user.dob || savedUser.dob;
    user.gender = data.user.gender || savedUser.gender;
    user.stage = data.user.stage || savedUser.stage;
    user.city = data.user.city || savedUser.city;
    user.lat = data.user.lat || savedUser.lat || null;
    user.lng = data.user.lng || savedUser.lng || null;
    user.interests = data.user.interests || savedUser.interests;
    user.energy = data.user.energy || savedUser.energy;
    user.bio = data.user.bio || savedUser.bio;
    user.photo = data.user.photo || savedUser.photo || '';
    user.relocated = data.user.relocated || false;
  } catch {
    return false;
  }

  // Load profiles (excluding self, filtered to same city)
  await loadAppData(user.email, user.city);

  // Restore matches and chats from server
  await restoreMatchesAndChats();

  // Switch to app view
  document.getElementById('landing').classList.remove('active');
  document.getElementById('app').classList.add('active');
  document.getElementById('app').style.display = 'flex';
  buildProfile();
  await buildDeck();
  initSocket();
  buildMatchesGrid();
  buildChatList();
  saveSession();

  console.log(`[SESSION] Restored session for ${user.name} (${user.email})`);
  return true;
}

// ===== PROFILE =====
function calcAge(dob) {
  if (!dob) return '';
  const b = new Date(dob), now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

function buildProfile() {
  const age = calcAge(user.dob);
  document.getElementById('profile-name').textContent = (user.name || 'You') + (age ? ' · ' + age : '');
  document.getElementById('profile-role').textContent = (user.stage || 'User') + ' · ' + (user.city || 'Your City');
  document.getElementById('profile-gender').textContent = user.gender || 'Not set';
  document.getElementById('profile-bio').textContent = user.bio || 'No bio yet.';
  document.getElementById('profile-energy').textContent = user.energy || 'Not set';
  document.getElementById('relocated-toggle').checked = user.relocated || false;
  const tags = document.getElementById('profile-tags');
  tags.innerHTML = (user.interests || []).map(t => `<span class="ptag">${t}</span>`).join('');
  const av = document.getElementById('profile-av');
  if (user.photo) {
    av.innerHTML = `<img src="${user.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
}

async function toggleRelocated() {
  user.relocated = document.getElementById('relocated-toggle').checked;
  saveSession();
  // Persist to server
  try {
    await fetch('/api/users/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, relocated: user.relocated })
    });
    showToast(user.relocated ? '📦 Marked as recently relocated!' : 'Relocated status removed');
  } catch (e) {
    console.error('Failed to update relocated status:', e);
  }
}

// ===== TABS =====
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab + '-body').classList.add('active');
  if (tab === 'matches') { document.getElementById('badge-matches').classList.remove('show'); buildMatchesGrid(); }
  if (tab === 'messages') { document.getElementById('badge-msgs').classList.remove('show'); buildChatList(); }
}

// ===== LANDING NAV =====
function showLanding() {
  document.getElementById('app').classList.remove('active');
  document.getElementById('app').style.display = 'none';
  document.getElementById('landing').classList.add('active');
}

// ===== TOAST =====
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ===== WAITLIST =====
async function joinWL() {
  const e = document.getElementById('cta-email').value.trim();
  if (!e || !e.includes('@')) {
    document.getElementById('cta-email').style.borderColor = 'rgba(255,255,255,0.6)';
    return;
  }

  // Send to backend
  try {
    await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e })
    });
  } catch (err) {
    console.error('Waitlist API error:', err);
  }

  document.querySelector('.email-form').style.display = 'none';
  document.getElementById('cta-success').style.display = 'block';
}

// ===== DEMO CYCLE (landing phone) =====
let di = 0;
function cycleDemo() {
  if (!DEMO_DATA.length) return;
  di = (di + 1) % DEMO_DATA.length;
  const d = DEMO_DATA[di];
  document.getElementById('demo-av').textContent = d.emoji;
  document.getElementById('demo-name').textContent = d.name;
  document.getElementById('demo-meta').textContent = d.meta;
  document.getElementById('demo-s1').textContent = d.s1 + '%';
  document.getElementById('demo-s2').textContent = d.s2 + '%';
  document.getElementById('demo-f1').style.width = d.s1 + '%';
  document.getElementById('demo-f2').style.width = d.s2 + '%';
  document.getElementById('demo-tags').innerHTML = d.tags.map(t => `<span class="ptag">${t}</span>`).join('');
}

function startDemoCycle() {
  setInterval(cycleDemo, 3000);
}

function demoLike() {
  showToast('Join Cohive to connect! ✨');
  setTimeout(() => startOnboarding(), 600);
}

// ===== LOGOUT =====
function logoutUser() {
  // Show the confirmation modal
  document.getElementById('logout-modal').classList.add('open');
}

function cancelLogout() {
  document.getElementById('logout-modal').classList.remove('open');
}

async function confirmLogout() {
  document.getElementById('logout-modal').classList.remove('open');

  // Call backend logout
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout API error:', err);
  }

  // Disconnect socket
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // Reset all client-side state
  user = { name: '', email: '', password: '', photo: '', dob: '', gender: '', stage: '', city: '', lat: null, lng: null, interests: [], energy: '', bio: '', relocated: false };
  matches = [];
  currentDeck = [...PROFILES];
  swipeCount = 0;
  currentChatId = null;
  chatHistories = {};

  // Clear saved session
  localStorage.removeItem('parallel_user');
  localStorage.removeItem('parallel_matches');

  // Reset onboarding form
  document.getElementById('ob-name').value = '';
  document.getElementById('ob-email').value = '';
  document.getElementById('ob-password').value = '';
  document.getElementById('ob-dob').value = '';
  document.getElementById('ob-bio').value = '';
  document.getElementById('ob-city').value = '';
  // Reset location detection UI
  const locStatus = document.getElementById('location-status');
  const locResult = document.getElementById('location-result');
  const locRetry = document.getElementById('location-retry-btn');
  if (locStatus) { locStatus.style.display = 'block'; locStatus.innerHTML = '<span id="location-spinner" style="display:inline-block;animation:spin 1s linear infinite">📍</span> Detecting your location...'; }
  if (locResult) locResult.style.display = 'none';
  if (locRetry) locRetry.style.display = 'none';
  locationDetected = false;
  document.querySelectorAll('.chip.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.gender-chip.selected').forEach(c => c.classList.remove('selected'));
  const photoPreview = document.getElementById('photo-preview');
  photoPreview.style.display = 'none';
  photoPreview.src = '';
  document.getElementById('upload-placeholder').style.display = '';
  document.getElementById('photo-area').style.border = '';

  // Reset onboarding steps back to step 1
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  document.getElementById('ob1').classList.add('active');

  // Close chat window if open
  const chatWindow = document.getElementById('chat-window');
  if (chatWindow) chatWindow.classList.remove('open');

  // Hide app, show landing
  document.getElementById('app').classList.remove('active');
  document.getElementById('app').style.display = 'none';
  document.getElementById('landing').classList.add('active');

  // Reset active tab to discover
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-discover').classList.add('active');
  document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-discover-body').classList.add('active');

  showToast('Logged out successfully 👋');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Try to restore existing session first
  const restored = await restoreSession();
  if (!restored) {
    // No session — load data for landing page demo
    await loadAppData();
  }
});

// ===== PRIVACY & SCREENSHOT MITIGATIONS =====
const appContainer = document.getElementById('app');

// 1. Obscure screen when window loses focus (e.g. Snipping tool active)
window.addEventListener('blur', () => {
  if (appContainer.classList.contains('active')) {
    appContainer.classList.add('obscured');
  }
});

window.addEventListener('focus', () => {
  appContainer.classList.remove('obscured');
});

// 2. Prevent keyboard shortcuts commonly used for screenshots
document.addEventListener('keydown', (e) => {
  // Prevent PrintScreen or Mac's Cmd+Shift+S / Cmd+Shift+3 / Cmd+Shift+4
  if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey)) {
    if (appContainer.classList.contains('active')) {
      appContainer.classList.add('obscured');
      showToast('⚠️ Screenshots are disabled for privacy.', 'error');
      navigator.clipboard.writeText(''); // Attempt to clear clipboard
      
      // Auto-remove obscure after 3 seconds
      setTimeout(() => {
        appContainer.classList.remove('obscured');
      }, 3000);
    }
  }
});

// 3. Prevent right-clicking on images/content inside the app to save them
document.addEventListener('contextmenu', (e) => {
  if (appContainer.classList.contains('active')) {
    e.preventDefault();
  }
});
