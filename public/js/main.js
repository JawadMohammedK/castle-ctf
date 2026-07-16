// main.js

async function checkAuth() {
  try {
    const res  = await fetch('/api/me');
    const data = await res.json();
    if (data.username) {
      document.getElementById('nav-user')?.classList.remove('hidden');
      document.getElementById('nav-user').textContent = `⚔ ${data.username}  [${data.score || 0} pts]`;
      document.getElementById('nav-login-btn')?.classList.add('hidden');
      document.getElementById('nav-logout-btn')?.classList.remove('hidden');
    }
  } catch {}
}

async function login() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const msg      = document.getElementById('login-msg');
  if (!username || !password) return showMsg(msg, 'Fill all fields', false);

  const res  = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.error) return showMsg(msg, data.error, false);

  showMsg(msg, data.message, true);
  setTimeout(() => { closeModal('login-modal'); location.reload(); }, 800);
}

async function register() {
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const msg      = document.getElementById('reg-msg');
  if (!username || !password) return showMsg(msg, 'Fill all fields', false);

  const res  = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.error) return showMsg(msg, data.error, false);

  showMsg(msg, data.message, true);
  setTimeout(() => switchModal('register-modal', 'login-modal'), 1200);
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
}

async function submitFlag() {
  const flag   = document.getElementById('global-flag-input').value.trim();
  const result = document.getElementById('flag-result');
  if (!flag) return;

  const me = await fetch('/api/me');
  if (!me.ok) {
    result.textContent = '⚠ Login first to submit flags';
    result.className   = 'flag-result error';
    openModal('login-modal');
    return;
  }

  const res  = await fetch('/api/submit-flag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flag })
  });
  const data = await res.json();

  if (data.correct) {
    result.textContent = data.alreadySolved ? '✓ Already captured' : `🏆 ${data.message}`;
    result.className   = 'flag-result success';
    if (!data.alreadySolved) checkAuth();
  } else {
    result.textContent = '✗ ' + data.message;
    result.className   = 'flag-result error';
  }
  setTimeout(() => { result.textContent = ''; }, 4000);
}

function goChallenge(n) {
  window.location.href = `/challenges/ch${n}.html`;
}

function openModal(id)                { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id)               { document.getElementById(id)?.classList.add('hidden'); }
function switchModal(closeId, openId) { closeModal(closeId); openModal(openId); }

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className   = 'modal-msg ' + (ok ? 'ok' : 'err');
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) closeModal(e.target.id);
});

document.getElementById('global-flag-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitFlag();
});

checkAuth();