// The signed-in student's saved marks. GET: load. PUT { rev, data, adopt }: save if nobody saved since rev.
const h = require('./_lib/http');
const core = require('./_lib/core');
const db = require('./_lib/redis');

const MAX = 250000; // characters of JSON, far more than four years of subjects

async function load(sub) {
  const [rev, data, locks] = await db.pipe([['GET', 'rev:' + sub], ['GET', 'data:' + sub], ['GET', 'locks:' + sub]]);
  return { rev: Number(rev) || 0, data: data ? JSON.parse(data) : null, locks: locks ? JSON.parse(locks) : {} };
}

module.exports = h.handler(async (req, res) => {
  const s = await h.session(req);
  if (!s) return h.send(res, 401, { err: 'signed-out' });
  if (req.method === 'GET') {
    const cur = await load(s.sub);
    return h.send(res, 200, { rev: cur.rev, data: core.withLocks(cur.data, cur.locks), locks: core.clientLocks(cur.locks), now: Date.now() });
  }
  if (req.method !== 'PUT') return h.send(res, 405, { err: 'method' });
  if (!h.isJson(req)) return h.send(res, 415, { err: 'json-only' });
  if (!await h.limit(req, 'save', 600, 3600)) return h.send(res, 429, { err: 'slow-down' });
  const b = await h.body(req);
  if (!b) return h.send(res, 400, { err: 'bad-data' });
  if (JSON.stringify(b.data || null).length > MAX) return h.send(res, 413, { err: 'too-big' });

  const cur = await load(s.sub);
  const out = core.prepareSave({ rev: cur.rev, data: cur.data }, cur.locks, b, Date.now());
  if (out.status !== 200) return h.send(res, out.status, { err: out.err, rev: out.rev, data: out.data, locks: out.locks, now: Date.now() });
  const saved = await db.saveIfRev('rev:' + s.sub, 'data:' + s.sub, cur.rev, out.rev, JSON.stringify(out.data));
  if (!saved) { const now = await load(s.sub); return h.send(res, 409, { err: 'stale', rev: now.rev, data: core.withLocks(now.data, now.locks), locks: core.clientLocks(now.locks), now: Date.now() }); }
  if (out.locksChanged) await db.cmd('SET', 'locks:' + s.sub, JSON.stringify(out.serverLocks));
  h.send(res, 200, { rev: out.rev, data: out.data, locks: out.locks, now: Date.now() });
});
