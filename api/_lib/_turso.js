// Turso (SQLite) backend that speaks the Redis commands this site sends, so the rest of the code is unchanged.
// _store.js uses it when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set (otherwise Upstash, as before).
// pipeline(cmds) returns what Upstash's /pipeline returns: [{ result } | { error }], one per command.
// Data: one table per Redis type, plus ttl (expiry time in ms). Expired keys are removed before each pipeline touches
// them, and now and then in a sweep. Same file in every notes site and the Notix store: copy it, don't fork it.

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS str (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS h (k TEXT, f TEXT, v TEXT, PRIMARY KEY (k, f)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS l (k TEXT, i INTEGER, v TEXT, PRIMARY KEY (k, i)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS z (k TEXT, m TEXT, s REAL, PRIMARY KEY (k, m)) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS z_ks ON z (k, s)',
  'CREATE TABLE IF NOT EXISTS st (k TEXT, m TEXT, PRIMARY KEY (k, m)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS ttl (k TEXT PRIMARY KEY, exp INTEGER) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS ttl_exp ON ttl (exp)',
];
const TABLES = ['str', 'h', 'l', 'z', 'st'];

// ---- statement helpers ----
const S = (sql, ...args) => ({ sql, args });
const qs = (n, from = 1) => Array.from({ length: n }, (_, i) => '?' + (i + from)).join(', ');
const EXISTS = (p) => '(' + TABLES.map((t) => `EXISTS (SELECT 1 FROM ${t} WHERE k = ${p})`).join(' OR ') + ')';
const int = (x) => { const n = Number(x); if (!Number.isFinite(n)) throw new Error('ERR value is not an integer or out of range'); return Math.trunc(n); };
// rows of a window over a key, ranked from 0, with Redis-style negative start/stop
const RANGE = (r) => `${r} >= (CASE WHEN ?2 < 0 THEN n + ?2 ELSE ?2 END) AND ${r} <= (CASE WHEN ?3 < 0 THEN n + ?3 ELSE ?3 END)`;

const first = (res) => (res.rows[0] ? res.rows[0][0] : null);
const num = (v) => (v == null ? 0 : Number(v));

// Each command -> { stmts, out(results) }. results[i] = { rows, affected } for stmts[i].
const CMDS = {
  GET: ([k]) => ({ stmts: [S('SELECT v FROM str WHERE k = ?1', k)], out: ([r]) => first(r) }),
  SET: ([k, v, ...opt]) => {
    let nx = false, exp = null;
    for (let i = 0; i < opt.length; i++) {
      const o = String(opt[i]).toUpperCase();
      if (o === 'NX') nx = true;
      else if (o === 'EX') exp = Date.now() + int(opt[++i]) * 1000;
      else if (o === 'PX') exp = Date.now() + int(opt[++i]);
      else throw new Error('ERR unsupported SET option ' + o);
    }
    const ttl = exp != null
      ? S(`INSERT INTO ttl (k, exp) SELECT ?1, CAST(?2 AS INTEGER) WHERE ${nx ? 'changes() = 1' : '1'} ON CONFLICT (k) DO UPDATE SET exp = excluded.exp`, k, exp)
      : S(`DELETE FROM ttl WHERE k = ?1 AND ${nx ? 'changes() = 1' : '1'}`, k);
    const put = nx ? S('INSERT INTO str (k, v) VALUES (?1, ?2) ON CONFLICT (k) DO NOTHING', k, String(v))
      : S('INSERT INTO str (k, v) VALUES (?1, ?2) ON CONFLICT (k) DO UPDATE SET v = excluded.v', k, String(v));
    return { stmts: [put, ttl], out: ([p]) => (nx && !p.affected ? null : 'OK') };
  },
  INCR: ([k]) => CMDS.INCRBY([k, 1]),
  INCRBY: ([k, n]) => ({
    stmts: [S("INSERT INTO str (k, v) VALUES (?1, CAST(CAST(?2 AS INTEGER) AS TEXT)) ON CONFLICT (k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + CAST(?2 AS INTEGER) AS TEXT) RETURNING CAST(v AS INTEGER)", k, int(n))],
    out: ([r]) => num(first(r)),
  }),
  DEL: (keys) => ({
    stmts: [S(`SELECT count(*) FROM (${TABLES.map((t) => `SELECT k FROM ${t} WHERE k IN (${qs(keys.length)})`).join(' UNION ')})`, ...keys),
      ...TABLES.map((t) => S(`DELETE FROM ${t} WHERE k IN (${qs(keys.length)})`, ...keys)), S(`DELETE FROM ttl WHERE k IN (${qs(keys.length)})`, ...keys)],
    out: ([c]) => num(first(c)),
  }),
  UNLINK: (keys) => CMDS.DEL(keys),
  EXISTS: (keys) => ({ stmts: keys.map((k) => S(`SELECT ${EXISTS('?1')}`, k)), out: (rs) => rs.reduce((n, r) => n + (num(first(r)) ? 1 : 0), 0) }),
  EXPIRE: ([k, secs]) => ({
    stmts: [S(`INSERT INTO ttl (k, exp) SELECT ?1, CAST(?2 AS INTEGER) WHERE ${EXISTS('?1')} ON CONFLICT (k) DO UPDATE SET exp = excluded.exp`, k, Date.now() + int(secs) * 1000)],
    out: ([r]) => (r.affected ? 1 : 0),
  }),
  TTL: ([k]) => ({
    stmts: [S(`SELECT CASE WHEN NOT ${EXISTS('?1')} THEN -2 WHEN (SELECT exp FROM ttl WHERE k = ?1) IS NULL THEN -1 ELSE CAST(((SELECT exp FROM ttl WHERE k = ?1) - CAST(?2 AS INTEGER) + 500) / 1000 AS INTEGER) END`, k, Date.now())],
    out: ([r]) => num(first(r)),
  }),
  KEYS: ([pattern]) => ({
    stmts: [S(`SELECT k FROM (${TABLES.map((t) => `SELECT k FROM ${t} WHERE k GLOB ?1`).join(' UNION ')}) WHERE k NOT IN (SELECT k FROM ttl WHERE exp <= ?2)`, pattern, Date.now())],
    out: ([r]) => r.rows.map((x) => x[0]),
  }),

  // hashes
  HGET: ([k, f]) => ({ stmts: [S('SELECT v FROM h WHERE k = ?1 AND f = ?2', k, f)], out: ([r]) => first(r) }),
  HMGET: ([k, ...fs]) => ({
    stmts: [S('SELECT ' + fs.map((_, i) => `(SELECT v FROM h WHERE k = ?1 AND f = ?${i + 2})`).join(', '), k, ...fs)],
    out: ([r]) => r.rows[0].slice(0, fs.length),
  }),
  HGETALL: ([k]) => ({ stmts: [S('SELECT f, v FROM h WHERE k = ?1', k)], out: ([r]) => r.rows.flat() }),
  HSET: ([k, ...fv]) => {
    const m = new Map(); for (let i = 0; i < fv.length; i += 2) m.set(String(fv[i]), String(fv[i + 1]));
    const fs = [...m.keys()];
    return {
      stmts: [S(`SELECT count(*) FROM h WHERE k = ?1 AND f IN (${qs(fs.length, 2)})`, k, ...fs),
        S('INSERT INTO h (k, f, v) VALUES ' + fs.map((_, i) => `(?1, ?${i * 2 + 2}, ?${i * 2 + 3})`).join(', ') + ' ON CONFLICT (k, f) DO UPDATE SET v = excluded.v', k, ...fs.flatMap((f) => [f, m.get(f)]))],
      out: ([c]) => fs.length - num(first(c)),
    };
  },
  HSETNX: ([k, f, v]) => ({ stmts: [S('INSERT INTO h (k, f, v) VALUES (?1, ?2, ?3) ON CONFLICT (k, f) DO NOTHING', k, f, String(v))], out: ([r]) => (r.affected ? 1 : 0) }),
  HDEL: ([k, ...fs]) => ({ stmts: [S(`DELETE FROM h WHERE k = ?1 AND f IN (${qs(fs.length, 2)})`, k, ...fs)], out: ([r]) => r.affected }),
  HINCRBY: ([k, f, n]) => ({
    stmts: [S("INSERT INTO h (k, f, v) VALUES (?1, ?2, CAST(CAST(?3 AS INTEGER) AS TEXT)) ON CONFLICT (k, f) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + CAST(?3 AS INTEGER) AS TEXT) RETURNING CAST(v AS INTEGER)", k, f, int(n))],
    out: ([r]) => num(first(r)),
  }),
  HLEN: ([k]) => ({ stmts: [S('SELECT count(*) FROM h WHERE k = ?1', k)], out: ([r]) => num(first(r)) }),
  HEXISTS: ([k, f]) => ({ stmts: [S('SELECT count(*) FROM h WHERE k = ?1 AND f = ?2', k, f)], out: ([r]) => num(first(r)) }),
  HKEYS: ([k]) => ({ stmts: [S('SELECT f FROM h WHERE k = ?1', k)], out: ([r]) => r.rows.map((x) => x[0]) }),

  // lists (index i: smaller = nearer the head)
  LPUSH: ([k, ...vs]) => ({
    stmts: [...vs.map((v) => S('INSERT INTO l (k, i, v) VALUES (?1, (SELECT COALESCE(MIN(i), 0) - 1 FROM l WHERE k = ?1), ?2)', k, String(v))), S('SELECT count(*) FROM l WHERE k = ?1', k)],
    out: (rs) => num(first(rs[rs.length - 1])),
  }),
  RPUSH: ([k, ...vs]) => ({
    stmts: [...vs.map((v) => S('INSERT INTO l (k, i, v) VALUES (?1, (SELECT COALESCE(MAX(i), 0) + 1 FROM l WHERE k = ?1), ?2)', k, String(v))), S('SELECT count(*) FROM l WHERE k = ?1', k)],
    out: (rs) => num(first(rs[rs.length - 1])),
  }),
  LRANGE: ([k, a, b]) => ({
    stmts: [S(`SELECT v FROM (SELECT v, ROW_NUMBER() OVER (ORDER BY i) - 1 AS r, COUNT(*) OVER () AS n FROM l WHERE k = ?1) WHERE ${RANGE('r')} ORDER BY r`, k, int(a), int(b))],
    out: ([r]) => r.rows.map((x) => x[0]),
  }),
  LTRIM: ([k, a, b]) => ({
    stmts: [S(`DELETE FROM l WHERE k = ?1 AND i NOT IN (SELECT i FROM (SELECT i, ROW_NUMBER() OVER (ORDER BY i) - 1 AS r, COUNT(*) OVER () AS n FROM l WHERE k = ?1) WHERE ${RANGE('r')})`, k, int(a), int(b))],
    out: () => 'OK',
  }),
  LLEN: ([k]) => ({ stmts: [S('SELECT count(*) FROM l WHERE k = ?1', k)], out: ([r]) => num(first(r)) }),

  // sorted sets
  ZADD: ([k, ...sm]) => {
    const m = new Map(); for (let i = 0; i < sm.length; i += 2) m.set(String(sm[i + 1]), Number(sm[i]));
    const ms = [...m.keys()];
    return {
      stmts: [S(`SELECT count(*) FROM z WHERE k = ?1 AND m IN (${qs(ms.length, 2)})`, k, ...ms),
        S('INSERT INTO z (k, m, s) VALUES ' + ms.map((_, i) => `(?1, ?${i * 2 + 2}, ?${i * 2 + 3})`).join(', ') + ' ON CONFLICT (k, m) DO UPDATE SET s = excluded.s', k, ...ms.flatMap((x) => [x, m.get(x)]))],
      out: ([c]) => ms.length - num(first(c)),
    };
  },
  ZCARD: ([k]) => ({ stmts: [S('SELECT count(*) FROM z WHERE k = ?1', k)], out: ([r]) => num(first(r)) }),
  ZSCORE: ([k, m]) => ({ stmts: [S('SELECT s FROM z WHERE k = ?1 AND m = ?2', k, String(m))], out: ([r]) => { const v = first(r); return v == null ? null : String(Number(v)); } }),
  ZREM: ([k, ...ms]) => ({ stmts: [S(`DELETE FROM z WHERE k = ?1 AND m IN (${qs(ms.length, 2)})`, k, ...ms.map(String))], out: ([r]) => r.affected }),
  ZREMRANGEBYRANK: ([k, a, b]) => ({
    stmts: [S(`DELETE FROM z WHERE k = ?1 AND m IN (SELECT m FROM (SELECT m, ROW_NUMBER() OVER (ORDER BY s, m) - 1 AS r, COUNT(*) OVER () AS n FROM z WHERE k = ?1) WHERE ${RANGE('r')})`, k, int(a), int(b))],
    out: ([r]) => r.affected,
  }),

  // sets
  SADD: ([k, ...ms]) => {
    const u = [...new Set(ms.map(String))];
    return {
      stmts: [S(`SELECT count(*) FROM st WHERE k = ?1 AND m IN (${qs(u.length, 2)})`, k, ...u),
        S('INSERT INTO st (k, m) VALUES ' + u.map((_, i) => `(?1, ?${i + 2})`).join(', ') + ' ON CONFLICT (k, m) DO NOTHING', k, ...u)],
      out: ([c]) => u.length - num(first(c)),
    };
  },
  SMEMBERS: ([k]) => ({ stmts: [S('SELECT m FROM st WHERE k = ?1', k)], out: ([r]) => r.rows.map((x) => x[0]) }),
  SCARD: ([k]) => ({ stmts: [S('SELECT count(*) FROM st WHERE k = ?1', k)], out: ([r]) => num(first(r)) }),
  SISMEMBER: ([k, m]) => ({ stmts: [S('SELECT count(*) FROM st WHERE k = ?1 AND m = ?2', k, String(m))], out: ([r]) => num(first(r)) }),
  SREM: ([k, ...ms]) => ({ stmts: [S(`DELETE FROM st WHERE k = ?1 AND m IN (${qs(ms.length, 2)})`, k, ...ms.map(String))], out: ([r]) => r.affected }),
};
// commands whose first argument is a key (for expiry cleanup); DEL/EXISTS/UNLINK take only keys
const ALL_KEYS = new Set(['DEL', 'EXISTS', 'UNLINK']);

// Turn a pipeline of Redis commands into SQL statements (wrapped in one transaction), and the reply builder.
function compile(cmds, now = Date.now()) {
  const keys = new Set(), plan = [];
  cmds.forEach((c) => {
    const name = String(c[0]).toUpperCase();
    if (name !== 'KEYS') (ALL_KEYS.has(name) ? c.slice(1) : [c[1]]).forEach((k) => k != null && keys.add(String(k)));
  });
  const ks = [...keys], stmts = [S('BEGIN')];
  if (ks.length) {
    const exp = `SELECT k FROM ttl WHERE k IN (${qs(ks.length)}) AND exp <= ?${ks.length + 1}`;
    TABLES.forEach((t) => stmts.push(S(`DELETE FROM ${t} WHERE k IN (${exp})`, ...ks, now)));
    stmts.push(S(`DELETE FROM ttl WHERE k IN (${qs(ks.length)}) AND exp <= ?${ks.length + 1}`, ...ks, now));
  }
  if (Math.random() < 0.01) { // now and then: clear every expired key, so rate-limit keys etc. don't pile up
    TABLES.forEach((t) => stmts.push(S(`DELETE FROM ${t} WHERE k IN (SELECT k FROM ttl WHERE exp <= ?1)`, now)));
    stmts.push(S('DELETE FROM ttl WHERE exp <= ?1', now));
  }
  cmds.forEach((c) => {
    const name = String(c[0]).toUpperCase(), fn = CMDS[name];
    try {
      if (!fn) throw new Error('ERR unknown command ' + name);
      const args = c.slice(1).map((a) => (typeof a === 'number' ? a : String(a)));
      const { stmts: s, out } = fn(args);
      plan.push({ from: stmts.length, n: s.length, out });
      stmts.push(...s);
    } catch (e) { plan.push({ error: e.message }); }
  });
  stmts.push(S('COMMIT'));
  return { stmts, reply: (results) => plan.map((p) => {
    if (p.error) return { error: p.error };
    const rs = results.slice(p.from, p.from + p.n), bad = rs.find((r) => r.error);
    if (bad) return { error: bad.error };
    try { return { result: p.out(rs) }; } catch (e) { return { error: e.message }; }
  }) };
}

// ---- Turso over HTTP (Hrana v2 pipeline): no npm package needed ----
function enc(v) {
  if (v == null) return { type: 'null' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  return { type: 'text', value: String(v) };
}
function dec(v) {
  if (!v || v.type === 'null') return null;
  if (v.type === 'integer') return Number(v.value);
  return v.value;
}
async function hrana(cfg, stmts) {
  const base = cfg.url.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
  const r = await fetch(base + '/v2/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...stmts.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: s.args.map(enc) } })), { type: 'close' }] }),
  });
  if (!r.ok) throw Object.assign(new Error('Store request failed (' + r.status + ')'), { status: 500 });
  const j = await r.json();
  return j.results.slice(0, stmts.length).map((x) => (x.type === 'ok'
    ? { rows: (x.response.result.rows || []).map((row) => row.map(dec)), affected: x.response.result.affected_row_count || 0 }
    : { error: (x.error && x.error.message) || 'store error' }));
}

let schemaReady = null;
async function pipeline(cmds, cfg, exec = hrana) {
  if (!schemaReady) schemaReady = exec(cfg, SCHEMA.map((sql) => S(sql))).catch((e) => { schemaReady = null; throw e; });
  await schemaReady;
  const { stmts, reply } = compile(cmds);
  return reply(await exec(cfg, stmts));
}

module.exports = { pipeline, compile, SCHEMA, hrana };
