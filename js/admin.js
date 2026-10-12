// Admin page: subject requests (needs ADMIN_KEY, kept for this tab only).
(function () {
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const TYPE = { ETL: 'Theory + lab', TH: 'Theory', LO: 'Lab only', OC: 'Online course', SS: 'Soft skill' };
  let key = '', list = [], filter = 'new';
  try { key = sessionStorage.getItem('vc-admin') || ''; } catch (e) {}

  async function call(method, body) {
    const r = await fetch('api/admin', { method, headers: Object.assign({ 'x-admin-key': key }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    return { status: r ? r.status : 0, j: r ? await r.json().catch(() => ({})) : {} };
  }

  function show(on) { $('#ad-login').hidden = on; $('#ad-main').hidden = !on; }

  async function load() {
    const r = await call('GET');
    if (r.status !== 200) {
      show(false);
      $('#ad-err').textContent = !key ? '' : r.status === 401 ? 'Wrong key' : r.status === 429 ? 'Too many tries. Wait an hour.' : r.status === 503 ? 'ADMIN_KEY or Redis is not set up on the server' : "Couldn't load. Try again.";
      return;
    }
    try { sessionStorage.setItem('vc-admin', key); } catch (e) {}
    list = r.j.requests;
    $('#ad-calc').textContent = r.j.calculated.toLocaleString('en-IN');
    $('#ad-users').textContent = r.j.users.toLocaleString('en-IN');
    show(true); render();
  }

  function render() {
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    const rows = list.filter(r => filter === 'all' || r.status === filter);
    $('#ad-list').innerHTML = rows.length ? rows.map(r => `<li class="sem-row ad-row">
      <div class="sem-main"><b>${esc(r.code)} · ${esc(r.title)}</b>
        <span>${esc(TYPE[r.type] || r.type)} · ${r.credits} credit${r.credits === 1 ? '' : 's'} · ${new Date(r.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}${r.asks > 1 ? ' · asked ' + r.asks + ' times' : ''}${r.by ? ' · ' + esc(r.by) : ''}</span>
        ${r.note ? `<span class="ad-note">“${esc(r.note)}”</span>` : ''}
        <span class="tag${r.status === 'added' ? ' blue' : r.status === 'new' ? ' warn' : ''}">${r.status === 'new' ? 'New' : r.status === 'added' ? 'Added' : 'Rejected'}</span></div>
      <div class="ad-acts">
        <button type="button" class="btn btn-sm" data-copy="${esc(r.id)}">Copy line</button>
        ${r.status !== 'added' ? `<button type="button" class="btn btn-sm btn-gold" data-set="added" data-id="${esc(r.id)}">Added</button>` : ''}
        ${r.status !== 'rejected' ? `<button type="button" class="btn btn-sm btn-ghost" data-set="rejected" data-id="${esc(r.id)}">Reject</button>` : ''}
        ${r.status !== 'new' ? `<button type="button" class="btn btn-sm btn-ghost" data-set="new" data-id="${esc(r.id)}">Undo</button>` : ''}
      </div></li>`).join('') : `<li class="sem-empty">No ${filter === 'all' ? '' : filter + ' '}requests.</li>`;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#ad-login').addEventListener('submit', e => { e.preventDefault(); key = e.target.key.value.trim(); $('#ad-err').textContent = ''; load(); });
    $('#ad-out').addEventListener('click', () => { key = ''; try { sessionStorage.removeItem('vc-admin'); } catch (e) {} $('#ad-login').reset(); show(false); });
    document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));
    $('#ad-list').addEventListener('click', async e => {
      const c = e.target.closest('[data-copy]'), s = e.target.closest('[data-set]');
      if (c) { const r = list.find(x => x.id === c.dataset.copy); await copy(r.line); vcToast('Copied. Paste it into data/subjects.json'); }
      if (s) {
        const r = await call('POST', { id: s.dataset.id, status: s.dataset.set });
        if (r.status !== 200) { vcToast("Couldn't update it"); return; }
        list = list.map(x => (x.id === r.j.request.id ? r.j.request : x));
        render();
        vcToast(s.dataset.set === 'added' ? 'Marked as added' : s.dataset.set === 'rejected' ? 'Rejected' : 'Moved back to new');
      }
    });
    if (key) load(); else show(false);
  });
})();
