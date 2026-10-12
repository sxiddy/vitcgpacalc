// Run: node tools/test-server.js   (no network: api/ runs on in-memory storage with the test sign-in)
process.env.VC_DEV = '1';
process.env.ADMIN_KEY = 'test-admin-key';
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL; delete process.env.VERCEL;
const crypto = require('crypto');
const core = require('../api/_lib/core');
const M = require('../js/merge.js');
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };

// ---------- Google token claims ----------
const now = 1800000000;
const good = { aud: 'cid', iss: 'https://accounts.google.com', exp: now + 600, iat: now, sub: '123', email: 'A.B2026@VITstudent.ac.in', email_verified: true, hd: 'vitstudent.ac.in', name: 'A B', picture: 'https://lh3.googleusercontent.com/a/x' };
eq('VIT student token is accepted', core.checkClaims(good, 'cid', now).user, { sub: '123', email: 'a.b2026@vitstudent.ac.in', name: 'A B', pic: 'https://lh3.googleusercontent.com/a/x' });
eq('gmail is refused', core.checkClaims(Object.assign({}, good, { email: 'x@gmail.com', hd: undefined }), 'cid', now).status, 403);
eq('hd claim alone is not enough', core.checkClaims(Object.assign({}, good, { email: 'x@gmail.com' }), 'cid', now).err, 'not-vit');
eq('email alone is not enough (no hd)', core.checkClaims(Object.assign({}, good, { hd: undefined }), 'cid', now).err, 'not-vit');
eq('staff domain is refused', core.checkClaims(Object.assign({}, good, { email: 'x@vit.ac.in', hd: 'vit.ac.in' }), 'cid', now).err, 'not-vit');
eq('look-alike domain is refused', core.checkClaims(Object.assign({}, good, { email: 'x@evilvitstudent.ac.in' }), 'cid', now).err, 'not-vit');
eq('other app’s token is refused', core.checkClaims(good, 'other', now).err, 'wrong-audience');
eq('expired token is refused', core.checkClaims(Object.assign({}, good, { exp: now - 120 }), 'cid', now).err, 'expired');
eq('unverified email is refused', core.checkClaims(Object.assign({}, good, { email_verified: false }), 'cid', now).err, 'not-verified');
eq('wrong issuer is refused', core.checkClaims(Object.assign({}, good, { iss: 'evil.com' }), 'cid', now).err, 'wrong-issuer');

// RS256 signature check with a key made here
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const signed = b64({ alg: 'RS256', kid: 'k1' }) + '.' + b64(good);
const token = signed + '.' + crypto.sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url');
const jwk = publicKey.export({ format: 'jwk' });
eq('signed token verifies', core.verifyRs256(core.splitJwt(token), jwk), true);
const forged = b64({ alg: 'RS256', kid: 'k1' }) + '.' + b64(Object.assign({}, good, { sub: '999' })) + '.' + token.split('.')[2];
eq('changed token fails', core.verifyRs256(core.splitJwt(forged), jwk), false);
eq('garbage is not a token', core.splitJwt('abc'), null);

// ---------- locks and saves ----------
const T = 1e12, H = 3600e3;
const sub = c => ({ c, cr: 4 });
const data = sems => ({ state: { sem: 'FALLSEM2026-27', sems }, cgpa: null, share: null });
const lockA = { 'FALLSEM2026-27': { confirmed: true, until: T + 6 * H, codes: ['A', 'B'] } };
eq('confirm locks for 12 hours', core.confirmLock(data({ 'FALLSEM2026-27': [sub('B'), sub('A')] }), {}, 'FALLSEM2026-27', T).lock, { confirmed: true, until: T + 12 * H, codes: ['A', 'B'] });
eq('confirm again while locked is refused', core.confirmLock(data({ 'FALLSEM2026-27': [sub('A')] }), lockA, 'FALLSEM2026-27', T).status, 409);
eq('confirm after the lock ended is fine', core.confirmLock(data({ 'FALLSEM2026-27': [sub('A')] }), lockA, 'FALLSEM2026-27', T + 7 * H).status, 200);
eq('confirm with no subjects is refused', core.confirmLock(data({}), {}, 'FALLSEM2026-27', T).err, 'no-subjects');
eq('confirm over 35 credits is refused', core.confirmLock(data({ 'FALLSEM2026-27': Array.from({ length: 9 }, (_, i) => sub('S' + i)) }), {}, 'FALLSEM2026-27', T).err, 'too-many-credits');
eq('bad semester id is refused', core.confirmLock(data({}), {}, '../x', T).err, 'bad-semester');

