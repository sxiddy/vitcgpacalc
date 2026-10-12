// Joining the marks in this browser with the ones saved to the account. No DOM, tested in tools/test-server.js.
// data = { state, cgpa, share }: the calculator ('vc-state'), CGPA page ('vc-cgpa') and share page ('vc-share').
(function (root) {
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const has = v => v !== null && v !== undefined && String(v).trim() !== '';

  // how much has been typed into a subject, to keep the fuller copy when both have it
  function filled(s) {
    let n = 0;
    ['cat1', 'cat2', 'fat', 'oc'].forEach(k => { if (has(s[k])) n++; });
    ['quiz', 'lab'].forEach(k => (s[k] || []).forEach(it => { if (has(it.s)) n++; }));
    ['g', 'gl'].forEach(k => Object.values(s[k] || {}).forEach(v => { if (has(v)) n++; }));
    return n;
  }

  // one semester's subjects from both sides, matched by course code
  function mergeSubjects(remote, local) {
    const out = (remote || []).slice();
    (local || []).forEach(l => {
      const i = out.findIndex(r => r.c === l.c);
      if (i < 0) out.push(l);
      else if (filled(l) > filled(out[i])) out[i] = l;
    });
    return out;
  }

  const lockedNow = (locks, id, now) => !!(locks && locks[id] && locks[id].confirmed && locks[id].until > now);
  const emptyCgpa = c => !c || (!has(c.quick && c.quick.cgpa) && !has(c.quick && c.quick.credits) && !(c.past || []).length && !(c.cleared || []).length);
  const emptyState = s => !s || !Object.values(s.sems || {}).some(l => l && l.length);
  const isEmpty = d => !d || (emptyState(d.state) && emptyCgpa(d.cgpa));

  function unionRows(a, b) {
    const key = r => r.id || [r.name, r.gpa, r.credits].join('|');
    const seen = new Set((a || []).map(key));
    return (a || []).concat((b || []).filter(r => !seen.has(key(r)) && !(a || []).some(x => same([x.name, x.gpa, x.credits], [r.name, r.gpa, r.credits]))));
  }

  // first sign-in on this device: keep everything from both sides
  function signIn(local, remote, locks, now) {
    local = local || {}; remote = remote || {};
    const out = {};
    if (emptyState(remote.state)) out.state = local.state || remote.state || null;
    else if (emptyState(local.state)) out.state = Object.assign({}, remote.state, local.state && local.state.sem ? { sem: local.state.sem } : {});
    else {
      const sems = {}, L = local.state.sems || {}, R = remote.state.sems || {};
      new Set(Object.keys(R).concat(Object.keys(L))).forEach(id => {
        sems[id] = lockedNow(locks, id, now) || !(L[id] || []).length ? (R[id] || []) : !(R[id] || []).length ? L[id] : mergeSubjects(R[id], L[id]);
      });
      out.state = Object.assign({}, remote.state, { sems, sem: local.state.sem || remote.state.sem, locks: Object.assign({}, locks) });
    }
    if (emptyCgpa(remote.cgpa)) out.cgpa = local.cgpa || remote.cgpa || null;
    else if (emptyCgpa(local.cgpa)) out.cgpa = remote.cgpa;
    else {
      const R = remote.cgpa, L = local.cgpa;
      const rq = has(R.quick && R.quick.cgpa) || has(R.quick && R.quick.credits);
      out.cgpa = Object.assign({}, L, R, { quick: rq ? R.quick : L.quick, past: unionRows(R.past, L.past), cleared: unionRows(R.cleared, L.cleared) });
    }
    out.share = remote.share || local.share || null;
    return out;
  }

  // Later syncs: what changed here since the last sync (base) wins, everything else comes from the account.
  function rebase(local, base, remote, locks, now) {
    local = local || {}; base = base || {}; remote = remote || {};
    const out = {};
    const ls = local.state || { sems: {} }, bs = base.state || { sems: {} }, rs = remote.state || { sems: {} };
    if (!local.state && !remote.state) out.state = null;
    else {
      const sems = {}, L = ls.sems || {}, B = bs.sems || {}, R = rs.sems || {};
      new Set(Object.keys(R).concat(Object.keys(L), Object.keys(B))).forEach(id => {
        const v = same(L[id], B[id]) ? R[id] : L[id];
        if (v !== undefined) sems[id] = v;
      });
      out.state = Object.assign({}, rs, ls, { sems, locks: Object.assign({}, rs.locks || {}) });
    }
    ['cgpa', 'share'].forEach(k => { out[k] = same(local[k], base[k]) ? remote[k] || null : local[k] || null; });
    return respectLocks(out, remote, locks, now);
  }

  // a semester locked on the server keeps the server's subject list
  function respectLocks(data, remote, locks, now) {
    if (!data.state) return data;
    const R = (remote && remote.state && remote.state.sems) || {};
    const codes = l => (l || []).map(s => s.c).sort().join(',');
    Object.keys(locks || {}).forEach(id => {
      if (lockedNow(locks, id, now) && codes(data.state.sems[id]) !== codes(R[id])) data.state.sems[id] = R[id] || [];
    });
    data.state.locks = Object.assign({}, locks || data.state.locks || {});
    return data;
  }

  const VCMerge = { same, filled, mergeSubjects, signIn, rebase, respectLocks, isEmpty };
  if (typeof module !== 'undefined' && module.exports) module.exports = VCMerge; else root.VCMerge = VCMerge;
})(this);
