// Calculator page: subject search, subject cards, live totals and grades, semester GPA.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => (n === null || n === undefined ? '–' : (Math.round(n * 100) / 100).toString());
  const TYPE = { ETL: 'Theory + lab', TH: 'Theory', LO: 'Lab only', OC: 'Online course', SS: 'Soft skill' };
  const GRADE_KEYS = ['S', 'A', 'B', 'C', 'D', 'E'];
  const ICON = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
  };

  // ---------- semesters ----------
  function semesters() {
    const now = new Date(), y = now.getFullYear();
    const list = [];
    for (let s = y + 1; s >= 2021; s--) {
      const yy = s + '-' + String(s + 1).slice(2);
      list.push({ id: 'SUMSEM' + yy, name: 'Summer ' + yy }, { id: 'WINSEM' + yy, name: 'Winter ' + yy }, { id: 'FALLSEM' + yy, name: 'Fall ' + yy });
    }
    const m = now.getMonth();
    const def = m >= 6 ? 'FALLSEM' + y + '-' + String(y + 1).slice(2) : 'WINSEM' + (y - 1) + '-' + String(y).slice(2);
    return { list, def };
  }

  // ---------- state (kept for this browser tab only until sign-in exists) ----------
  const SEMS = semesters();
  let state = { sem: SEMS.def, sems: {} };
  try { const s = JSON.parse(sessionStorage.getItem('vc-state')); if (s && s.sems) state = s; } catch (e) {}
  const save = () => { try { sessionStorage.setItem('vc-state', JSON.stringify(state)); } catch (e) {} };
  const subjects = () => (state.sems[state.sem] = state.sems[state.sem] || []);
  const byId = id => subjects().find(s => s.id === id);

  // ---------- confirming subjects (locked for 12 hours after confirming) ----------
  const LOCK_MS = 12 * 60 * 60 * 1000, CREDITS = VC.SEM_CREDITS;
  const lock = () => { state.locks = state.locks || {}; return state.locks[state.sem] || { confirmed: false, until: 0 }; };
  const isLocked = () => lock().until > Date.now();
  const totalCredits = () => subjects().reduce((n, s) => n + (Number(s.cr) || 0), 0);
  // any change to the subject list after the lock ends needs a fresh confirm
  function unconfirm() { if (lock().confirmed) { state.locks[state.sem] = { confirmed: false, until: 0 }; } }

  function newSubject(c) {
    const s = { id: Math.random().toString(36).slice(2, 9), c: c.c, t: c.t, y: c.y, cr: Number(c.cr) || 0, l: c.l || 0, tu: c.tu || 0, p: c.p || 0, custom: !!c.custom, g: {}, gl: {}, sep: false };
    if (s.y === 'TH' || s.y === 'ETL') { s.cat1 = ''; s.cat2 = ''; s.fat = ''; s.quiz = [1, 2, 3].map(i => ({ n: 'Quiz ' + i, s: '', m: 10 })); }
    if (s.y === 'LO' || s.y === 'ETL') s.lab = Array.from({ length: 10 }, (_, i) => ({ n: 'Assignment-' + (i + 1), s: '', m: 10 }));
    if (s.y === 'OC' || s.y === 'SS') s.oc = '';
    return s;
  }

  // ---------- rendering ----------
  function markBox(s, f, label, max) {
    return `<div class="mark" data-box="${f}"><label for="${s.id}-${f}">${label}</label><div class="val"><input id="${s.id}-${f}" data-f="${f}" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(s[f])}"><span class="max">/ ${max}</span></div></div>`;
  }

  function itemRows(s, key) {
    const list = s[key];
    const min = key === 'quiz' ? VC.LIMITS.quizItems[0] : VC.LIMITS.labItems[0];
    return `<div class="item-head"><span>Name</span><span>Score</span><span></span><span>Out of</span><span></span></div>` +
      list.map((it, i) => `<div class="item">
        <input data-f="${key}.${i}.n" value="${esc(it.n)}" aria-label="Name" maxlength="40">
        <input class="score" data-f="${key}.${i}.s" value="${esc(it.s)}" inputmode="decimal" placeholder="0" aria-label="${esc(it.n)} score">
        <span class="slash">/</span>
        <input class="imax" data-f="${key}.${i}.m" value="${esc(it.m)}" inputmode="decimal" aria-label="${esc(it.n)} out of">
        <button type="button" class="rm" data-act="rm" data-key="${key}" data-i="${i}" aria-label="Remove ${esc(it.n)}" ${list.length <= min ? 'disabled style="visibility:hidden"' : ''}>${ICON.x}</button>
      </div>`).join('');
  }

  function fold(s, key) {
    const isQuiz = key === 'quiz';
    const max = isQuiz ? VC.LIMITS.quizItems[1] : VC.LIMITS.labItems[1];
    const title = isQuiz ? 'Quizzes and assignments' : 'Lab';
    const note = isQuiz ? 'Max marks must add up to 30' : 'Any total, scaled to ' + (s.y === 'ETL' && !s.sep ? '25' : '100');
    return `<details class="fold" data-fold="${key}"><summary>${title}<span class="sum" data-sum="${key}"></span>${ICON.chev}</summary>
      <div class="fold-body"><div data-rows="${key}">${itemRows(s, key)}</div>
      <div class="fold-foot"><span class="note" data-note="${key}">${note}</span>
      <button type="button" class="btn btn-sm btn-ghost" data-act="add" data-key="${key}" ${s[key].length >= max ? 'hidden' : ''}>${ICON.plus}Add ${isQuiz ? 'item' : 'assignment'}</button></div></div></details>`;
  }

  function rangeInputs(s, key) {
    return `<div class="ranges" data-ranges="${key}">` + GRADE_KEYS.map(k =>
      `<div class="range"><label for="${s.id}-${key}-${k}" style="color:var(--g-${k})">${k}</label><input id="${s.id}-${key}-${k}" data-f="${key}.${k}" value="${esc(s[key][k])}" inputmode="decimal" placeholder="–"><small>and above</small></div>`).join('') + `</div>`;
  }

  function rangesFold(s) {
    const two = s.y === 'ETL' && s.sep;
    return `<details class="fold" data-fold="ranges"><summary>Grade ranges<span class="sum" data-sum="ranges"></span>${ICON.chev}</summary>
      <div class="fold-body"><p class="note" style="margin:0;font-size:12.5px;color:var(--text-2)">Enter the lowest mark for each grade in your class. Anything below E is F.</p>
      ${two ? '<p class="range-part">Theory (ETH)</p>' : ''}${rangeInputs(s, 'g')}
      ${two ? '<p class="range-part">Lab (ELA)</p>' + rangeInputs(s, 'gl') : ''}
      <p class="err" data-err="ranges"></p>
      <div class="fold-foot"><span></span><button type="button" class="btn btn-sm btn-ghost" data-act="copy-ranges">Use for all subjects</button></div></div></details>`;
  }

  function cardHTML(s) {
    const theory = s.y === 'TH' || s.y === 'ETL';
    const lab = s.y === 'LO' || s.y === 'ETL';
    return `<article class="card" data-id="${s.id}">
      <div class="card-head"><div class="meta"><div class="code">${esc(s.c)}</div><h2>${esc(s.t)}</h2>
        <div class="tags"><span class="pill">${TYPE[s.y] || s.y}</span><span class="pill">${fmt(s.cr)} credit${s.cr === 1 ? '' : 's'}</span>
        ${s.y === 'ETL' ? `<div class="seg" role="group" aria-label="How to show theory and lab"><button type="button" data-act="mode" data-sep="0" aria-pressed="${!s.sep}">Combined</button><button type="button" data-act="mode" data-sep="1" aria-pressed="${!!s.sep}">Separate</button></div>` : ''}</div></div>
        <button type="button" class="icon-btn" data-act="remove" aria-label="Remove ${esc(s.c)}"${isLocked() ? ' hidden' : ''}>${ICON.x}</button></div>
      <div class="card-body">
        ${theory ? `<div class="marks">${markBox(s, 'cat1', 'CAT-1', 15)}${markBox(s, 'cat2', 'CAT-2', 15)}${markBox(s, 'fat', 'FAT', 40)}</div>${fold(s, 'quiz')}` : ''}
        ${lab ? fold(s, 'lab') : ''}
        ${s.y === 'OC' || s.y === 'SS' ? `<div class="marks" style="grid-template-columns:1fr">${markBox(s, 'oc', 'Marks', 100)}</div>` : ''}
        <p class="err" data-err="marks"></p>
        ${rangesFold(s)}
        <div data-result></div>
      </div></article>`;
  }

  function ring(value, grade) {
    const C = 2 * Math.PI * 27, v = value === null ? 0 : Math.max(0, Math.min(100, value));
    const col = grade ? `var(--g-${grade})` : 'var(--text-3)';
    return `<div class="ring" style="--ring:${col}"><svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="27"/><circle class="bar" cx="32" cy="32" r="27" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - v / 100)).toFixed(2)}"/></svg><b>${value === null ? '–' : Math.round(value)}</b></div>`;
  }

  function resultHTML(s, parts) {
    return parts.map(p => {
      let split = p.label;
      if (p.thScaled !== undefined) split = `Theory ${fmt(p.thScaled)}/75 · Lab ${fmt(p.labScaled)}/25`;
      const g = p.grade
        ? `<div class="grade" style="--gc:var(--g-${p.grade})" aria-label="Grade ${p.grade}">${p.grade}</div>`
        : `<div class="grade none">Add grade ranges</div>`;
      return `<div class="result-row">${ring(p.value, p.grade)}<div class="info"><div class="total">${fmt(p.value)} <i>/ 100</i></div><div class="split">${split} · ${fmt(p.credits)} cr</div></div>${g}</div>`;
    }).join('');
  }

  // light update after typing: no input is re-rendered, so focus and cursor stay put
  function refresh(card, s) {
    const parts = VC.parts(s);
    $('[data-result]', card).innerHTML = resultHTML(s, parts);

    const errs = [...new Set(parts.flatMap(p => p.errs))];
    $('[data-err="marks"]', card).textContent = errs.slice(0, 3).join(' · ');

    card.querySelectorAll('[data-box]').forEach(box => {
      const f = box.dataset.box, max = { cat1: 15, cat2: 15, fat: 40, oc: 100 }[f];
      const n = VC.num(s[f]);
      box.classList.toggle('bad', n !== null && (Number.isNaN(n) || n < 0 || n > max));
    });
    ['quiz', 'lab'].forEach(key => {
      if (!s[key]) return;
      let got = 0, max = 0;
      s[key].forEach((it, i) => {
        const sc = VC.num(it.s), m = VC.num(it.m);
        const badM = m === null || Number.isNaN(m) || m <= 0 || m > VC.LIMITS.itemMax;
        const badS = sc !== null && (Number.isNaN(sc) || sc < 0 || (!badM && sc > m));
        const sIn = card.querySelector(`[data-f="${key}.${i}.s"]`), mIn = card.querySelector(`[data-f="${key}.${i}.m"]`);
        if (sIn) sIn.classList.toggle('bad', badS);
        if (mIn) mIn.classList.toggle('bad', badM);
        got += sc || 0; max += badM ? 0 : m;
      });
      $(`[data-sum="${key}"]`, card).textContent = fmt(got) + ' / ' + fmt(max);
    });

    const keys = s.y === 'ETL' && s.sep ? ['g', 'gl'] : ['g'];
    const rs = keys.map(k => VC.checkRanges(s[k]));
    $('[data-err="ranges"]', card).textContent = rs.map(r => r.err).filter(Boolean)[0] || '';
    keys.forEach((k, i) => card.querySelectorAll(`[data-ranges="${k}"] .range`).forEach(el => el.classList.toggle('bad', !!rs[i].err)));
    $('[data-sum="ranges"]', card).textContent = rs.every(r => r.ok) ? 'Set' : rs.some(r => r.err) ? 'Check' : 'Not set';
  }

  function renderCards() {
    const list = $('#cards');
    const subs = subjects();
    $('#empty').hidden = subs.length > 0;
    list.innerHTML = subs.map(cardHTML).join('');
    subs.forEach(s => refresh(list.querySelector(`[data-id="${s.id}"]`), s));
    renderSummary(); renderLock();
  }

  function renderSummary() {
    const subs = subjects();
    const g = VC.gpa(subs);
    if (!lock().confirmed) g.gpa = null;
    const gpaText = g.gpa === null ? '–' : g.gpa.toFixed(2);
    document.querySelectorAll('[data-gpa]').forEach(el => { el.textContent = gpaText; el.classList.toggle('muted', g.gpa === null); });
    document.querySelectorAll('[data-credits]').forEach(el => { el.textContent = fmt(g.credits); });
    document.querySelectorAll('[data-count]').forEach(el => { el.textContent = subs.length; });
    document.querySelectorAll('[data-count-label]').forEach(el => { el.textContent = subs.length + (subs.length === 1 ? ' subject' : ' subjects'); });
    const note = !subs.length ? 'Add subjects to see your GPA' : !lock().confirmed ? 'Confirm your subjects to see your GPA' : g.gpa === null ? 'Add grade ranges to see your GPA' : g.gradedCredits < g.credits ? `Based on ${fmt(g.gradedCredits)} of ${fmt(g.credits)} credits` : 'All subjects graded';
    document.querySelectorAll('[data-gpa-note]').forEach(el => { el.textContent = note; });
    $('#summary-list').innerHTML = subs.map(s => {
      const ps = VC.parts(s);
      const v = ps.map(p => (p.grade || fmt(p.value))).join(' · ');
      return `<li><span>${esc(s.c)} ${esc(s.t)}</span><b>${esc(v)}</b></li>`;
    }).join('');
  }

  // ---------- events on cards ----------
  function setField(s, path, value) {
    const k = path.split('.');
    if (k.length === 1) s[k[0]] = value;
    else if (k.length === 2) s[k[0]][k[1]] = value;
    else s[k[0]][+k[1]][k[2]] = value;
  }

  function bindCards() {
    const list = $('#cards');
    list.addEventListener('input', e => {
      const f = e.target.dataset.f; if (!f) return;
      const card = e.target.closest('.card'), s = byId(card.dataset.id);
      setField(s, f, e.target.value);
      refresh(card, s); renderSummary(); save();
    });
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const card = b.closest('.card'), s = byId(card.dataset.id), act = b.dataset.act;
      if (act === 'remove') {
        if (isLocked()) { vcToast('Your subjects are locked for now'); return; }
        unconfirm(); renderLock();
        state.sems[state.sem] = subjects().filter(x => x !== s);
        card.remove(); $('#empty').hidden = subjects().length > 0; renderSummary(); save();
        vcToast(s.c + ' removed');
        return;
      }
      if (act === 'mode') {
        s.sep = b.dataset.sep === '1';
        if (s.sep && VC.checkRanges(s.gl).empty) s.gl = Object.assign({}, s.g); // lab starts with the theory ranges
        rerenderCard(card, s);
      }
      if (act === 'add' || act === 'rm') {
        const key = b.dataset.key;
        if (act === 'add') { const n = s[key].length + 1; s[key].push(key === 'quiz' ? { n: 'Quiz ' + n, s: '', m: 5 } : { n: 'Assignment-' + n, s: '', m: 10 }); }
        else s[key].splice(+b.dataset.i, 1);
        rerenderCard(card, s);
        if (act === 'add') { const ins = card.querySelectorAll(`[data-rows="${key}"] .score`); ins[ins.length - 1].focus(); }
      }
      if (act === 'copy-ranges') {
        const keys = s.y === 'ETL' && s.sep ? ['g', 'gl'] : ['g'];
        if (!keys.every(k => VC.checkRanges(s[k]).ok)) { vcToast('Fill in valid ranges first'); return; }
        subjects().forEach(x => { if (x !== s) { x.g = Object.assign({}, s.g); x.gl = Object.assign({}, s.y === 'ETL' && s.sep ? s.gl : s.g); } });
        const open = openFolds();
        renderCards(); restoreFolds(open);
        vcToast('Ranges copied to all subjects');
      }
      renderSummary(); save();
    });
  }

  // re-render one card but keep its open sections open
  function rerenderCard(card, s) {
    const open = [...card.querySelectorAll('details[open]')].map(d => d.dataset.fold);
    const tmp = document.createElement('div'); tmp.innerHTML = cardHTML(s);
    const fresh = tmp.firstElementChild; fresh.style.animation = 'none';
    card.replaceWith(fresh);
    open.forEach(f => { const d = fresh.querySelector(`details[data-fold="${f}"]`); if (d) d.open = true; });
    refresh(fresh, s);
  }
  const openFolds = () => [...document.querySelectorAll('.card details[open]')].map(d => d.closest('.card').dataset.id + '|' + d.dataset.fold);
  const restoreFolds = list => list.forEach(x => { const [id, f] = x.split('|'); const d = document.querySelector(`.card[data-id="${id}"] details[data-fold="${f}"]`); if (d) { d.open = true; d.closest('.card').style.animation = 'none'; } });

  // ---------- search ----------
  let catalog = [];
  function addSubject(c) {
    if (isLocked()) { vcToast('Your subjects are locked for now'); return; }
    if (subjects().some(s => s.c === c.c)) { vcToast(c.c + ' is already added'); return; }
    unconfirm();
    const s = newSubject(c);
    subjects().push(s); save();
    $('#empty').hidden = true;
    const tmp = document.createElement('div'); tmp.innerHTML = cardHTML(s);
    const card = tmp.firstElementChild;
    $('#cards').appendChild(card); refresh(card, s); renderSummary(); renderLock();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const first = card.querySelector('input[data-f]'); if (first && matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
  }

  function bindSearch() {
    const input = $('#search'), box = $('#results');
    let hits = [], active = -1;
    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
    function show() {
      const q = input.value.trim().toUpperCase();
      if (!q) { close(); return; }
      const words = q.split(/\s+/);
      hits = catalog.filter(c => {
        const hay = (c.c + ' ' + c.t).toUpperCase();
        return words.every(w => hay.includes(w));
      }).sort((a, b) => (b.c.startsWith(q) - a.c.startsWith(q)) || a.c.localeCompare(b.c)).slice(0, 12);
      const added = new Set(subjects().map(s => s.c));
      box.innerHTML = hits.length
        ? hits.map((c, i) => `<button type="button" role="option" class="result${added.has(c.c) ? ' added' : ''}" data-i="${i}" id="opt-${i}"><span class="code">${esc(c.c)}</span><span class="title">${esc(c.t)}</span>${c.cur === 'old' ? '<span class="pill" title="2021–2025 curriculum">Old</span>' : ''}<span class="pill">${TYPE[c.y] || c.y} · ${fmt(c.cr)}</span></button>`).join('')
        : `<div class="none">No subject matches “${esc(input.value.trim())}”.<br><button type="button" class="btn btn-sm" data-custom>${ICON.plus}Add it yourself</button></div>`;
      box.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
    }
    function pick(i) { const c = hits[i]; if (!c) return; addSubject(c); input.value = ''; close(); }
    input.addEventListener('input', show);
    input.addEventListener('focus', () => { if (input.value.trim()) show(); });
    input.addEventListener('keydown', e => {
      const opts = box.querySelectorAll('.result');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!opts.length) return; e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.classList.toggle('active', i === active));
        input.setAttribute('aria-activedescendant', 'opt-' + active);
        opts[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); pick(active >= 0 ? active : 0); }
      else if (e.key === 'Escape') close();
    });
    box.addEventListener('click', e => {
      const r = e.target.closest('.result'); if (r) { pick(+r.dataset.i); return; }
      if (e.target.closest('[data-custom]')) { openCustom(input.value.trim()); close(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) close(); });
  }

  // ---------- add your own subject ----------
  function openCustom(prefill) {
    const d = $('#custom'), f = d.querySelector('form');
    f.reset();
    if (prefill && /^[A-Za-z]{2,6}\d{2,4}[A-Za-z]?$/.test(prefill)) f.code.value = prefill.toUpperCase();
    else if (prefill) f.title.value = prefill;
    $('#custom-err').textContent = '';
    d.showModal();
  }
  function bindCustom() {
    const d = $('#custom'), f = d.querySelector('form');
    document.querySelectorAll('[data-open-custom]').forEach(b => b.addEventListener('click', () => openCustom('')));
    f.addEventListener('submit', e => {
      if (e.submitter && e.submitter.value === 'cancel') return;
      e.preventDefault();
      const code = f.code.value.trim().toUpperCase(), title = f.title.value.trim(), cr = VC.num(f.credits.value);
      let err = '';
      if (!/^[A-Z0-9]{3,12}$/.test(code)) err = 'Enter a course code like BACSE103';
      else if (!title) err = 'Enter the course title';
      else if (cr === null || Number.isNaN(cr) || cr <= 0 || cr > 20) err = 'Credits must be between 0.5 and 20';
      if (err) { $('#custom-err').textContent = err; return; }
      d.close();
      addSubject({ c: code, t: title, y: f.type.value, cr, custom: true });
    });
  }

  function renderLock() {
    const bar = $('#lockbar'), n = subjects().length, cr = totalCredits(), L = lock();
    const search = $('#search');
    search.disabled = isLocked();
    search.placeholder = isLocked() ? 'Subjects are locked for this semester' : 'Search by code or name, e.g. BACSE103';
    document.querySelectorAll('[data-open-custom]').forEach(b => { b.hidden = isLocked(); });
    if (!n) { bar.hidden = true; return; }
    bar.hidden = false;
    if (isLocked()) {
      const t = new Date(L.until).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      bar.className = 'lockbar locked';
      bar.innerHTML = `<div><b>Subjects confirmed</b><span>${n} subject${n === 1 ? '' : 's'} · ${fmt(cr)} credits. You can change them after ${t}.</span></div>`;
    } else if (L.confirmed) {
      bar.className = 'lockbar done';
      bar.innerHTML = `<div><b>Subjects confirmed</b><span>${n} subject${n === 1 ? '' : 's'} · ${fmt(cr)} credits. Adding or removing a subject means confirming again.</span></div>`;
    } else {
      bar.className = 'lockbar';
      bar.innerHTML = `<div><b>${n} subject${n === 1 ? '' : 's'} · ${fmt(cr)} credits</b><span>Confirm your subjects to see your GPA. Most semesters are ${CREDITS.low}–${CREDITS.high} credits.</span></div><button type="button" class="btn btn-sm btn-gold" data-confirm-subjects>Confirm subjects</button>`;
    }
  }

  // generic yes/no dialog -> Promise<boolean>
  function ask(title, msg, yes, danger) {
    const d = $('#ask');
    $('#ask-title').textContent = title; $('#ask-msg').textContent = msg;
    const ok = $('#ask-ok'); ok.textContent = yes || 'Continue'; ok.hidden = !!danger;
    $('#ask-cancel').textContent = danger ? 'Got it' : 'Go back';
    d.showModal();
    // resolve from the button press itself; the dialog 'close' event isn't fired reliably in every browser
    return new Promise(res => {
      const form = d.querySelector('form');
      const done = v => { form.removeEventListener('submit', onSubmit); d.removeEventListener('cancel', onCancel); if (d.open) d.close(); res(v); };
      const onSubmit = e => { e.preventDefault(); done(!!e.submitter && e.submitter.value === 'ok'); };
      const onCancel = e => { e.preventDefault(); done(false); };
      form.addEventListener('submit', onSubmit);
      d.addEventListener('cancel', onCancel);
    });
  }

  async function confirmSubjects() {
    const cr = totalCredits();
    if (cr > CREDITS.max) { await ask('Too many credits', `You've added ${fmt(cr)} credits. A semester can't be more than ${CREDITS.max} credits, so remove some subjects and try again.`, '', true); return; }
    if (cr < CREDITS.low || cr > CREDITS.high) {
      const low = cr < CREDITS.low;
      if (!await ask(low ? 'Fewer credits than usual' : 'More credits than usual', `You've added ${fmt(cr)} credits. Most semesters are ${CREDITS.low}–${CREDITS.high} credits. Are these really all your subjects?`, 'Yes, they are')) return;
    }
    const sem = $('#semester').selectedOptions[0].textContent;
    if (!await ask('Confirm your subjects', `${subjects().length} subjects, ${fmt(cr)} credits for ${sem}. After confirming you can't add or remove subjects for 12 hours. You can still change your marks.`, 'Confirm')) return;
    state.locks = state.locks || {};
    state.locks[state.sem] = { confirmed: true, until: Date.now() + LOCK_MS };
    save(); renderCards();
    vcToast('Subjects confirmed');
  }

  // ---------- semester ----------
  function bindSemester() {
    const sel = $('#semester');
    if (!SEMS.list.some(s => s.id === state.sem)) state.sem = SEMS.def;
    sel.innerHTML = SEMS.list.map(s => `<option value="${s.id}"${s.id === state.sem ? ' selected' : ''}>${s.name}</option>`).join('');
    sel.addEventListener('change', () => { state.sem = sel.value; save(); renderCards(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindSemester(); bindCards(); bindSearch(); bindCustom(); renderCards();
    $('#lockbar').addEventListener('click', e => { if (e.target.closest('[data-confirm-subjects]')) confirmSubjects(); });
    let wasLocked = isLocked();
    setInterval(() => { if (wasLocked && !isLocked()) renderCards(); wasLocked = isLocked(); }, 30000);
    fetch('data/subjects.json').then(r => r.json()).then(list => { catalog = list.filter(c => c.y !== 'PJT'); }).catch(() => vcToast("Couldn't load the subject list. You can still add subjects yourself."));
  });
})();