const cur = { rev: 3, data: data({ 'FALLSEM2026-27': [sub('A'), sub('B')] }) };
eq('stale save is refused', core.prepareSave(cur, lockA, { rev: 2, data: cur.data }, T).status, 409);
eq('marks can change while locked', core.prepareSave(cur, lockA, { rev: 3, data: data({ 'FALLSEM2026-27': [Object.assign(sub('A'), { cat1: '12' }), sub('B')] }) }, T).status, 200);
eq('adding a subject while locked is refused', core.prepareSave(cur, lockA, { rev: 3, data: data({ 'FALLSEM2026-27': [sub('A'), sub('B'), sub('C')] }) }, T).err, 'locked');
eq('removing a subject while locked is refused', core.prepareSave(cur, lockA, { rev: 3, data: data({ 'FALLSEM2026-27': [sub('A')] }) }, T).err, 'locked');
const forgedLock = data({ 'FALLSEM2026-27': [sub('A')] }); forgedLock.state.locks = { 'FALLSEM2026-27': { confirmed: true, until: 0 } };
eq('browser can’t end the lock early', core.prepareSave(cur, lockA, { rev: 3, data: forgedLock }, T).err, 'locked');
const after = core.prepareSave(cur, lockA, { rev: 3, data: data({ 'FALLSEM2026-27': [sub('A')] }) }, T + 7 * H);
eq('after the lock, changing subjects unconfirms', [after.status, after.locks, after.locksChanged], [200, { 'FALLSEM2026-27': { confirmed: false, until: 0 } }, true]);
eq('saved copy carries the server locks', core.prepareSave(cur, lockA, { rev: 3, data: forgedLock }, T + 7 * H).data.state.locks, { 'FALLSEM2026-27': { confirmed: false, until: 0 } });
const claim = data({ 'WINSEM2025-26': [sub('X')] }); claim.state.locks = { 'WINSEM2025-26': { confirmed: true, until: T + 99 * H } };
eq('confirm claimed by the browser is ignored', core.prepareSave(cur, {}, { rev: 3, data: claim }, T).locks, {});
eq('first save to a new account keeps confirms, capped at 12 hours', core.prepareSave({ rev: 0, data: null }, {}, { rev: 0, data: claim, adopt: true }, T).serverLocks, { 'WINSEM2025-26': { confirmed: true, until: T + 12 * H, codes: ['X'] } });
eq('adopt only works on an empty account', core.prepareSave(cur, {}, { rev: 3, data: claim, adopt: true }, T).locks, {});
eq('bad data is refused', core.prepareSave(cur, {}, { rev: 3, data: { state: { sems: [] } } }, T).status, 400);

// ---------- subject requests ----------
eq('good request', core.checkRequest({ code: ' bcse 999l ', title: '  Quantum  Stuff ', credits: '3', type: 'TH', note: '<b>hi</b>' }).req, { code: 'BCSE999L', title: 'Quantum Stuff', credits: 3, type: 'TH', note: 'b hi /b' });
eq('code needs letters and digits', core.checkRequest({ code: 'ABCDEF', title: 'Thing', credits: 3, type: 'TH' }).ok, false);
eq('credits 0.5 to 20 in halves', [0, 0.5, 2.3, 21].map(c => core.checkRequest({ code: 'BX101', title: 'Thing', credits: c, type: 'TH' }).ok), [false, true, false, false]);
eq('type must be known', core.checkRequest({ code: 'BX101', title: 'Thing', credits: 3, type: 'PJT' }).ok, false);
eq('subjects.json line', core.subjectLine({ code: 'BX101', title: 'Thing "One"', credits: 4, type: 'ETL' }), '{"c":"BX101","t":"Thing \\"One\\"","y":"ETL","cr":4,"l":3,"tu":0,"p":2,"j":0,"cur":"2026"},');
eq('line parses like the list', JSON.parse(core.subjectLine({ code: 'BX1', title: 'L', credits: 2, type: 'LO' }).slice(0, -1)).p, 4);
eq('counter amounts', [0, 1, 20, 21, 1.5, '3'].map(core.counterAmount), [0, 1, 20, 0, 0, 0]);
eq('cookies', core.parseCookies('a=1; vc_sess=xy%3D; b'), { a: '1', vc_sess: 'xy=' });
eq('admin key compare', [core.sameSecret('k', 'k'), core.sameSecret('k', 'K'), core.sameSecret('', '')], [true, false, false]);

