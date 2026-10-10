// Shared by every page: theme toggle, sign-in banner, toast.
(function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  window.vcStore = store;

  // ---------- marks and semesters, kept on this device until sign-in exists ----------
  // 'vc-state' is the calculator (every semester's subjects, marks, ranges, locks), 'vc-cgpa' the CGPA page
  const DATA_KEYS = ['vc-state', 'vc-cgpa'];
  const data = {
    get(k) {
      try {
        // older versions kept data for the tab only; pick it up once so nothing is lost
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        return v ? JSON.parse(v) : null;
      } catch (e) { return null; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    clear() { DATA_KEYS.forEach(k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} }); }
  };
  window.vcData = data;

  function download() {
    const out = { app: 'vitcgpacalc', version: 1, saved: new Date().toISOString(), data: {} };
    DATA_KEYS.forEach(k => { const v = data.get(k); if (v) out.data[k] = v; });
    if (!Object.keys(out.data).length) { toast('Nothing to back up yet'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    a.download = 'vitcgpa-backup-' + out.saved.slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded');
  }

  // a backup must look like one of ours before it replaces anything
  function validBackup(b) {
    if (!b || b.app !== 'vitcgpacalc' || !b.data || typeof b.data !== 'object') return false;
    const s = b.data['vc-state'], c = b.data['vc-cgpa'];
    if (!s && !c) return false;
    if (s && (typeof s.sems !== 'object' || Array.isArray(s.sems) || !Object.values(s.sems).every(Array.isArray))) return false;
    if (c && (typeof c.quick !== 'object' || !Array.isArray(c.past || []) || !Array.isArray(c.cleared || []))) return false;
    return true;
  }

  // yes / no using the page's #ask dialog -> Promise<boolean>
  function ask(title, msg, yes) {
    const d = document.getElementById('ask');
    if (!d) return Promise.resolve(confirm(title + '\n\n' + msg));
    document.getElementById('ask-title').textContent = title;
    document.getElementById('ask-msg').textContent = msg;
    const ok = document.getElementById('ask-ok'); ok.textContent = yes; ok.hidden = false;
    document.getElementById('ask-cancel').textContent = 'Go back';
    d.showModal();
    return new Promise(res => {
      const form = d.querySelector('form');
      const done = v => { form.removeEventListener('submit', onSubmit); d.removeEventListener('cancel', onCancel); if (d.open) d.close(); res(v); };
      const onSubmit = e => { e.preventDefault(); done(!!e.submitter && e.submitter.value === 'ok'); };
      const onCancel = e => { e.preventDefault(); done(false); };
      form.addEventListener('submit', onSubmit);
      d.addEventListener('cancel', onCancel);
    });
  }

  function bindData() {
    document.querySelectorAll('[data-backup]').forEach(b => b.addEventListener('click', download));
    document.querySelectorAll('[data-restore]').forEach(input => input.addEventListener('change', () => {
      const file = input.files[0]; input.value = '';
      if (!file) return;
      if (file.size > 2e6) { toast("That file is too big to be a backup"); return; }
      file.text().then(async text => {
        let b = null;
        try { b = JSON.parse(text); } catch (e) {}
        if (!validBackup(b)) { toast("That isn't a VIT cgpa backup file"); return; }
        const when = b.saved ? new Date(b.saved).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'an earlier date';
        if (!await ask('Restore this backup?', `It's from ${when}. Everything saved on this device now will be replaced by it.`, 'Restore')) return;
        data.clear();
        Object.keys(b.data).forEach(k => { if (DATA_KEYS.includes(k)) data.set(k, b.data[k]); });
        location.reload();
      });
    }));
    document.querySelectorAll('[data-wipe]').forEach(b => b.addEventListener('click', async () => {
      if (!await ask('Delete all your data?', 'Every semester, mark and grade saved on this device will be deleted. Download a backup first if you might need it.', 'Delete everything')) return;
      data.clear();
      location.reload();
    }));
  }

  // theme: saved choice wins, otherwise follow the device
  const saved = store.get('vc-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  function current() {
    return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store.set('vc-theme', next);
    }));

    const banner = document.querySelector('[data-banner]');
    if (banner) {
      let hidden = false;
      try { hidden = sessionStorage.getItem('vc-banner') === '0'; } catch (e) {}
      banner.hidden = hidden;
      const close = banner.querySelector('[data-banner-close]');
      if (close) close.addEventListener('click', () => { banner.hidden = true; try { sessionStorage.setItem('vc-banner', '0'); } catch (e) {} });
    }

    bindData();

    document.querySelectorAll('[data-signin]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      toast('Sign-in with your VIT student account is coming soon');
    }));
  });

  let timer;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  window.vcToast = toast;
  // Cancel buttons are type=button so pressing Enter in a field submits, not cancels
  document.addEventListener('click', e => { const b = e.target.closest('dialog [data-close]'); if (b) b.closest('dialog').close(); });
})();
