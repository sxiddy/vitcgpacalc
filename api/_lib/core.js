// Server rules with no network or storage, so tools/test-server.js can test them with plain Node.
const crypto = require('crypto');

const DOMAIN = 'vitstudent.ac.in';
const LOCK_MS = 12 * 60 * 60 * 1000;
const MAX_SEM_CREDITS = 35;
const TYPES = ['ETL', 'TH', 'LO', 'OC', 'SS'];
const SEM_RE = /^(FALL|WIN|SUM)SEM\d{4}-\d{2}$/;

// ---------- Google ID token claims ----------
// payload of a token whose signature is already checked -> { ok, user } or { ok: false, status, err }
function checkClaims(p, clientId, nowSec) {
  if (!p || typeof p !== 'object') return { ok: false, status: 401, err: 'bad-token' };
  if (p.aud !== clientId) return { ok: false, status: 401, err: 'wrong-audience' };
  if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') return { ok: false, status: 401, err: 'wrong-issuer' };
  if (!(p.exp > nowSec - 60)) return { ok: false, status: 401, err: 'expired' };
  if (p.iat && p.iat > nowSec + 300) return { ok: false, status: 401, err: 'bad-token' };
  if (!p.sub || typeof p.sub !== 'string') return { ok: false, status: 401, err: 'bad-token' };
  const email = String(p.email || '').toLowerCase();
  // both the hosted domain claim and the address itself must be the VIT student domain
  if (p.hd !== DOMAIN || !email.endsWith('@' + DOMAIN) || email.split('@').length !== 2) return { ok: false, status: 403, err: 'not-vit' };
  if (p.email_verified !== true && p.email_verified !== 'true') return { ok: false, status: 403, err: 'not-verified' };
  return { ok: true, user: { sub: p.sub, email, name: String(p.name || email.split('@')[0]).slice(0, 80), pic: /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(p.picture || '') ? p.picture : '' } };
}

// splits a JWT without trusting it -> { header, payload, signed, sig } or null
function splitJwt(t) {
  const parts = String(t || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const dec = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    return { header: dec(parts[0]), payload: dec(parts[1]), signed: parts[0] + '.' + parts[1], sig: Buffer.from(parts[2], 'base64url') };
  } catch (e) { return null; }
}

// RS256 check against one JWK
function verifyRs256(jwt, jwk) {
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return crypto.verify('RSA-SHA256', Buffer.from(jwt.signed), key, jwt.sig);
  } catch (e) { return false; }
}

// ---------- saved data and the 12-hour lock ----------
const codesOf = list => (Array.isArray(list) ? list : []).map(s => String((s && s.c) || '')).sort();
const sameCodes = (a, b) => a.length === b.length && a.every((c, i) => c === b[i]);

// the shape the browser keeps: { semId: { confirmed, until } }
function clientLocks(locks) {
  const out = {};
  Object.keys(locks || {}).forEach(id => { out[id] = { confirmed: !!locks[id].confirmed, until: locks[id].confirmed ? locks[id].until || 0 : 0 }; });
  return out;
}

function validData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const s = d.state, c = d.cgpa, sh = d.share;
  if (s !== undefined && s !== null && (typeof s !== 'object' || !s.sems || typeof s.sems !== 'object' || Array.isArray(s.sems) || !Object.values(s.sems).every(Array.isArray))) return false;
  if (c !== undefined && c !== null && (typeof c !== 'object' || Array.isArray(c))) return false;
  if (sh !== undefined && sh !== null && (typeof sh !== 'object' || Array.isArray(sh))) return false;
  return true;
}

