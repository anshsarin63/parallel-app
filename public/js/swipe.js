// ===== swipe.js — Swipe Deck & Match Module =====
// Depends on: app.js (PROFILES, currentDeck, matches, swipeCount, showToast, user)
//             chat.js (buildMatchesGrid, buildChatList, openChat)

let matchedChatToOpen = null;

// ===== DISTANCE CALCULATION =====
// Fallback coordinates for bot/hardcoded profiles that don't have stored lat/lng
const CITY_COORDS = {
  'Delhi': { lat: 28.6139, lng: 77.2090 },
  'Bangalore': { lat: 12.9716, lng: 77.5946 },
  'Mumbai': { lat: 19.0760, lng: 72.8777 },
  'Pune': { lat: 18.5204, lng: 73.8567 },
  'Hyderabad': { lat: 17.3850, lng: 78.4867 },
  'Kolkata': { lat: 22.5726, lng: 88.3639 },
  'Chennai': { lat: 13.0827, lng: 80.2707 },
  'Jaipur': { lat: 26.9124, lng: 75.7873 },
};

// Haversine formula — returns distance in km between two lat/lng pairs
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get coordinates for a profile — prefer stored lat/lng, fall back to city lookup
function getProfileCoords(profile) {
  if (profile.lat && profile.lng) return { lat: profile.lat, lng: profile.lng };
  // Fallback for bot profiles using city name
  const city = (profile.city || '').trim();
  return CITY_COORDS[city] || null;
}

function getDistanceLabel(profile) {
  // Need current user's coordinates
  if (!user.lat || !user.lng) return '';
  const pCoords = getProfileCoords(profile);
  if (!pCoords) return '';
  const km = haversineKm(user.lat, user.lng, pCoords.lat, pCoords.lng);
  if (km < 1) return 'Less than 1 km';
  if (km < 10) return `~${Math.round(km)} km`;
  return `~${Math.round(km).toLocaleString()} km`;
}

async function buildDeck() {
  const stack = document.getElementById('swipe-stack');
  stack.innerHTML = '';

  // Load swipe history from server and filter out already-swiped profiles
  if (user.email) {
    try {
      const res = await fetch(`/api/swipes/${encodeURIComponent(user.email)}`);
      const data = await res.json();
      if (data.swipes && data.swipes.length > 0) {
        const swipedIds = new Set(data.swipes.map(s => s.profileId));
        currentDeck = currentDeck.filter(p => !swipedIds.has(p.id));
      }
    } catch (e) {
      console.error('Failed to load swipe history:', e);
    }
  }

  if (currentDeck.length === 0) {
    stack.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:var(--muted)"><div style="font-size:3rem;margin-bottom:1rem">🔮</div><p style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:var(--cream)">You've seen everyone!</p><p style="font-size:0.85rem;margin-top:0.5rem">New profiles refresh daily.</p></div>`;
    const btns = document.getElementById('swipe-btns');
    if (btns) btns.style.display = 'none';
    return;
  }
  const btns = document.getElementById('swipe-btns');
  if (btns) btns.style.display = 'flex';
  const show = currentDeck.slice(0, 3);
  show.reverse().forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'scard';
    el.dataset.id = p.id;
    el.innerHTML = `
      <div class="like-stamp">CONNECT ✓</div>
      <div class="pass-stamp">PASS ✕</div>
      ${p.photo
        ? `<div class="scard-top" style="background:url('${p.photo}') center/cover no-repeat;"><div class="scard-gradient" style="background:linear-gradient(to top,rgba(0,0,0,0.45) 0%,transparent 60%)"></div><div class="scard-stage-badge">${p.stage.toUpperCase()}</div>${p.relocated ? '<div class="scard-relocated-badge">📦 New to City</div>' : ''}</div>`
        : `<div class="scard-top"><div class="scard-gradient" style="background:${p.gradient}"></div><div class="scard-stage-badge">${p.stage.toUpperCase()}</div>${p.relocated ? '<div class="scard-relocated-badge">📦 New to City</div>' : ''}<div class="scard-emoji">${p.emoji}</div></div>`
      }
      <div class="scard-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="scard-name">${p.name} <span style="font-size:0.9rem;font-weight:400;color:var(--muted)">${p.age}</span></div>
            <div class="scard-meta">📍 ${p.city}</div>
          </div>
          <button onclick="event.stopPropagation();openReport(${p.id},'${p.name}')" style="background:rgba(154,136,120,0.1);border:1px solid var(--border);border-radius:8px;padding:5px 9px;font-size:0.7rem;color:var(--muted);cursor:pointer;font-family:inherit;transition:all 0.2s" onmouseover="this.style.borderColor='#e05050';this.style.color='#e05050'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">🚩 Report</button>
        </div>
        <div class="scard-compat">
          <div class="compat-row"><span class="compat-lbl">COMPATIBILITY SCORE</span><span class="compat-val">${p.s1}%</span></div>
          <div class="compat-track"><div class="compat-fill2" style="width:${p.s1}%"></div></div>
        </div>
        <div class="scard-tags">${p.tags.map(t => `<span class="scard-tag">${t}</span>`).join('')}</div>
        <div class="scard-bio">${p.bio}</div>
      </div>
      ${getDistanceLabel(p) ? `<div class="scard-footer"><span class="scard-footer-icon">📍</span><span class="scard-footer-text">${getDistanceLabel(p)} away</span></div>` : ''}`;
    stack.appendChild(el);
  });
  setupDrag();
}

