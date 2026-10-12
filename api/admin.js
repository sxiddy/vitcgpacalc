// Admin only (ADMIN_KEY in the x-admin-key header). GET: requests and numbers. POST { id, status }: mark a request.
const h = require('./_lib/http');
const core = require('./_lib/core');
const db = require('./_lib/redis');

module.exports = h.handler(async (req, res) => {
  if (!process.env.ADMIN_KEY) return h.send(res, 503, { err: 'not-set-up' });
  if (!await h.limit(req, 'admin', 120, 3600)) return h.send(res, 429, { err: 'slow-down' });
  if (!core.sameSecret(req.headers['x-admin-key'], process.env.ADMIN_KEY)) {
    await h.limit(req, 'admin', 120, 3600, 20); // wrong keys use up the allowance fast
    return h.send(res, 401, { err: 'wrong-key' });
  }
  if (req.method === 'GET') {
    const [all, count, users] = await db.pipe([['HGETALL', 'reqs'], ['GET', 'stats:calculated'], ['SCARD', 'users']]);
    const list = [];
    for (let i = 1; i < all.length; i += 2) { try { const r = JSON.parse(all[i]); r.line = core.subjectLine(r); list.push(r); } catch (e) {} }
    list.sort((a, b) => b.at - a.at);
    return h.send(res, 200, { requests: list, calculated: Number(count) || 0, users: Number(users) || 0 });
  }
  if (req.method !== 'POST') return h.send(res, 405, { err: 'method' });
  if (!h.isJson(req)) return h.send(res, 415, { err: 'json-only' });
  const b = await h.body(req) || {};
  if (!core.STATUSES.includes(b.status)) return h.send(res, 400, { err: 'bad-status' });
  const raw = await db.cmd('HGET', 'reqs', String(b.id || ''));
  if (!raw) return h.send(res, 404, { err: 'not-found' });
  const r = JSON.parse(raw);
  r.status = b.status; r.done = Date.now();
  await db.cmd('HSET', 'reqs', r.id, JSON.stringify(r));
  r.line = core.subjectLine(r);
  h.send(res, 200, { request: r });
});
