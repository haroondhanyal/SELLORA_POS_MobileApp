const target = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:4100');
const concurrency = Number(process.env.VUS ?? 50);
const durationMs = Number(process.env.DURATION_MS ?? 30_000);
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

if (!['http:', 'https:'].includes(target.protocol)) throw new Error('BASE_URL must use HTTP or HTTPS.');
if (!localHosts.has(target.hostname) && process.env.ALLOW_EXTERNAL_LOAD_TEST !== 'YES') {
  throw new Error('External load tests require ALLOW_EXTERNAL_LOAD_TEST=YES and authorization for that server.');
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000) throw new Error('VUS must be an integer between 1 and 1000.');
if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 300_000) throw new Error('DURATION_MS must be between 1000 and 300000.');

const deadline = Date.now() + durationMs;
const latencies = [];
const failureKinds = new Map();
let requests = 0;
let failed = 0;

function recordFailure(kind) {
  failed += 1;
  failureKinds.set(kind, (failureKinds.get(kind) ?? 0) + 1);
}

async function worker(index) {
  // Spread the initial arrivals over one second to model steady concurrency
  // instead of sending all virtual users as a single synchronized burst.
  await new Promise((resolve) => setTimeout(resolve, index * 1000 / concurrency));
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const response = await fetch(new URL('/health', target), { signal: AbortSignal.timeout(5000) });
      let payload;
      try {
        payload = await response.json();
      } catch {
        recordFailure(`HTTP ${response.status}: invalid JSON health response`);
        latencies.push(performance.now() - started);
        requests += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      if (!response.ok || payload.status !== 'ok' || payload.database !== 'connected') {
        recordFailure(`HTTP ${response.status}: ${payload.status ?? 'unknown'} / ${payload.database ?? 'unknown'}`);
      }
    } catch (error) {
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
      const causeDetail = cause && typeof cause === 'object'
        ? `${'code' in cause ? String(cause.code) : ''}${'message' in cause ? ` ${String(cause.message)}` : ''}`.trim()
        : '';
      const detail = error instanceof Error
        ? `${error.name}: ${error.message}${causeDetail ? ` (${causeDetail})` : ''}`
        : 'Unknown network error';
      recordFailure(detail.slice(0, 180));
    }
    latencies.push(performance.now() - started);
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

console.info(`Starting health-only load check: ${concurrency} virtual users for ${durationMs} ms at ${target.origin}`);
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
latencies.sort((a, b) => a - b);
const percentile = (value) => latencies.length ? Math.round(latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * value) - 1)]) : 0;
const result = { requests, failed, failureRate: requests ? failed / requests : 1, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), failureKinds: Object.fromEntries(failureKinds) };
console.info(JSON.stringify(result, null, 2));
if (result.failureRate >= 0.01 || result.p95Ms > 1000) process.exitCode = 1;