function setupDrag() {
  const card = document.querySelector('.scard:first-child');
  if (!card) return;
  let startX = 0, startY = 0, isDragging = false;
  const onDown = (e) => {
    isDragging = true;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    card.style.transition = 'none';
  };
  const onMove = (e) => {
    if (!isDragging) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const dx = cx - startX, dy = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx * 0.08}deg)`;
    const like = card.querySelector('.like-stamp'), pass = card.querySelector('.pass-stamp');
    like.style.opacity = Math.max(0, dx / 80);
    pass.style.opacity = Math.max(0, -dx / 80);
  };
  const onUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    const cx = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const dx = cx - startX;
    card.style.transition = 'transform 0.3s ease,opacity 0.3s';
    if (dx > 100) { doSwipe('like', card); }
    else if (dx < -100) { doSwipe('pass', card); }
    else {
      card.style.transform = '';
      card.querySelector('.like-stamp').style.opacity = 0;
      card.querySelector('.pass-stamp').style.opacity = 0;
    }
  };
  card.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  card.addEventListener('touchstart', onDown, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onUp);
}

function swipeCard(dir) {
  const card = document.querySelector('.scard:first-child');
  if (!card) return;
  card.style.transition = 'transform 0.4s ease,opacity 0.4s';
  doSwipe(dir, card);
}

function doSwipe(dir, card) {
  swipeCount++;
  document.getElementById('ps-swipes').textContent = swipeCount;
  const pid = parseInt(card.dataset.id);
  const profile = PROFILES.find(p => p.id === pid);

  // Persist swipe decision to server
  if (user.email) {
    fetch('/api/swipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, profileId: pid, direction: dir })
    }).catch(e => console.error('Failed to save swipe:', e));
  }

  if (dir === 'like' || dir === 'super') {
    card.style.transform = `translate(120%,0) rotate(20deg)`;
    card.querySelector('.like-stamp').style.opacity = 1;
    setTimeout(() => { card.remove(); currentDeck = currentDeck.filter(p => p.id !== pid); buildDeck(); }, 350);

    if (profile) {
      if (profile.isRegistered) {
        // Real user — send like via socket, wait for mutual match from server
        if (socket && user.email) {
          const targetEmail = findEmailForProfile(profile);
          socket.emit('swipe:like', { from: user.email, to: targetEmail });
          showToast(`💛 Liked ${profile.name}!`);
        }
      } else {
        // Bot/hardcoded profile — instant random match (keep existing behavior)
        const isMatch = Math.random() > 0.35;
        if (isMatch) {
          setTimeout(() => showMatch(profile), 400);
        }
      }
    }
  } else {
    card.style.transform = `translate(-120%,0) rotate(-20deg)`;
    card.querySelector('.pass-stamp').style.opacity = 1;
    setTimeout(() => { card.remove(); currentDeck = currentDeck.filter(p => p.id !== pid); buildDeck(); }, 350);
  }
}

// ===== MATCH =====
function showMatch(profile) {
  matches.push(profile);
  document.getElementById('ps-matches').textContent = matches.length;
  document.getElementById('match-name').textContent = profile.name;
  document.getElementById('match-popup-av').textContent = profile.emoji;
  document.getElementById('badge-matches').classList.add('show');
  document.getElementById('match-popup').classList.add('show');
  buildMatchesGrid();
  buildChatList();
  matchedChatToOpen = profile;
  saveSession(); // persist matches to localStorage

  // Persist match to server
  if (user.email) {
    fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, profileId: profile.id })
    }).catch(e => console.error('Failed to save match:', e));
  }
}

function closeMatch() {
  document.getElementById('match-popup').classList.remove('show');
}

function openChatFromMatch() {
  closeMatch();
  if (matchedChatToOpen) {
    openChat(matchedChatToOpen);
    switchTab('messages', document.getElementById('tab-messages'));
  }
}
