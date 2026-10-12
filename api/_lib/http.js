// Request helpers shared by the api/ functions: JSON in and out, sessions, rate limits, Google sign-in.
const crypto = require('crypto');
const core = require('./core');
const db = require('./redis');

const COOKIE = 'vc_sess', SESSION_DAYS = 30;
const dev = db.local;

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

// Vercel parses JSON bodies into req.body; tools/serve.js does the same
async function body(req) {
  if (req.body !== undefined) { if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } } return req.body; }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 300000) return null; }
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return null; }
}

// writes must be JSON: a plain form on another site can't send that, which stops cross-site requests
const isJson = req => /application\/json/i.test(req.headers['content-type'] || '');

function ip(req) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}
// IPs are only kept hashed, and only inside rate-limit counters that expire
const ipKey = req => crypto.createHmac('sha256', process.env.ADMIN_KEY || 'vc').update(ip(req)).digest('hex').slice(0, 24);

// true when this IP is still under `max` (counting `n`) in the current window
async function limit(req, kind, max, seconds, n = 1) {
  const key = 'rl:' + kind + ':' + ipKey(req) + ':' + Math.floor(Date.now() / 1000 / seconds);
  const [count] = await db.pipe([['INCRBY', key, n], ['EXPIRE', key, seconds + 5]]);
  return count <= max;
}

// ---------- sessions: a random token in an HttpOnly cookie, stored hashed in Redis ----------
function cookie(req, value, maxAge) {
  const secure = dev ? '' : '; Secure';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function startSession(req, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const at = Date.now();
  await db.pipe([
    ['SET', 'sess:' + core.sha(token), JSON.stringify(Object.assign({ at }, user)), 'EX', SESSION_DAYS * 86400],
    ['SET', 'user:' + user.sub, JSON.stringify({ email: user.email, name: user.name, pic: user.pic, seen: at })],
    ['SADD', 'users', user.sub]
  ]);
  return cookie(req, token, SESSION_DAYS * 86400);
}
async function session(req) {
  const t = core.parseCookies(req.headers.cookie)[COOKIE];
  if (!t || t.length > 100) return null;
  const v = await db.cmd('GET', 'sess:' + core.sha(t));
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
async function endSession(req) {
  const t = core.parseCookies(req.headers.cookie)[COOKIE];
  if (t && t.length <= 100) await db.cmd('DEL', 'sess:' + core.sha(t));
  return cookie(req, '', 0);
}

// ---------- Google ID tokens ----------
let keys = null, keysUntil = 0;
async function googleKeys(force) {
  if (!force && keys && Date.now() < keysUntil) return keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('google keys ' + r.status);
  const age = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  keys = (await r.json()).keys || [];
  keysUntil = Date.now() + (age ? Math.min(+age[1], 86400) : 3600) * 1000;
  return keys;
}
// -> { ok, user } or { ok: false, status, err }
async function verifyGoogle(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const jwt = core.splitJwt(credential);
  if (!clientId || !jwt || jwt.header.alg !== 'RS256') return { ok: false, status: 401, err: 'bad-token' };
  let jwk = (await googleKeys()).find(k => k.kid === jwt.header.kid);
  if (!jwk) jwk = (await googleKeys(true)).find(k => k.kid === jwt.header.kid); // Google rotated its keys
  if (!jwk || !core.verifyRs256(jwt, jwk)) return { ok: false, status: 401, err: 'bad-signature' };
  return core.checkClaims(jwt.payload, clientId, Math.floor(Date.now() / 1000));
}

// wraps a handler: storage must be set up, errors become a friendly 500
function handler(fn) {
  return async (req, res) => {
    if (!db.ready()) return send(res, 503, { err: 'not-set-up' });
    try { await fn(req, res); }
    catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { err: 'server' }); }
  };
}

module.exports = { send, body, isJson, ip, limit, startSession, session, endSession, verifyGoogle, handler, dev };