// ---------- joining marks on sign-in and later syncs ----------
const S = (c, extra) => Object.assign({ c, cr: 4, g: {}, gl: {} }, extra || {});
const local = { state: { sem: 'FALLSEM2026-27', sems: { 'FALLSEM2026-27': [S('A', { cat1: '12', fat: '30' }), S('C')] } }, cgpa: { mode: 'quick', quick: { cgpa: '', credits: '' }, past: [{ id: 'p1', name: 'Sem 1', gpa: 8, credits: 24 }], cleared: [] } };
const remote = { state: { sem: 'WINSEM2025-26', sems: { 'FALLSEM2026-27': [S('A', { cat1: '12' }), S('B')], 'WINSEM2025-26': [S('W')] } }, cgpa: { mode: 'detailed', quick: { cgpa: '', credits: '' }, past: [{ id: 'p9', name: 'Sem 1', gpa: 8, credits: 24 }, { id: 'p2', name: 'Sem 2', gpa: 9, credits: 22 }], cleared: [] }, share: { design: 'glow' } };
const m = M.signIn(local, remote, {}, T);
eq('sign-in: subjects joined by code, fuller copy kept', m.state.sems['FALLSEM2026-27'].map(s => s.c + (s.fat ? '+' : '')), ['A+', 'B', 'C']);
eq('sign-in: other semesters kept', Object.keys(m.state.sems).sort(), ['FALLSEM2026-27', 'WINSEM2025-26']);
eq('sign-in: this tab’s semester stays open', m.state.sem, 'FALLSEM2026-27');
eq('sign-in: same past semester not doubled', m.cgpa.past.map(p => p.name), ['Sem 1', 'Sem 2']);
eq('sign-in: share settings from the account', m.share, { design: 'glow' });
eq('sign-in: locked semester keeps the account’s list', M.signIn(local, remote, { 'FALLSEM2026-27': { confirmed: true, until: T + H } }, T).state.sems['FALLSEM2026-27'].map(s => s.c), ['A', 'B']);
eq('sign-in to an empty account keeps everything', M.signIn(local, null, {}, T), { state: local.state, cgpa: local.cgpa, share: null });
eq('sign-in with nothing here takes the account', M.signIn({ state: null, cgpa: null, share: null }, remote, {}, T).state.sems, remote.state.sems);

const base = JSON.parse(JSON.stringify(remote));
const mine = JSON.parse(JSON.stringify(remote)); mine.state.sems['WINSEM2025-26'][0].cat1 = '14';
const theirs = JSON.parse(JSON.stringify(remote)); theirs.state.sems['FALLSEM2026-27'].push(S('D')); theirs.cgpa.mode = 'quick';
const r = M.rebase(mine, base, theirs, {}, T);
eq('sync: my edit kept', r.state.sems['WINSEM2025-26'][0].cat1, '14');
eq('sync: other device’s edit kept', r.state.sems['FALLSEM2026-27'].map(s => s.c), ['A', 'B', 'D']);
eq('sync: other device’s CGPA page kept', r.cgpa.mode, 'quick');
const del = JSON.parse(JSON.stringify(remote)); delete del.state.sems['WINSEM2025-26'];
eq('sync: deleting a semester sticks', Object.keys(M.rebase(del, base, remote, {}, T).state.sems), ['FALLSEM2026-27']);
const sneaky = JSON.parse(JSON.stringify(remote)); sneaky.state.sems['FALLSEM2026-27'].push(S('Z'));
eq('sync: locked list can’t be changed here', M.rebase(sneaky, base, remote, { 'FALLSEM2026-27': { confirmed: true, until: T + H } }, T).state.sems['FALLSEM2026-27'].map(s => s.c), ['A', 'B']);
eq('sync: nothing changed is a no-op', M.same(M.rebase(remote, base, remote, {}, T).state.sems, remote.state.sems), true);

// ---------- the api/ functions end to end (in-memory Redis, test sign-in) ----------
function call(fn, method, opts = {}) {
  return new Promise(resolve => {
    const headers = Object.assign({ 'x-forwarded-for': opts.ip || '1.1.1.1' }, opts.body ? { 'content-type': 'application/json' } : {}, opts.headers || {});
    if (opts.cookie) headers.cookie = opts.cookie;
    const req = { method, headers, body: opts.body, socket: {} };
    const res = { statusCode: 200, headers: {}, headersSent: false, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.headersSent = true; resolve({ status: this.statusCode, j: JSON.parse(b || '{}'), headers: this.headers }); } };
    require('../api/' + fn)(req, res);
  });
}

