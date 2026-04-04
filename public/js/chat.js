// ===== chat.js — Real-Time Chat & Messaging Module =====
// Depends on: app.js (PROFILES, PROMPTS, user, matches, chatHistories, currentChatId, showToast, switchTab, socket)

// Track the email of the profile we're chatting with
let currentChatEmail = null;
let typingTimeout = null;

function buildMatchesGrid() {
  const grid = document.getElementById('matches-grid');
  grid.innerHTML = matches.map(p => `
    <div class="match-c" onclick="openChat(PROFILES.find(x=>x.id===${p.id}));switchTab('messages',document.getElementById('tab-messages'))">
      <div class="match-avatar"><span style="font-size:1.5rem">${p.emoji}</span><div class="match-online"></div></div>
      <div class="match-name">${p.name}</div>
      <div class="match-role">${p.stage} · ${p.city}</div>
      <div class="match-score">⭐ ${p.s2}% compatible</div>
      <div class="match-msg">${chatHistories[p.id] && chatHistories[p.id].length ? chatHistories[p.id][chatHistories[p.id].length - 1].text : 'Start a conversation!'}</div>
    </div>`).join('');
}

function buildChatList() {
  const list = document.getElementById('chat-list');
  list.innerHTML = matches.map(p => {
    const hist = chatHistories[p.id];
    const last = hist && hist.length ? hist[hist.length - 1] : null;
    const unread = last && last.from === 'them';
    if (unread) document.getElementById('badge-msgs').classList.add('show');
    return `<div class="chat-item${unread ? ' unread' : ''}" onclick="openChat(PROFILES.find(x=>x.id===${p.id}))">
      <div class="chat-av"><span>${p.emoji}</span><div class="online-dot"></div></div>
      <div class="chat-info">
        <div class="chat-name-row"><span class="chat-name">${p.name}</span><span class="chat-time">${last ? formatTime(last.timestamp) : ''}</span></div>
        <div class="chat-preview">${last ? last.text : 'You matched! Say hello 👋'}</div>
      </div>
      ${unread ? '<div class="unread-badge">1</div>' : ''}
    </div>`;
  }).join('');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function openChat(p) {
  if (!p) return;
  currentChatId = p.id;

  // Find the email for this profile — registered users have emails in their data
  // For hardcoded profiles, use their id as a pseudo-email
  currentChatEmail = findEmailForProfile(p);

  document.getElementById('cw-avatar').textContent = p.emoji;
  document.getElementById('cw-name').textContent = p.name;

  // Initialize local history if not present
  if (!chatHistories[p.id]) chatHistories[p.id] = [];

  // Request chat history from server
  if (socket && user.email && currentChatEmail) {
    socket.emit('chat:history', { user1: user.email, user2: currentChatEmail });
  }

  renderMsgs();
  renderPrompts();
  document.getElementById('chat-window').classList.add('open');
  document.getElementById('cw-typing').style.display = 'none';
}

function findEmailForProfile(p) {
  // If profile is registered (id >= 1000), look up email from users data
  if (p.isRegistered && p.email) return p.email;
  // For hardcoded profiles, use "profile_<id>@parallel" as a stable identifier
  return `profile_${p.id}@parallel`;
}

function renderMsgs() {
  const hist = chatHistories[currentChatId] || [];
  const box = document.getElementById('cw-msgs');
  box.innerHTML = hist.map(m => `
    <div class="msg ${m.from === 'me' ? 'me' : 'them'}">
      <div class="msg-bubble">${m.text}</div>
      <div class="msg-time">${m.from === 'me' ? 'You' : ''}${m.timestamp ? ' · ' + formatTime(m.timestamp) : ''}</div>
    </div>`).join('');
  setTimeout(() => box.scrollTop = box.scrollHeight, 50);
}

function renderPrompts() {
  const chips = document.getElementById('prompt-chips');
  const hist = chatHistories[currentChatId] || [];
  // Only show prompts if no messages sent yet
  if (hist.some(m => m.from === 'me')) {
    chips.innerHTML = '';
    return;
  }
  chips.innerHTML = PROMPTS.map(p => `<button class="prompt-chip" onclick="sendPrompt('${p.replace(/'/g, "\\'")}')" >💬 ${p}</button>`).join('');
}

function sendPrompt(txt) {
  sendMsgText(txt);
}

function sendMsg() {
  const inp = document.getElementById('cw-input');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  sendMsgText(txt);

  // Stop typing indicator
  if (socket && currentChatEmail) {
    socket.emit('chat:stop-typing', { from: user.email, to: currentChatEmail });
  }
}

function sendMsgText(txt) {
  if (!chatHistories[currentChatId]) chatHistories[currentChatId] = [];

  const timestamp = new Date().toISOString();

  // Add to local history immediately
  chatHistories[currentChatId].push({ from: 'me', text: txt, timestamp });
  renderMsgs();
  document.getElementById('prompt-chips').innerHTML = '';

  // Send via socket
  if (socket && user.email && currentChatEmail) {
    socket.emit('chat:send', {
      from: user.email,
      to: currentChatEmail,
      text: txt
    });
  }
}

// Handle incoming real-time messages
function handleIncomingMessage(msg) {
  // Determine which profile sent this message
  const senderProfile = findProfileByEmail(msg.from);
  if (!senderProfile) return;

  const pid = senderProfile.id;
  if (!chatHistories[pid]) chatHistories[pid] = [];

  // Check if this message is from us (echo) or from the other person
  if (msg.from === user.email) {
    // This is our own echo — skip if we already added it locally
    return;
  }

  // Message from other person
  chatHistories[pid].push({ from: 'them', text: msg.text, timestamp: msg.timestamp });

  // If we're viewing this chat, re-render
  if (currentChatId === pid) {
    renderMsgs();
    document.getElementById('cw-typing').style.display = 'none';
  }

  // Update chat list and matches grid
  buildChatList();
  buildMatchesGrid();

  // Show notification if not viewing this chat
  if (currentChatId !== pid) {
    document.getElementById('badge-msgs').classList.add('show');
    showToast(`💬 ${senderProfile.name}: ${msg.text.substring(0, 40)}...`);
  }
}

// Handle chat history response from server
function handleChatHistory(data) {
  // data: { withUser, messages }
  const profile = findProfileByEmail(data.withUser);
  if (!profile) return;

  const pid = profile.id;
  // Convert server messages to local format
  chatHistories[pid] = data.messages.map(m => ({
    from: m.from === user.email ? 'me' : 'them',
    text: m.text,
    timestamp: m.timestamp
  }));

  // If we're viewing this chat, re-render
  if (currentChatId === pid) {
    renderMsgs();
  }
}

// Handle typing indicators
function handleTyping(data) {
  const profile = findProfileByEmail(data.from);
  if (!profile || currentChatId !== profile.id) return;

  const el = document.getElementById('cw-typing');
  el.textContent = `${profile.name.split(' ')[0]} is typing...`;
  el.style.display = 'block';

  // Auto-hide after 3s
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

function handleStopTyping(data) {
  const profile = findProfileByEmail(data.from);
  if (!profile || currentChatId !== profile.id) return;
  document.getElementById('cw-typing').style.display = 'none';
}

// Find a profile by email
function findProfileByEmail(email) {
  // Check registered users first (email stored in user data)
  // For hardcoded profiles, email is "profile_<id>@parallel"
  if (email.startsWith('profile_') && email.endsWith('@parallel')) {
    const id = parseInt(email.split('_')[1].split('@')[0]);
    return PROFILES.find(p => p.id === id);
  }
  // For registered users, look through profiles
  return PROFILES.find(p => p.email === email);
}

// Input typing detection
function setupTypingDetection() {
  const inp = document.getElementById('cw-input');
  let isTyping = false;

  inp.addEventListener('input', () => {
    if (!socket || !currentChatEmail || !user.email) return;

    if (!isTyping) {
      isTyping = true;
      socket.emit('chat:typing', { from: user.email, to: currentChatEmail });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
      socket.emit('chat:stop-typing', { from: user.email, to: currentChatEmail });
    }, 1500);
  });
}

function closeChat() {
  document.getElementById('chat-window').classList.remove('open');
  document.getElementById('cw-typing').style.display = 'none';
  currentChatId = null;
  currentChatEmail = null;
}
