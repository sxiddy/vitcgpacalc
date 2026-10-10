// Shared by every page: theme toggle, sign-in banner, toast.
(function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  window.vcStore = store;

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
})();