(async () => {
  const outsider = await call('auth', 'POST', { body: { devEmail: 'x@gmail.com' } });
  eq('api: non-VIT sign-in refused', outsider.status, 403);
  const signin = await call('auth', 'POST', { body: { devEmail: 'stu@vitstudent.ac.in' } });
  const cookie = String(signin.headers['set-cookie']).split(';')[0];
  eq('api: VIT sign-in gives an HttpOnly cookie', [signin.status, /HttpOnly; SameSite=Lax/.test(signin.headers['set-cookie'])], [200, true]);
  eq('api: who am I', (await call('auth', 'GET', { cookie })).j.user.email, 'stu@vitstudent.ac.in');
  eq('api: signed out can’t load marks', (await call('data', 'GET')).status, 401);
  eq('api: plain-form writes are refused', (await call('data', 'PUT', { cookie, headers: { 'content-type': 'text/plain' } })).status, 415);

  const d = data({ 'FALLSEM2026-27': [sub('A'), sub('B')] });
  const s1 = await call('data', 'PUT', { cookie, body: { rev: 0, data: d } });
  eq('api: first save', [s1.status, s1.j.rev], [200, 1]);
  eq('api: second device with old rev gets the newer copy', (await call('data', 'PUT', { cookie, body: { rev: 0, data: d } })).status, 409);
  eq('api: confirm', (await call('lock', 'POST', { cookie, body: { sem: 'FALLSEM2026-27' } })).j.locks['FALLSEM2026-27'].confirmed, true);
  eq('api: can’t confirm twice', (await call('lock', 'POST', { cookie, body: { sem: 'FALLSEM2026-27' } })).status, 409);
  const add = await call('data', 'PUT', { cookie, body: { rev: 1, data: data({ 'FALLSEM2026-27': [sub('A'), sub('B'), sub('C')] }) } });
  eq('api: adding a subject while locked is refused', [add.status, add.j.err, add.j.data.state.sems['FALLSEM2026-27'].length], [409, 'locked', 2]);
  const load = await call('data', 'GET', { cookie });
  eq('api: loaded copy has the lock', load.j.data.state.locks['FALLSEM2026-27'].until > Date.now() + 11 * H, true);

  eq('api: bad request refused', (await call('request', 'POST', { body: { code: 'x' } })).status, 400);
  const rq = { code: 'BNEW101', title: 'New Course', credits: 3, type: 'TH', note: 'please' };
  eq('api: request saved', (await call('request', 'POST', { body: rq, ip: '2.2.2.2' })).j, { ok: true });
  eq('api: same code again is counted', (await call('request', 'POST', { body: rq, ip: '2.2.2.2' })).j.again, true);
  for (let i = 0; i < 3; i++) await call('request', 'POST', { body: Object.assign({}, rq, { code: 'BX10' + i }), ip: '2.2.2.2' });
  eq('api: requests are rate limited', (await call('request', 'POST', { body: Object.assign({}, rq, { code: 'BY100' }), ip: '2.2.2.2' })).status, 429);

  eq('api: admin needs the key', (await call('admin', 'GET', { headers: { 'x-admin-key': 'nope' }, ip: '3.3.3.3' })).status, 401);
  const list = await call('admin', 'GET', { headers: { 'x-admin-key': 'test-admin-key' } });
  const mine2 = list.j.requests.find(x => x.code === 'BNEW101');
  eq('api: admin sees requests', [mine2.asks, mine2.status, list.j.users], [2, 'new', 1]);
  eq('api: admin marks one added', (await call('admin', 'POST', { headers: { 'x-admin-key': 'test-admin-key' }, body: { id: mine2.id, status: 'added' } })).j.request.status, 'added');

  await call('counter', 'POST', { body: { n: 3 } });
  eq('api: counter', (await call('counter', 'GET')).j.count, 3);
  eq('api: counter refuses big jumps', (await call('counter', 'POST', { body: { n: 500 } })).status, 400);

  const out = await call('auth', 'DELETE', { cookie, body: {} });
  eq('api: sign out clears the session', [out.status, (await call('data', 'GET', { cookie })).status], [200, 401]);

  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
