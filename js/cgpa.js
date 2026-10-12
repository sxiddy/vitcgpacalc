// CGPA page: past semesters (quick or one by one), confirmed calculator semesters, cleared F's, result.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => (n === null || n === undefined ? '–' : (Math.round(n * 100) / 100).toString());
  const two = n => (n === null || n === undefined ? '–' : n.toFixed(2));
  const plural = (n, w) => fmt(n) + ' ' + w + (n === 1 ? '' : 's');
  const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  // ---------- state: this page's own, plus the calculator's (same tab) ----------
  let st = { mode: 'quick', quick: { cgpa: '', credits: '' }, past: [], cleared: [] };
  { const s = vcData.get('vc-cgpa'); if (s && s.quick) st = Object.assign(st, s); }
  const save = () => vcData.set('vc-cgpa', st);
  function calcState() {
    const s = vcData.get('vc-state'); if (s && s.sems) return s;
    return { sems: {}, locks: {} };
  }
  const uid = () => Math.random().toString(36).slice(2, 9);

  const compute = () => VC.cgpaSummary(st, calcState());

  // ---------- rendering ----------
  function renderMode() {
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    document.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== st.mode; });
    $('#q-cgpa').value = st.quick.cgpa; $('#q-credits').value = st.quick.credits;
  }

  function renderPast() {
    $('#past-list').innerHTML = st.past.length ? st.past.map((p, i) => `<li class="sem-row">
        <div class="sem-main"><b>${esc(p.name)}</b><span>${plural(+p.credits, 'credit')}</span></div>
        <div class="sem-gpa">${two(+p.gpa)}</div>
        <div class="sem-act"><button type="button" class="mini" data-edit-past="${i}" aria-label="Edit ${esc(p.name)}">${PEN}</button><button type="button" class="mini" data-rm-past="${i}" aria-label="Remove ${esc(p.name)}">${X}</button></div>
      </li>`).join('') : '<li class="sem-empty">No semesters added yet.</li>';
  }

  function renderCalc(r) {
    $('#calc-list').innerHTML = r.sems.length ? r.sems.map(s => {
      let state, val = '–';
      if (!s.confirmed) state = `<span class="tag warn">Not confirmed, doesn't count yet</span>`;
      else if (s.gpa === null) state = `<span class="tag warn">Add grade ranges to get a GPA</span>`;
      else { val = two(s.gpa); state = s === r.now ? '<span class="tag blue">This semester</span>' : '<span class="tag">Counted</span>'; }
      const part = s.confirmed && s.gpa !== null && s.graded < s.credits ? ` · ${fmt(s.graded)} of ${fmt(s.credits)} credits graded` : '';
      return `<li><details class="sem-log" data-sem="${esc(s.id)}"${openLogs.has(s.id) ? ' open' : ''}><summary class="sem-row"><div class="sem-main"><b>${esc(s.name)}</b><span>${plural(s.n, 'subject')} · ${plural(s.credits, 'credit')}${part}</span>${state}</div><div class="sem-gpa${val === '–' ? ' muted' : ''}">${val}</div><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></summary>${semLog(s.id)}</details></li>`;
    }).join('') : '<li class="sem-empty">Nothing here yet. Add your subjects in the <a href="calc">calculator</a> and confirm them.</li>';
  }

  // every subject in a calculator semester with its total and grade, so past semesters stay readable
  const openLogs = new Set();
  function semLog(id) {
    const subs = (calcState().sems || {})[id] || [];
    const rows = subs.map(sub => {
      const ps = VC.parts(sub);
      const res = ps.map(p => `<span class="log-part">${ps.length > 1 ? esc(p.key === 'lab' ? 'Lab' : 'Theory') + ' ' : ''}${p.value === null ? '–' : fmt(p.value)}${p.grade ? ` <b style="--gc:var(--g-${p.grade})">${p.grade}</b>` : ''}</span>`).join('');
      return `<li><div class="log-name"><b>${esc(sub.c)}</b><span>${esc(sub.t)} · ${plural(Number(sub.cr) || 0, 'credit')}</span></div><div class="log-res">${res}</div></li>`;
    }).join('');
    return `<ul class="log">${rows}</ul><a class="btn btn-sm btn-ghost log-open" href="calc?sem=${encodeURIComponent(id)}">Open in calculator</a>`;
  }

  function renderCleared(r) {
    $('#cleared-list').innerHTML = st.cleared.map((c, i) => `<li class="sem-row"><div class="sem-main"><b>${esc(c.name || 'Failed course')}</b><span>Old F no longer counts</span></div><div class="sem-gpa small">${plural(c.credits, 'credit')}</div><div class="sem-act"><button type="button" class="mini" data-rm-cleared="${i}" aria-label="Remove">${X}</button></div></li>`).join('');
    $('#cleared-sum').textContent = st.cleared.length ? plural(st.cleared.length, 'course') : '';
    $('#cleared-warn').textContent = r.clearedErr;
  }

  function renderResult(r) {
    const big = $('#big'), proj = $('#proj');
    const hasBefore = r.before.cgpa !== null, hasAfter = !!(r.after && r.after.cgpa !== null);
    let label = 'Your CGPA', value = r.before.cgpa, note;
    if (!hasBefore && hasAfter) { label = 'Projected CGPA'; value = r.after.cgpa; note = `From ${r.now.name} alone. Add your past semesters in step 1 to include them.`; }
    else if (!hasBefore) note = r.past.err || 'Add your past semesters or confirm a semester in the calculator.';
    else note = `Across ${plural(r.before.credits, 'credit')}` + (r.now ? `, before ${r.now.name}` : '');
    if (r.past.err && (hasBefore || hasAfter)) note = r.past.err + '. Step 1 isn\'t counted until it\'s fixed.';

    $('#big-label').textContent = label; $('#dock-label').textContent = label;
    big.textContent = two(value); big.classList.toggle('muted', value === null);
    $('#dock-big').textContent = two(value); $('#dock-big').classList.toggle('muted', value === null);
    $('#big-note').textContent = note;

    if (hasBefore && hasAfter) {
      const d = Math.round((r.after.cgpa - r.before.cgpa) * 100) / 100;
      const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '●';
      proj.hidden = false;
      proj.innerHTML = `<span>Projected after ${esc(r.now.name)}</span><b>${two(r.after.cgpa)}</b><i class="${dir}">${arrow} ${d === 0 ? 'no change' : (d > 0 ? '+' : '') + d.toFixed(2)}</i>`;
      $('#dock-right').innerHTML = `After ${esc(r.now.name)}<br><b>${two(r.after.cgpa)}</b> <span class="${dir}">${arrow} ${d > 0 ? '+' : ''}${d.toFixed(2)}</span>`;
    } else {
      proj.hidden = true;
      $('#dock-right').innerHTML = hasAfter ? `${esc(r.now.name)} · ${plural(r.after.credits, 'credit')}` : hasBefore ? plural(r.before.credits, 'credit') : '';
    }

    // breakdown, oldest first
    const rows = r.past.err ? [] : r.past.rows.slice();
    r.counted.forEach(s => rows.push({ name: s.name, tag: s === r.now ? 'This semester' : 'Calculator', gpa: s.gpa, credits: s.graded, now: s === r.now }));
    const total = hasAfter ? r.after : r.before;
    const quick = rows.some(x => x.quick), nSem = rows.length - (quick ? 1 : 0);
    $('#st-sems').innerHTML = quick ? nSem + ' <small>+ earlier</small>' : nSem;
    $('#st-credits').textContent = fmt(total.credits);
    $('#st-cr-label').textContent = hasAfter && hasBefore ? 'Credits after' : 'Credits';
    let html = rows.map(x => `<li class="${x.now ? 'now' : ''}"><div class="bd-top"><span class="bd-name">${esc(x.name)}<small>${esc(x.tag)} · ${plural(x.credits, 'credit')}</small></span><b>${two(x.gpa)}</b></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, x.gpa * 10))}%"></i></div></li>`).join('');
    if (r.clearedCr) html += `<li class="bd-note">${plural(r.clearedCr, 'credit')} of cleared F's taken out</li>`;
    if (total.replaced) html += `<li class="bd-note">${plural(total.replaced, 'retaken course')} counted once, with the newer grade</li>`;
    $('#breakdown').innerHTML = html || '<li class="bd-note">Your semesters will show up here.</li>';
  }

  function render() {
    const r = compute();
    renderPast(); renderCalc(r); renderCleared(r); renderResult(r);
    $('#q-err').textContent = st.mode === 'quick' ? r.past.err : '';
    const qr = VC.num(st.quick.credits);
    $('[data-box="cgpa"]').classList.toggle('bad', !!VC.checkGpa(st.quick.cgpa));
    $('[data-box="credits"]').classList.toggle('bad', qr !== null && (Number.isNaN(qr) || qr <= 0 || qr > 400));
  }

  // ---------- yes / no dialog (same as the calculator's) ----------
  function ask(title, msg, yes, danger) {
    const d = $('#ask');
    $('#ask-title').textContent = title; $('#ask-msg').textContent = msg;
    const ok = $('#ask-ok'); ok.textContent = yes || 'Continue'; ok.hidden = !!danger;
    $('#ask-cancel').textContent = danger ? 'Got it' : 'Go back';
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

  // ---------- add / edit a past semester ----------
  let editing = -1;
  function openPast(i) {
    const d = $('#past'), f = d.querySelector('form');
    editing = i;
    const p = i >= 0 ? st.past[i] : { name: 'Semester ' + (st.past.length + 1), gpa: '', credits: '' };
    f.name.value = p.name; f.gpa.value = p.gpa; f.credits.value = p.credits;
    $('#past-title').textContent = i >= 0 ? 'Edit semester' : 'Add a semester';
    $('#past-ok').textContent = i >= 0 ? 'Save' : 'Add semester';
    $('#past-err').textContent = '';
    d.showModal();
  }
  function bindPast() {
    const d = $('#past'), f = d.querySelector('form');
    $('[data-add-past]').addEventListener('click', () => openPast(-1));
    f.addEventListener('submit', async e => {
      if (e.submitter && e.submitter.value === 'cancel') return;
      e.preventDefault();
      const name = f.name.value.trim() || 'Semester ' + (editing >= 0 ? editing + 1 : st.past.length + 1);
      const g = VC.num(f.gpa.value), c = VC.num(f.credits.value), rule = VC.semCredits(f.credits.value), S = VC.SEM_CREDITS;
      let err = '';
      if (g === null) err = 'Enter the GPA for this semester';
      else if (VC.checkGpa(f.gpa.value)) err = 'GPA ' + VC.checkGpa(f.gpa.value);
      else if (rule === 'invalid') err = 'Enter the credits for this semester';
      else if (rule === 'too-many') err = `A semester can't be more than ${S.max} credits`;
      if (err) { $('#past-err').textContent = err; return; }
      if (rule === 'low' || rule === 'high') {
        d.close();
        const ok = await ask(rule === 'low' ? 'Fewer credits than usual' : 'More credits than usual', `${name} has ${fmt(c)} credits. Most semesters are ${S.low}–${S.high} credits. Is that right?`, 'Yes, it is');
        if (!ok) { d.showModal(); f.credits.focus(); return; }
      } else d.close();
      const row = { id: editing >= 0 ? st.past[editing].id : uid(), name, gpa: g, credits: c };
      if (editing >= 0) st.past[editing] = row; else st.past.push(row);
      save(); render();
      vcToast(editing >= 0 ? name + ' updated' : name + ' added');
    });
    $('#past-list').addEventListener('click', e => {
      const ed = e.target.closest('[data-edit-past]'), rm = e.target.closest('[data-rm-past]');
      if (ed) openPast(+ed.dataset.editPast);
      if (rm) { const p = st.past.splice(+rm.dataset.rmPast, 1)[0]; save(); render(); vcToast(p.name + ' removed'); }
    });
  }

  function bindCleared() {
    const f = $('#cleared-form');
    f.addEventListener('submit', e => {
      e.preventDefault();
      const c = VC.num(f.credits.value);
      $('#cleared-err').textContent = '';
      if (c === null || Number.isNaN(c) || c <= 0 || c > 20) { $('#cleared-err').textContent = 'Credits must be between 0.5 and 20'; return; }
      st.cleared.push({ id: uid(), name: f.name.value.trim(), credits: c });
      f.reset(); save(); render();
    });
    $('#cleared-list').addEventListener('click', e => {
      const rm = e.target.closest('[data-rm-cleared]'); if (!rm) return;
      st.cleared.splice(+rm.dataset.rmCleared, 1); $('#cleared-err').textContent = ''; save(); render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderMode(); render();
    if (st.cleared.length) $('[data-fold="cleared"]').open = true;
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; save(); renderMode(); render(); }));
    document.querySelectorAll('[data-q]').forEach(inp => inp.addEventListener('input', () => { st.quick[inp.dataset.q] = inp.value; save(); render(); }));
    bindPast(); bindCleared();
    // coming back from the calculator with the back button can show a cached page
    addEventListener('pageshow', e => { if (e.persisted) render(); });
    // marks changed in another tab: pick them up
    addEventListener('storage', e => {
      if (e.key === 'vc-cgpa') { const s = vcData.get('vc-cgpa'); if (s && s.quick) { st = Object.assign(st, s); renderMode(); } }
      if (e.key === 'vc-cgpa' || e.key === 'vc-state' || e.key === null) render();
    });
    // marks loaded from the account, or changed on another device
    addEventListener('vc-sync', () => {
      const s = vcData.get('vc-cgpa');
      st = Object.assign({ mode: 'quick', quick: { cgpa: '', credits: '' }, past: [], cleared: [] }, s && s.quick ? s : {});
      renderMode(); render();
    });
    $('#calc-list').addEventListener('toggle', e => { const d = e.target.closest('[data-sem]'); if (d) d.open ? openLogs.add(d.dataset.sem) : openLogs.delete(d.dataset.sem); }, true);
    // on phones the dock repeats the result card, so hide it while the card is on screen
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { $('.dock').classList.toggle('away', es[0].isIntersecting); }).observe($('#big'));
  });
})();
