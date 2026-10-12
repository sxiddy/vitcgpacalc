// GET: who is signed in (and the Google client ID for the button). POST: sign in with a Google credential. DELETE: sign out.
const h = require('./_lib/http');
const core = require('./_lib/core');

module.exports = h.handler(async (req, res) => {
  if (req.method === 'GET') {
    const s = await h.session(req);
    return h.send(res, 200, { clientId: process.env.GOOGLE_CLIENT_ID || '', dev: h.dev, now: Date.now(), user: s ? { sub: s.sub, email: s.email, name: s.name, pic: s.pic } : null });
  }
  if (!h.isJson(req)) return h.send(res, 415, { err: 'json-only' });
  if (req.method === 'DELETE') return h.send(res, 200, { ok: true }, { 'set-cookie': await h.endSession(req) });
  if (req.method !== 'POST') return h.send(res, 405, { err: 'method' });

  if (!await h.limit(req, 'signin', 20, 3600)) return h.send(res, 429, { err: 'slow-down' });
  const b = await h.body(req);
  let r;
  if (h.dev && b && b.devEmail) {
    // local testing only (tools/serve.js): sign in as any address, still checked like a real token
    const email = String(b.devEmail).toLowerCase();
    r = core.checkClaims({ aud: 'dev', iss: 'accounts.google.com', exp: Date.now() / 1000 + 60, sub: 'dev-' + email, email, email_verified: true, hd: email.split('@')[1], name: email.split('@')[0] }, 'dev', Date.now() / 1000);
  } else {
    if (!process.env.GOOGLE_CLIENT_ID) return h.send(res, 503, { err: 'not-set-up' });
    r = await h.verifyGoogle(b && b.credential);
  }
  if (!r.ok) return h.send(res, r.status, { err: r.err });
  const cookie = await h.startSession(req, r.user);
  h.send(res, 200, { user: r.user, now: Date.now() }, { 'set-cookie': cookie });
});
