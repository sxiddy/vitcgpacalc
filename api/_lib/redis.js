// Upstash Redis over its REST API (no packages). Without Upstash settings, and only when running
// locally (tools/serve.js sets VC_DEV=1) or in tests, an in-memory copy stands in.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const local = !URL_ && process.env.VC_DEV === '1' && !process.env.VERCEL;

async function rest(path, body) {
  const r = await fetch(URL_ + path, { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error('redis ' + r.status);
  return j;
}

// ---------- in-memory stand-in, just the commands this site uses ----------
const mem = new Map(), exp = new Map();
const alive = k => { if (exp.has(k) && exp.get(k) <= Date.now()) { mem.delete(k); exp.delete(k); } return mem.has(k); };
const hash = k => { if (!alive(k)) mem.set(k, new Map()); return mem.get(k); };
function memCmd([c, ...a]) {
  c = String(c).toUpperCase();
  const k = a[0];
  switch (c) {
    case 'GET': return alive(k) ? mem.get(k) : null;
    case 'SET': {
      const up = a.map(x => String(x).toUpperCase());
      if (up.includes('NX') && alive(k)) return null;
      mem.set(k, String(a[1])); exp.delete(k);
      const ex = up.indexOf('EX'); if (ex > 1) exp.set(k, Date.now() + Number(a[ex + 1]) * 1000);
      return 'OK';
    }
    case 'DEL': return a.filter(x => { const had = alive(x); mem.delete(x); exp.delete(x); return had; }).length;
    case 'INCRBY': case 'INCR': { const v = (alive(k) ? Number(mem.get(k)) : 0) + (c === 'INCR' ? 1 : Number(a[1])); mem.set(k, String(v)); return v; }
    case 'EXPIRE': if (!alive(k)) return 0; exp.set(k, Date.now() + Number(a[1]) * 1000); return 1;
    case 'HGET': return alive(k) && mem.get(k).has(a[1]) ? mem.get(k).get(a[1]) : null;
    case 'HSET': { const h = hash(k); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!h.has(a[i])) n++; h.set(a[i], String(a[i + 1])); } return n; }
    case 'HGETALL': return alive(k) ? [...mem.get(k)].flat() : [];
    case 'HLEN': return alive(k) ? mem.get(k).size : 0;
    case 'SADD': { const h = hash(k); let n = 0; a.slice(1).forEach(x => { if (!h.has(x)) { h.set(x, '1'); n++; } }); return n; }
    case 'SCARD': return alive(k) ? mem.get(k).size : 0;
    default: throw new Error('memory redis: ' + c + ' not supported');
  }
}

// every key lives under 'vc:' so this site can share a database with another project
const P = 'vc:';
function scoped(args) {
  const a = args.map(String), c = a[0].toUpperCase();
  if (c === 'DEL') return [a[0]].concat(a.slice(1).map(k => P + k));
  if (a.length > 1) a[1] = P + a[1];
  return a;
}

const ready = () => !!(URL_ && TOKEN) || local;

// one command: cmd('SET', 'k', 'v') -> result
async function cmd(...args) {
  if (local) return memCmd(scoped(args));
  const j = await rest('', scoped(args));
  if (j.error) throw new Error(j.error);
  return j.result;
}

// several commands in one round trip -> [results]
async function pipe(list) {
  if (local) return list.map(c => memCmd(scoped(c)));
  const j = await rest('/pipeline', list.map(scoped));
  return j.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

// save data only if nobody saved since `rev` (so two devices can't overwrite each other)
const CAS = "if (redis.call('GET', KEYS[1]) or '0') == ARGV[1] then redis.call('SET', KEYS[2], ARGV[3]); redis.call('SET', KEYS[1], ARGV[2]); return 1 end return 0";
async function saveIfRev(revKey, dataKey, rev, next, value) {
  revKey = P + revKey; dataKey = P + dataKey;
  if (local) {
    if ((memCmd(['GET', revKey]) || '0') !== String(rev)) return false;
    memCmd(['SET', dataKey, value]); memCmd(['SET', revKey, String(next)]);
    return true;
  }
  const j = await rest('', ['EVAL', CAS, '2', revKey, dataKey, String(rev), String(next), value]);
  if (j.error) throw new Error(j.error);
  return j.result === 1;
}

const reset = () => { mem.clear(); exp.clear(); };

module.exports = { cmd, pipe, saveIfRev, ready, local, reset };
