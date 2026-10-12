// GET: how many subjects have been calculated on the site. POST { n }: add n newly calculated subjects.
const h = require('./_lib/http');
const core = require('./_lib/core');
const db = require('./_lib/redis');

module.exports = h.handler(async (req, res) => {
  if (req.method === 'GET') {
    const n = Number(await db.cmd('GET', 'stats:calculated')) || 0;
    // shared by everyone for a few seconds so busy pages don't use up Redis
    return h.send(res, 200, { count: n }, { 'cache-control': 'public, s-maxage=15, stale-while-revalidate=30' });
  }
  if (req.method !== 'POST') return h.send(res, 405, { err: 'method' });
  if (!h.isJson(req)) return h.send(res, 415, { err: 'json-only' });
  const n = core.counterAmount((await h.body(req) || {}).n);
  if (!n) return h.send(res, 400, { err: 'bad-amount' });
  if (!await h.limit(req, 'count', 80, 3600, n)) return h.send(res, 200, { ok: true }); // quietly ignore floods
  const count = await db.cmd('INCRBY', 'stats:calculated', n);
  h.send(res, 200, { ok: true, count });
});
