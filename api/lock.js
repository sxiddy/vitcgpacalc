// POST { sem }: confirm a semester's subjects. The 12-hour lock is kept here, so the browser can't end it early.
const h = require('./_lib/http');
const core = require('./_lib/core');
const db = require('./_lib/redis');

module.exports = h.handler(async (req, res) => {
  if (req.method !== 'POST') return h.send(res, 405, { err: 'method' });
  if (!h.isJson(req)) return h.send(res, 415, { err: 'json-only' });
  const s = await h.session(req);
  if (!s) return h.send(res, 401, { err: 'signed-out' });
  const b = await h.body(req) || {};
  const [data, raw] = await db.pipe([['GET', 'data:' + s.sub], ['GET', 'locks:' + s.sub]]);
  const locks = raw ? JSON.parse(raw) : {};
  const r = core.confirmLock(data ? JSON.parse(data) : null, locks, b.sem, Date.now());
  if (r.status !== 200) return h.send(res, r.status, { err: r.err, locks: core.clientLocks(locks), now: Date.now() });
  locks[b.sem] = r.lock;
  await db.cmd('SET', 'locks:' + s.sub, JSON.stringify(locks));
  h.send(res, 200, { locks: core.clientLocks(locks), now: Date.now() });
});