// A save from the browser, checked against the server's locks.
// cur = { rev, data } stored now, locks = { semId: { confirmed, until, codes } }
// body = { rev, data, adopt } -> { status, rev?, data, locks, serverLocks?, locksChanged?, err? }
// adopt: on the very first save to an empty account, confirmations made before signing in carry over (never longer than 12 hours).
function prepareSave(cur, locks, body, now) {
  cur = cur || { rev: 0, data: null };
  const before = JSON.stringify(locks || {});
  locks = Object.assign({}, locks || {});
  const conflict = err => ({ status: 409, err, rev: cur.rev, data: withLocks(cur.data, locks), locks: clientLocks(locks) });
  if (!body || !validData(body.data)) return { status: 400, err: 'bad-data' };
  if (Number(body.rev) !== cur.rev) return conflict('stale');
  const data = JSON.parse(JSON.stringify(body.data));
  const sems = (data.state && data.state.sems) || {};
  const sent = (data.state && data.state.locks) || {};

  if (body.adopt && cur.rev === 0) {
    Object.keys(sent).forEach(id => {
      const L = sent[id];
      if (!SEM_RE.test(id) || locks[id] || !L || !L.confirmed || !(sems[id] || []).length) return;
      locks[id] = { confirmed: true, until: Math.max(0, Math.min(Number(L.until) || 0, now + LOCK_MS)), codes: codesOf(sems[id]) };
    });
  }

  for (const id of Object.keys(locks)) {
    const L = locks[id];
    if (!L.confirmed) continue;
    const same = sameCodes(codesOf(sems[id]), L.codes || []);
    if (same) continue;
    if (L.until > now) return conflict('locked');
    locks[id] = { confirmed: false, until: 0, codes: [] }; // subjects changed after the lock ended: needs confirming again
  }
  return { status: 200, rev: cur.rev + 1, data: withLocks(data, locks), locks: clientLocks(locks), serverLocks: locks, locksChanged: JSON.stringify(locks) !== before };
}

// the browser's copy always carries the server's locks, never its own
function withLocks(data, locks) {
  if (!data) return data;
  const d = Object.assign({}, data);
  if (d.state) d.state = Object.assign({}, d.state, { locks: clientLocks(locks) });
  return d;
}

// confirming a semester -> { status, lock?, err? }
function confirmLock(data, locks, sem, now) {
  if (!SEM_RE.test(String(sem))) return { status: 400, err: 'bad-semester' };
  const L = (locks || {})[sem];
  if (L && L.confirmed && L.until > now) return { status: 409, err: 'locked', lock: L };
  const subs = (data && data.state && data.state.sems && data.state.sems[sem]) || [];
  if (!subs.length) return { status: 400, err: 'no-subjects' };
  const cr = subs.reduce((n, s) => n + (Number(s.cr) || 0), 0);
  if (cr > MAX_SEM_CREDITS) return { status: 400, err: 'too-many-credits' };
  return { status: 200, lock: { confirmed: true, until: now + LOCK_MS, codes: codesOf(subs) } };
}

// ---------- subject requests ----------
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// -> { ok, req } or { ok: false, err }
function checkRequest(b) {
  b = b || {};
  const code = String(b.code || '').toUpperCase().replace(/\s+/g, '');
  const title = clean(b.title, 80), note = clean(b.note, 300);
  const credits = Number(b.credits), type = String(b.type || '');
  if (!/^[A-Z0-9]{3,12}$/.test(code) || !/[A-Z]/.test(code) || !/\d/.test(code)) return { ok: false, err: 'Enter a course code like BACSE103' };
  if (title.length < 3) return { ok: false, err: 'Enter the course title' };
  if (!Number.isFinite(credits) || credits < 0.5 || credits > 20 || Math.round(credits * 2) !== credits * 2) return { ok: false, err: 'Credits must be between 0.5 and 20' };
  if (!TYPES.includes(type)) return { ok: false, err: 'Pick the course type' };
  return { ok: true, req: { code, title, credits, type, note } };
}

// a request as one line of data/subjects.json (L, T, P guessed from the type and credits)
function subjectLine(r) {
  const cr = Number(r.credits);
  let l = 0, p = 0;
  if (r.type === 'TH') l = cr;
  else if (r.type === 'ETL') { l = Math.max(cr - 1, 0); p = 2; }
  else if (r.type === 'LO') p = cr * 2;
  return JSON.stringify({ c: r.code, t: r.title, y: r.type, cr, l, tu: 0, p, j: 0, cur: '2026' }) + ',';
}

const STATUSES = ['new', 'added', 'rejected'];

// ---------- small helpers ----------
function parseCookies(h) {
  const out = {};
  String(h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) {} } });
  return out;
}
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function sameSecret(a, b) {
  if (!a || !b) return false;
  return crypto.timingSafeEqual(Buffer.from(sha(a), 'hex'), Buffer.from(sha(b), 'hex'));
}
// how many subjects one counter call may add
const counterAmount = n => (Number.isInteger(n) && n >= 1 && n <= 20 ? n : 0);

module.exports = { DOMAIN, LOCK_MS, TYPES, SEM_RE, STATUSES, checkClaims, splitJwt, verifyRs256, codesOf, clientLocks, validData, prepareSave, withLocks, confirmLock, checkRequest, subjectLine, parseCookies, sha, sameSecret, counterAmount };
