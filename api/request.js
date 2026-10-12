// POST { code, title, credits, type, note }: ask for a subject that isn't in the list yet.
const h = require('./_lib/http');
const core = require('./_lib/core');
const db = require('./_lib/redis');
const crypto = require('crypto');

module.exports = h.handler(async (req, res) => {
  if (req.method !== 'POST') return h.send(res, 405, { err: 'method' });
  if (!h.isJson(req)) return h.send(res, 415, { err: 'json-only' });
  const c = core.checkRequest(await h.body(req));
  if (!c.ok) return h.send(res, 400, { err: c.err });
  if (!await h.limit(req, 'req-hour', 5, 3600) || !await h.limit(req, 'req-day', 15, 86400)) return h.send(res, 429, { err: "You've sent a lot of requests. Try again later." });
  const s = await h.session(req);

  // the same code asked again: count it instead of adding a copy
  const oldId = await db.cmd('HGET', 'reqcode', c.req.code);
  const old = oldId ? JSON.parse(await db.cmd('HGET', 'reqs', oldId) || 'null') : null;
  if (old && old.status !== 'rejected') {
    old.asks = (old.asks || 1) + 1;
    if (!old.note && c.req.note) old.note = c.req.note;
    await db.cmd('HSET', 'reqs', old.id, JSON.stringify(old));
    return h.send(res, 200, { ok: true, again: true, status: old.status });
  }
  const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const r = Object.assign({ id, status: 'new', at: Date.now(), asks: 1, by: s ? s.email : '' }, c.req);
  await db.pipe([['HSET', 'reqs', id, JSON.stringify(r)], ['HSET', 'reqcode', r.code, id]]);
  h.send(res, 200, { ok: true });
});
