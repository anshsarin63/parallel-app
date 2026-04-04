// ===== report.js — Report & Block Module =====
// Depends on: app.js (showToast, PROFILES, currentDeck, matches, chatHistories, currentChatId, user)
//             swipe.js (buildDeck)
//             chat.js (buildMatchesGrid, buildChatList, closeChat)

let reportTarget = null;
let selectedReason = null;
let reportSource = 'profile'; // 'profile' or 'chat'

function openReport(profileId, profileName) {
  reportTarget = { id: profileId, name: profileName };
  reportSource = 'profile';
  selectedReason = null;
  document.querySelectorAll('.report-reason').forEach(r => r.classList.remove('selected'));
  document.getElementById('report-target-name').textContent = `Reporting: ${profileName}`;
  document.getElementById('report-modal').classList.add('open');
}

function selectReason(el) {
  document.querySelectorAll('.report-reason').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
  selectedReason = el.textContent.trim();
}

function closeReport() {
  document.getElementById('report-modal').classList.remove('open');
  reportTarget = null;
  selectedReason = null;
  reportSource = 'profile';
}

function openReportFromChat() {
  const p = PROFILES.find(x => x.id === currentChatId);
  if (p) {
    reportTarget = { id: p.id, name: p.name };
    reportSource = 'chat';
    selectedReason = null;
    document.querySelectorAll('.report-reason').forEach(r => r.classList.remove('selected'));
    document.getElementById('report-target-name').textContent = `Reporting: ${p.name}`;
    document.getElementById('report-modal').classList.add('open');
  }
}

async function submitReport() {
  if (!selectedReason) { showToast('Please select a reason 🚩'); return; }

  // Gather reported profile details
  const reportedProfile = PROFILES.find(p => p.id === reportTarget?.id) || {};

  // Build profile metadata
  const profileDetails = {
    id: reportedProfile.id,
    name: reportedProfile.name,
    age: reportedProfile.age,
    stage: reportedProfile.stage,
    city: reportedProfile.city || reportedProfile.fullCity,
    email: reportedProfile.email || null,
    bio: reportedProfile.bio,
    tags: reportedProfile.tags || [],
    isRegistered: reportedProfile.isRegistered || false
  };

  // If reported from chat, include the chat messages
  let chatMessages = [];
  if (reportSource === 'chat' && reportTarget?.id && chatHistories[reportTarget.id]) {
    chatMessages = chatHistories[reportTarget.id].map(msg => ({
      from: msg.from === 'me' ? user.name : reportedProfile.name,
      text: msg.text,
      timestamp: msg.timestamp || ''
    }));
  }

  // Send to backend
  try {
    const btn = document.querySelector('.report-submit');
    if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

    await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporterEmail: user.email,
        reporterName: user.name,
        reportedId: reportTarget?.id,
        reportedName: reportTarget?.name,
        reason: selectedReason,
        source: reportSource,
        profileDetails,
        chatMessages
      })
    });

    if (btn) { btn.textContent = 'Submit & Block'; btn.disabled = false; }
  } catch (e) {
    console.error('Report API error:', e);
    const btn = document.querySelector('.report-submit');
    if (btn) { btn.textContent = 'Submit & Block'; btn.disabled = false; }
  }

  closeReport();
  if (reportTarget) {
    currentDeck = currentDeck.filter(p => p.id !== reportTarget.id);
    matches = matches.filter(p => p.id !== reportTarget.id);
    delete chatHistories[reportTarget.id];
    buildDeck();
    buildMatchesGrid();
    buildChatList();
    if (currentChatId === reportTarget.id) closeChat();
  }
  showToast('✅ Reported & blocked. Our team will review this within 24 hours.');
}
