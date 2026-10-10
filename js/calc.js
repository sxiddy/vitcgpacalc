// Marks, grade and GPA maths. No DOM here so it can be tested with Node (tools/test-calc.js).
(function (root) {
  const GRADES = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
  const POINTS = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0 };
  const LIMITS = { cat1: 15, cat2: 15, fat: 40, quizTotal: 30, quizItems: [1, 6], labItems: [1, 15], itemMax: 100 };

  // '' -> null, '12.5' -> 12.5, 'abc' -> NaN
  function num(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : NaN;
  }
  const r2 = n => Math.round(n * 100) / 100;

  // checks one score against its max; returns an error message or ''
  function checkScore(v, max, label) {
    const n = num(v);
    if (n === null) return '';
    if (Number.isNaN(n)) return label + ' must be a number';
    if (n < 0) return label + " can't be negative";
    if (n > max) return label + ' is out of ' + max;
    return '';
  }

  // a list of {n, s, m} items (name, score, max) -> { got, max, errs }
  function items(list, label) {
    let got = 0, max = 0;
    const errs = [];
    list.forEach((it, i) => {
      const m = num(it.m);
      const name = (it.n || label + ' ' + (i + 1)).trim();
      if (m === null || Number.isNaN(m) || m <= 0 || m > LIMITS.itemMax) { errs.push(name + ': max marks must be 1–' + LIMITS.itemMax); return; }
      const e = checkScore(it.s, m, name);
      if (e) errs.push(e);
      max += m;
      got += num(it.s) || 0;
    });
    return { got, max, errs };
  }

  // theory out of 100: CAT-1 /15 + CAT-2 /15 + FAT /40 + quizzes /30
  function theory(s) {
    const errs = [];
    ['cat1', 'cat2', 'fat'].forEach(k => {
      const e = checkScore(s[k], LIMITS[k], { cat1: 'CAT-1', cat2: 'CAT-2', fat: 'FAT' }[k]);
      if (e) errs.push(e);
    });
    const q = items(s.quiz || [], 'Quiz');
    errs.push(...q.errs);
    if (!q.errs.length && r2(q.max) !== LIMITS.quizTotal) errs.push('Quiz max marks add up to ' + r2(q.max) + ', they should add up to 30');
    const value = (num(s.cat1) || 0) + (num(s.cat2) || 0) + (num(s.fat) || 0) + q.got;
    return { value: errs.length ? null : r2(value), quiz: q, errs };
  }

  // lab out of 100, whatever the items add up to
  function lab(s) {
    const l = items(s.lab || [], 'Assignment');
    const errs = l.errs.slice();
    if (!errs.length && l.max <= 0) errs.push('Add at least one lab item');
    return { value: errs.length ? null : r2((l.got / l.max) * 100), got: l.got, max: l.max, errs };
  }

  function single(s) {
    const e = checkScore(s.oc, 100, 'Marks');
    return { value: e ? null : r2(num(s.oc) || 0), errs: e ? [e] : [] };
  }

  // ranges = { S: '84', A: '71', ... E: '50' } minimum marks for each grade; F is anything below E
  function checkRanges(g) {
    const vals = GRADES.slice(0, 6).map(k => num(g && g[k]));
    if (vals.every(v => v === null)) return { ok: false, empty: true, err: '' };
    if (vals.some(v => v === null)) return { ok: false, empty: false, err: 'Fill in all six grade cut-offs' };
    if (vals.some(v => Number.isNaN(v) || v < 0 || v > 100)) return { ok: false, empty: false, err: 'Cut-offs must be between 0 and 100' };
    for (let i = 1; i < vals.length; i++) if (vals[i] >= vals[i - 1]) return { ok: false, empty: false, err: GRADES[i] + ' must start below ' + GRADES[i - 1] };
    return { ok: true, empty: false, err: '' };
  }

  function gradeOf(value, g) {
    if (value === null || !checkRanges(g).ok) return null;
    for (const k of GRADES.slice(0, 6)) if (value >= num(g[k])) return k;
    return 'F';
  }

  // ETL credits split: theory gets L + T, lab gets P / 2 (e.g. L3 P2 -> 3 + 1)
  function splitCredits(s) {
    const t = (s.l || 0) + (s.tu || 0), lc = (s.p || 0) / 2;
    if (t > 0 && lc > 0 && t + lc === s.cr) return { th: t, lab: lc };
    return { th: Math.max(s.cr - 1, 0), lab: Math.min(s.cr, 1) };
  }

  // every gradeable part of a subject: [{ key, label, value, max, credits, grade, errs }]
  function parts(s) {
    const y = s.y;
    if (y === 'TH') { const t = theory(s); return [{ key: 'all', label: 'Theory', value: t.value, credits: s.cr, grade: gradeOf(t.value, s.g), errs: t.errs, theory: t }]; }
    if (y === 'LO') { const l = lab(s); return [{ key: 'all', label: 'Lab', value: l.value, credits: s.cr, grade: gradeOf(l.value, s.g), errs: l.errs, lab: l }]; }
    if (y === 'ETL') {
      const t = theory(s), l = lab(s);
      if (s.sep) {
        const c = splitCredits(s);
        return [
          { key: 'th', label: 'Theory (ETH)', value: t.value, credits: c.th, grade: gradeOf(t.value, s.g), errs: t.errs, theory: t },
          { key: 'lab', label: 'Lab (ELA)', value: l.value, credits: c.lab, grade: gradeOf(l.value, s.gl), errs: l.errs, lab: l }
        ];
      }
      const ok = t.value !== null && l.value !== null;
      const value = ok ? r2(t.value * 0.75 + l.value * 0.25) : null;
      return [{ key: 'all', label: 'Total', value, credits: s.cr, grade: gradeOf(value, s.g), errs: t.errs.concat(l.errs), theory: t, lab: l,
        thScaled: t.value === null ? null : r2(t.value * 0.75), labScaled: l.value === null ? null : r2(l.value * 0.25) }];
    }
    const o = single(s);
    return [{ key: 'all', label: 'Marks', value: o.value, credits: s.cr, grade: gradeOf(o.value, s.g), errs: o.errs }];
  }

  // GPA = sum(credits x points) / sum(credits), over parts that have a grade
  function gpa(subjects) {
    let pts = 0, cr = 0, total = 0, graded = 0;
    subjects.forEach(s => parts(s).forEach(p => {
      total += p.credits;
      if (p.grade) { graded++; pts += p.credits * POINTS[p.grade]; cr += p.credits; }
    }));
    return { gpa: cr ? r2(pts / cr) : null, credits: total, gradedCredits: cr, graded };
  }

  const VC = { GRADES, POINTS, LIMITS, num, theory, lab, single, checkRanges, gradeOf, splitCredits, parts, gpa };
  if (typeof module !== 'undefined' && module.exports) module.exports = VC; else root.VC = VC;
})(this);
