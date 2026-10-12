// Profile page: who is signed in, their saved semesters, sign out.
(function () {
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => (Math.round(n * 100) / 100).toString();
  const plural = (n, w) => fmt(n) + ' ' + w + (n === 1 ? '' : 's');

  function render() {
    const u = vcAccount.user;
    $('#pf-out').hidden = !!u || !vcAccount.checked;
    $('#pf-in').hidden = !u;
    if (!u) return;
    $('#pf-name').textContent = u.name; $('#pf-email').textContent = u.email;
    $('#pf-avatar').innerHTML = u.pic ? `<img src="${esc(u.pic)}" alt="" referrerpolicy="no-referrer" width="56" height="56">` : esc((u.name || u.email)[0].toUpperCase());

    const cs = vcData.get('vc-state') || { sems: {}, locks: {} };
    const r = VC.cgpaSummary(vcData.get('vc-cgpa') || {}, cs);
    const best = r.after && r.after.cgpa !== null ? r.after.cgpa : r.before.cgpa;
    $('#pf-cgpa').textContent = best === null ? '–' : best.toFixed(2);
    $('#pf-sems').textContent = r.sems.length;
    const now = vcAccount.now();
    $('#pf-list').innerHTML = r.sems.length ? r.sems.slice().reverse().map(s => {
      const L = (cs.locks || {})[s.id];
      const tag = L && L.until > now ? '<span class="tag blue">Confirmed · locked</span>' : s.confirmed ? '<span class="tag">Confirmed</span>' : '<span class="tag warn">Not confirmed</span>';
      return `<li><a class="sem-row pf-sem" href="calc?sem=${encodeURIComponent(s.id)}"><div class="sem-main"><b>${esc(s.name)}</b><span>${plural(s.n, 'subject')} · ${plural(s.credits, 'credit')}</span>${tag}</div><div class="sem-gpa${s.confirmed && s.gpa !== null ? '' : ' muted'}">${s.confirmed && s.gpa !== null ? s.gpa.toFixed(2) : '–'}</div></a></li>`;
    }).join('') : '<li class="sem-empty">No semesters saved yet. Add your subjects in the <a href="calc">calculator</a>.</li>';
  }

  // yes / no using #ask
  function ask(title, msg, yes) {
    const d = $('#ask');
    $('#ask-title').textContent = title; $('#ask-msg').textContent = msg; $('#ask-ok').textContent = yes;
    d.showModal();
    return new Promise(res => {
      const form = d.querySelector('form');
      const done = v => { form.removeEventListener('submit', on); d.removeEventListener('cancel', off); if (d.open) d.close(); res(v); };
      const on = e => { e.preventDefault(); done(!!e.submitter && e.submitter.value === 'ok'); };
      const off = e => { e.preventDefault(); done(false); };
      form.addEventListener('submit', on); d.addEventListener('cancel', off);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    addEventListener('vc-account', render);
    addEventListener('vc-sync', render);
    $('#pf-signout').addEventListener('click', async () => {
      if (!await ask('Sign out?', "Your marks stay safe in your account and are removed from this device. Sign in again any time to get them back.", 'Sign out')) return;
      vcAccount.signOut();
    });
  });
})();
