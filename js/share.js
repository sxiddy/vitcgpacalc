// Share page: pick subjects, GPA and CGPA, preview the card, save it as PNG or share it.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => (n === null || n === undefined ? '–' : (Math.round(n * 100) / 100).toString());
  const read = k => vcData.get(k);

  // ---------- state ----------
  const cs = read('vc-state') || { sems: {}, locks: {} };
  cs.sems = cs.sems || {}; cs.locks = cs.locks || {};
  const cg = read('vc-cgpa') || {};
  let st = Object.assign({ size: 'story', design: 'glow', hide: false, pick: {}, off: {}, sem: '' }, read('vc-share') || {});
  const save = () => vcData.set('vc-share', st);

  const semIds = Object.keys(cs.sems).filter(id => (cs.sems[id] || []).length).sort((a, b) => VC.semOrder(b) - VC.semOrder(a));
  if (!semIds.includes(st.sem)) st.sem = semIds.includes(cs.sem) ? cs.sem : semIds[0] || cs.sem || '';

  // has the student typed any mark for this subject? empty boxes count as 0 in the maths
  const typed = s => ['cat1', 'cat2', 'fat', 'oc'].some(k => VC.num(s[k]) !== null) || ['quiz', 'lab'].some(k => (s[k] || []).some(it => VC.num(it.s) !== null));

  // every gradeable part of this semester's subjects; ETH and ELA shown separately become two rows
  function candidates() {
    const out = [];
    (cs.sems[st.sem] || []).forEach(s => {
      const ps = VC.parts(s), has = typed(s);
      ps.forEach(p => out.push({
        id: s.id + '|' + p.key, code: s.c, title: s.t + (ps.length > 1 ? (p.key === 'lab' ? ' (Lab)' : ' (Theory)') : ''),
        mark: has ? p.value : null, grade: has ? p.grade : null
      }));
    });
    return out;
  }
  // why a row can't go on the card right now, or ''
  function blocked(r) {
    if (!r.grade && r.mark === null) return 'Add marks first';
    if (st.hide && !r.grade) return 'Add grade ranges to show a grade';
    return '';
  }

  function stats() {
    const out = [];
    const subs = cs.sems[st.sem] || [], confirmed = !!(cs.locks[st.sem] && cs.locks[st.sem].confirmed);
    const g = VC.gpa(subs);
    out.push({ key: 'gpa', label: 'Semester GPA', value: confirmed && g.gpa !== null ? g.gpa.toFixed(2) : null,
      why: !subs.length ? 'Add subjects in the calculator' : !confirmed ? 'Confirm your subjects in the calculator' : 'Add grade ranges in the calculator' });
    const sum = VC.cgpaSummary(cg, cs);
    let c = null, label = 'CGPA', note = '';
    if (sum.after && sum.after.cgpa !== null) {
      c = sum.after.cgpa; label = 'Projected CGPA';
      if (sum.before.cgpa !== null) { const d = Math.round((sum.after.cgpa - sum.before.cgpa) * 100) / 100; note = d > 0 ? '▲ +' + d.toFixed(2) : d < 0 ? '▼ ' + d.toFixed(2) : ''; }
    } else if (sum.before.cgpa !== null) c = sum.before.cgpa;
    out.push({ key: 'cgpa', label, value: c === null ? null : c.toFixed(2), note, why: 'Fill in the CGPA page first' });
    return out;
  }

  function cardData() {
    const rows = candidates().filter(r => !blocked(r) && st.pick[r.id] !== false)
      .map(r => ({ code: r.code, title: r.title, grade: r.grade, mark: st.hide ? null : r.mark }));
    const ss = stats().filter(s => s.value !== null && !st.off[s.key]).map(s => ({ label: s.label, value: s.value, note: s.note }));
    return { sem: VC.semName(st.sem) || 'This semester', rows, stats: ss, hideMarks: st.hide };
  }

  // ---------- rendering ----------
  const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';
  function pickHTML(id, on, main, sub, side, why) {
    return `<li><label class="pick${why ? ' off' : ''}"><input type="checkbox" data-pick="${esc(id)}"${on && !why ? ' checked' : ''}${why ? ' disabled' : ''}><span class="box" aria-hidden="true">${TICK}</span>
      <span class="pick-main"><b>${esc(main)}</b><small>${esc(why || sub)}</small></span>${side}</label></li>`;
  }

  function renderControls() {
    document.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === st.size)));
    $('#hide-marks').checked = st.hide;

    $('#sem-field').hidden = semIds.length < 2;
    $('#sem').innerHTML = semIds.map(id => `<option value="${id}"${id === st.sem ? ' selected' : ''}>${esc(VC.semName(id))}</option>`).join('');

    $('#stat-picks').innerHTML = stats().map(s => pickHTML('stat:' + s.key, !st.off[s.key], s.label, s.note ? s.note.replace('▲', 'Up').replace('▼', 'Down') + ' this semester' : s.key === 'gpa' ? VC.semName(st.sem) : 'Across all your semesters',
      `<span class="pick-val">${s.value === null ? '–' : esc(s.value)}</span>`, s.value === null ? s.why : '')).join('');

    const cands = candidates();
    $('#subject-picks').innerHTML = cands.length ? cands.map(r => {
      const side = r.grade ? `<span class="pick-grade" style="--gc:var(--g-${r.grade})">${r.grade}</span>` : '';
      const sub = r.mark === null ? r.title : (st.hide ? r.title : fmt(r.mark) + ' / 100 · ' + r.title);
      return pickHTML(r.id, st.pick[r.id] !== false, r.code, sub, side, blocked(r));
    }).join('') : `<li class="sem-empty">No subjects yet. Add them in the <a href="calc">calculator</a>.</li>`;
    const usable = cands.filter(r => !blocked(r));
    $('#all-btn').hidden = !usable.length;
    $('#all-btn').textContent = usable.every(r => st.pick[r.id] !== false) ? 'Clear all' : 'Select all';

    $('#designs').innerHTML = Object.keys(VCCard.DESIGNS).map(k => `<button type="button" class="design" data-design="${k}" aria-pressed="${k === st.design}"><canvas width="216" height="${st.size === 'story' ? 384 : 216}" data-thumb="${k}"></canvas><span>${VCCard.DESIGNS[k].name}</span></button>`).join('');
  }

  let queued = false;
  function paint() {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const d = cardData(), empty = !d.rows.length && !d.stats.length;
      const canvas = $('#card');
      const fitted = VCCard.draw(canvas, d, { size: st.size, design: st.design });
      $('#fit-note').textContent = fitted.shown < fitted.total
        ? `This ${st.size === 'story' ? 'story' : 'square card'} fits ${fitted.shown} of your ${fitted.total} subjects, so the rest show as “+ more”. ${st.size === 'square' ? 'The story size fits more.' : 'Pick fewer to show them all.'}` : '';
      $('#frame').dataset.size = st.size;
      $('#frame').classList.toggle('empty', empty);
      $('#save-btn').disabled = empty; $('#share-btn').disabled = empty;
      // design thumbnails: draw full size off-screen, then shrink
      const big = document.createElement('canvas');
      document.querySelectorAll('[data-thumb]').forEach(t => {
        VCCard.draw(big, d, { size: st.size, design: t.dataset.thumb });
        const c = t.getContext('2d'); c.clearRect(0, 0, t.width, t.height); c.drawImage(big, 0, 0, t.width, t.height);
      });
    });
  }
  function render() { renderControls(); paint(); }

  // ---------- saving and sharing ----------
  const fileName = () => `vitcgpa-${st.size}.png`;
  const blob = () => new Promise(res => $('#card').toBlob(res, 'image/png'));
  async function saveImage() {
    const b = await blob(); if (!b) { vcToast("Couldn't make the image. Try again."); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    vcToast('Image saved');
  }
  async function shareImage() {
    const b = await blob(); if (!b) return;
    const file = new File([b], fileName(), { type: 'image/png' });
    try { await navigator.share({ files: [file], title: 'My VIT results', text: 'Work out yours at ' + VCCard.URL }); }
    catch (e) { if (e && e.name !== 'AbortError') saveImage(); }
  }
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; }
  }

  // ---------- events ----------
  document.addEventListener('DOMContentLoaded', () => {
    render();
    VCCard.ready().then(paint);
    if (canShareFiles() && matchMedia('(pointer: coarse)').matches) $('#share-btn').hidden = false;

    document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => { st.size = b.dataset.size; save(); render(); }));
    $('#hide-marks').addEventListener('change', e => { st.hide = e.target.checked; save(); render(); });
    $('#sem').addEventListener('change', e => { st.sem = e.target.value; save(); render(); });
    document.querySelector('.sh-controls').addEventListener('change', e => {
      const id = e.target.dataset.pick; if (!id) return;
      if (id.startsWith('stat:')) st.off[id.slice(5)] = !e.target.checked; else st.pick[id] = e.target.checked;
      save(); render();
    });
    $('#all-btn').addEventListener('click', () => {
      const usable = candidates().filter(r => !blocked(r)), on = !usable.every(r => st.pick[r.id] !== false);
      usable.forEach(r => { st.pick[r.id] = on; });
      save(); render();
    });
    $('#designs').addEventListener('click', e => { const b = e.target.closest('[data-design]'); if (!b) return; st.design = b.dataset.design; save(); render(); });
    $('#save-btn').addEventListener('click', saveImage);
    $('#share-btn').addEventListener('click', shareImage);
    addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
    // marks loaded from the account: start again from them
    addEventListener('vc-sync', () => location.reload());
  });
})();
