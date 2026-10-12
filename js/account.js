// Sign-in with a VIT student Google account, and keeping marks in sync with the account.
// Signed out, nothing here changes how the site works: marks stay in this browser (js/common.js).
(function () {
  const KEYS = { state: 'vc-state', cgpa: 'vc-cgpa', share: 'vc-share' };
  const M = window.VCMerge;
  const A = window.vcAccount = { user: null, clientId: '', dev: false, checked: false, saving: false, savedAt: 0 };
  let skew = 0; // server clock minus this device's, so locks end on the server's time
  A.now = () => Date.now() + skew;
  window.vcNow = A.now;

  // ---------- last synced copy, to tell what changed on this device since ----------
  const raw = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let base = raw.get('vc-sync'); // { owner, rev, data }
  const setBase = b => { base = b; raw.set('vc-sync', b); };
  const local = () => ({ state: vcData.get(KEYS.state), cgpa: vcData.get(KEYS.cgpa), share: vcData.get(KEYS.share) });

  // write merged data into this browser; tells the page when anything changed
  let applying = false;
  function apply(d) {
    const before = local();
    if (M.same(before, d)) return false;
    applying = true;
    Object.keys(KEYS).forEach(k => raw.set(KEYS[k], d[k] || null));
    applying = false;
    dispatchEvent(new CustomEvent('vc-sync'));
    return true;
  }

  // every save on the page also goes to the account
  const set = vcData.set;
  vcData.set = (k, v) => { set(k, v); if (!applying && A.user) queue(); };

  async function api(method, path, body, keepalive) {
    try {
      const r = await fetch('api/' + path, { method, credentials: 'same-origin', keepalive: !!keepalive, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (j && j.now) skew = j.now - Date.now();
      return { status: r.status, j };
    } catch (e) { return { status: 0, j: {} }; }
  }

  // ---------- syncing ----------
  async function pull(first) {
    const r = await api('GET', 'data');
    if (r.status === 401) return signedOut(true);
    if (r.status !== 200) return;
    const L = local(), sub = A.user.sub;
    let merged, adopt = false;
    if (!first || (base && base.owner === sub)) merged = M.rebase(L, base && base.owner === sub ? base.data : {}, r.j.data, r.j.locks, A.now());
    else if (base && base.owner) merged = r.j.data || {}; // this browser had another account's marks
    else { merged = M.signIn(L, r.j.data, r.j.locks, A.now()); adopt = r.j.rev === 0; }
    setBase({ owner: sub, rev: r.j.rev, data: r.j.data });
    apply(merged);
    if (!M.same(merged, r.j.data)) await push(adopt);
  }

  let timer = 0, busy = null, again = false;
  function queue() { clearTimeout(timer); A.saving = true; status(); timer = setTimeout(() => push(false), 1200); }

  async function push(adopt, tries = 0) {
    clearTimeout(timer); timer = 0;
    if (busy) { again = true; return busy; }
    busy = (async () => {
      const sent = local();
      const r = await api('PUT', 'data', { rev: base ? base.rev : 0, data: sent, adopt });
      if (r.status === 200) {
        setBase({ owner: A.user.sub, rev: r.j.rev, data: r.j.data });
        // the server may have changed locks; keep anything typed since the save started
        apply(M.rebase(local(), sent, r.j.data, r.j.locks, A.now()));
        A.savedAt = Date.now();
      } else if (r.status === 409) {
        if (r.j.err === 'locked') vcToast('Those subjects are locked for now, so the saved list was kept');
        const merged = M.rebase(local(), base && base.data, r.j.data, r.j.locks, A.now());
        setBase({ owner: A.user.sub, rev: r.j.rev, data: r.j.data });
        apply(merged);
        if (tries < 3 && !M.same(merged, r.j.data)) { busy = null; return push(false, tries + 1); }
      } else if (r.status === 401) { busy = null; return signedOut(true); }
      else if (r.status === 413) vcToast('Too much data to save to your account');
      else if (r.status) vcToast("Couldn't save to your account. Your marks are safe on this device.");
      else { busy = null; setTimeout(() => A.user && queue(), 15000); } // offline: try again soon
    })();
    try { await busy; } finally {
      busy = null; A.saving = !!timer; status();
      if (again) { again = false; queue(); }
    }
  }

  // send anything waiting before the page closes
  addEventListener('pagehide', () => {
    if (!timer || !A.user) return;
    clearTimeout(timer); timer = 0;
    const body = { rev: base ? base.rev : 0, data: local() };
    if (JSON.stringify(body).length < 60000) api('PUT', 'data', body, true);
  });
  // coming back to the tab: pick up changes from other devices
  document.addEventListener('visibilitychange', () => { if (!document.hidden && A.user && !timer && !busy) pull(false); });

  A.saveNow = () => push(false);
  // save now and wait (before confirming subjects)
  A.flush = async () => { if (timer || busy) await push(false); };

  // confirm a semester on the server -> { ok, msg }
  A.confirm = async sem => {
    await A.flush();
    const r = await api('POST', 'lock', { sem });
    if (r.status === 401) { signedOut(true); return { ok: false, msg: 'You were signed out. Sign in again to confirm.' }; }
    if (r.j.locks) {
      const L = local();
      if (L.state) { L.state.locks = r.j.locks; apply(L); }
      if (base && base.data && base.data.state) setBase(Object.assign({}, base, { data: Object.assign({}, base.data, { state: Object.assign({}, base.data.state, { locks: r.j.locks }) }) }));
    }
    if (r.status === 200) return { ok: true };
    const msg = { locked: 'These subjects are already confirmed and locked.', 'too-many-credits': "A semester can't be more than 35 credits.", 'no-subjects': 'Add your subjects first.' }[r.j.err];
    return { ok: false, msg: msg || "Couldn't confirm right now. Check your connection and try again." };
  };

  // ---------- signing in and out ----------
  async function signedIn(user, fresh) {
    A.user = user;
    render();
    await pull(true);
    if (fresh) vcToast('Signed in. Your marks are saved to your account.');
    dispatchEvent(new CustomEvent('vc-account'));
  }
  function signedOut(expired) {
    if (!A.user) return;
    A.user = null; clearTimeout(timer); timer = 0;
    render();
    if (expired) vcToast('You were signed out. Your marks are still on this device.');
    dispatchEvent(new CustomEvent('vc-account'));
  }
  A.signOut = async () => {
    await A.flush();
    await api('DELETE', 'auth', {});
    // the marks are in the account, so this device doesn't keep a copy (shared and lab computers)
    vcData.clear(); setBase(null);
    location.href = './';
  };

  async function signInWith(body) {
    const err = document.getElementById('signin-err');
    err.textContent = '';
    const r = await api('POST', 'auth', body);
    if (r.status === 200) { document.getElementById('signin').close(); return signedIn(r.j.user, true); }
    err.textContent = r.status === 403 ? 'Only @vitstudent.ac.in accounts can sign in. Pick your VIT student account and try again.'
      : r.status === 429 ? 'Too many tries. Wait a few minutes and try again.'
      : r.status === 503 ? "Sign-in isn't set up yet. Your marks are still saved on this device."
      : "Couldn't sign you in. Check your connection and try again.";
  }

  // ---------- the sign-in dialog, the header button and the banner ----------
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function dialog() {
    let d = document.getElementById('signin');
    if (d) return d;
    d = document.createElement('dialog');
    d.id = 'signin'; d.setAttribute('aria-labelledby', 'signin-title');
    d.innerHTML = `<form method="dialog" class="signin">
      <h2 id="signin-title">Sign in</h2>
      <p class="hint">Use your VIT student Google account (<b>@vitstudent.ac.in</b>). Your marks are saved to it and show up on any phone or laptop you sign in on.</p>
      <div class="gbtn" id="gbtn"><span class="hint">Loading Google sign-in…</span></div>
      <div class="devsign" id="devsign" hidden><input class="input" name="devEmail" placeholder="test@vitstudent.ac.in" autocomplete="off"><button type="button" class="btn btn-sm" data-dev-signin>Test sign-in</button></div>
      <p class="err" id="signin-err"></p>
      <p class="hint small">We only see your name, email and photo. Not signed in? Everything still works, saved on this device.</p>
      <div class="actions"><button class="btn btn-ghost" type="button" data-close>Not now</button></div>
    </form>`;
    document.body.appendChild(d);
    d.querySelector('[data-dev-signin]').addEventListener('click', () => signInWith({ devEmail: d.querySelector('[name=devEmail]').value.trim() }));
    return d;
  }

  let gsi = null;
  function loadGoogle() {
    if (gsi) return gsi;
    gsi = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gsi = null; rej(); };
      document.head.appendChild(s);
    });
    return gsi;
  }

  async function openSignIn() {
    const d = dialog();
    document.getElementById('signin-err').textContent = '';
    if (!d.open) d.showModal();
    if (!A.checked) await check();
    document.getElementById('devsign').hidden = !A.dev;
    const box = document.getElementById('gbtn');
    if (!A.clientId) { box.innerHTML = `<span class="hint">${A.dev ? 'Google sign-in needs GOOGLE_CLIENT_ID. Use the test sign-in below.' : "Sign-in isn't available right now. Your marks are still saved on this device."}</span>`; return; }
    try { await loadGoogle(); } catch (e) { box.innerHTML = '<span class="err">Couldn\'t load Google sign-in. Check your connection and try again.</span>'; return; }
    google.accounts.id.initialize({ client_id: A.clientId, hd: 'vitstudent.ac.in', ux_mode: 'popup', auto_select: false, context: 'signin', callback: c => signInWith({ credential: c.credential }) });
    box.innerHTML = '';
    google.accounts.id.renderButton(box, { theme: document.documentElement.dataset.theme === 'light' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: light)').matches) ? 'outline' : 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(320, box.clientWidth || 320) });
  }
  A.openSignIn = openSignIn;

  function initials(u) { return (u.name || u.email).split(/[\s.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
  function render() {
    document.querySelectorAll('.top [data-signin], .top [data-account]').forEach(el => {
      if (A.user) {
        if (el.hasAttribute('data-account')) return;
        const a = document.createElement('a');
        a.className = 'avatar'; a.href = 'profile'; a.setAttribute('data-account', ''); a.setAttribute('aria-label', 'Your profile');
        a.innerHTML = A.user.pic ? `<img src="${esc(A.user.pic)}" alt="" referrerpolicy="no-referrer" width="34" height="34">` : `<span>${esc(initials(A.user))}</span>`;
        if (location.pathname.replace(/\.html$/, '').endsWith('/profile')) a.setAttribute('aria-current', 'page');
        el.replaceWith(a);
      } else if (el.hasAttribute('data-account')) {
        const b = document.createElement('a');
        b.className = 'btn btn-sm'; b.href = '#'; b.setAttribute('data-signin', ''); b.textContent = 'Sign in';
        el.replaceWith(b);
      }
    });
    document.querySelectorAll('[data-banner]').forEach(b => { if (A.user) b.hidden = true; });
    status();
  }
  function status() {
    document.querySelectorAll('[data-sync-status]').forEach(el => {
      el.textContent = !A.user ? '' : A.saving ? 'Saving…' : 'Saved to your account';
    });
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-signin]');
    if (!b) return;
    e.preventDefault();
    if (A.user) location.href = 'profile'; else openSignIn();
  });

  // ---------- "marks calculated" counter: each subject counts once per browser session ----------
  let pending = 0, ctimer = 0;
  A.count = id => {
    let done = [];
    try { done = JSON.parse(sessionStorage.getItem('vc-counted')) || []; } catch (e) {}
    if (done.includes(id)) return;
    done.push(id);
    try { sessionStorage.setItem('vc-counted', JSON.stringify(done.slice(-200))); } catch (e) { return; } // can't remember it, so don't count it
    pending++;
    clearTimeout(ctimer);
    ctimer = setTimeout(() => { const n = Math.min(pending, 20); pending = 0; api('POST', 'counter', { n }, true); }, 2500);
  };

  // ---------- start ----------
  async function check() {
    const r = await api('GET', 'auth');
    A.checked = true;
    if (r.status !== 200) return;
    A.clientId = r.j.clientId || ''; A.dev = !!r.j.dev;
    if (r.j.user && !A.user) await signedIn(r.j.user, false);
    else if (!r.j.user) dispatchEvent(new CustomEvent('vc-account'));
  }
  A.ready = new Promise(res => document.addEventListener('DOMContentLoaded', () => { render(); check().then(res, res); }));
})();
