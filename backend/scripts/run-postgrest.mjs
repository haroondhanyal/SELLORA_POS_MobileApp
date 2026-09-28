import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const dbUri = process.env.POSTGREST_DATABASE_URL;
const jwtSecret = process.env.REST_JWT_SECRET;
if (!dbUri || !jwtSecret || jwtSecret.length < 32) {
  throw new Error('Run scripts/prepare-postgrest.mjs and configure the REST secrets first.');
}

const port = Number(process.env.POSTGREST_PORT ?? 4101);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('POSTGREST_PORT is invalid.');
const directory = resolve(process.env.POSTGREST_CONFIG_DIR ?? '.local');
await mkdir(directory, { recursive: true, mode: 0o700 });
const configPath = resolve(directory, 'postgrest.conf');
const quote = (value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const config = [
  `db-uri = ${quote(dbUri)}`,
  'db-schemas = "public"',
  'db-anon-role = "sellora_guest"',
  `jwt-secret = ${quote(jwtSecret)}`,
  'server-host = "127.0.0.1"',
  `server-port = ${port}`,
  'openapi-mode = "follow-privileges"',
  'log-level = "info"',
].join('\n') + '\n';
await writeFile(configPath, config, { mode: 0o600 });

const service = spawn('postgrest', [configPath], { stdio: 'inherit', env: process.env });
service.once('error', (error) => {
  console.error('Could not start PostgREST:', error.message);
  process.exitCode = 1;
});
service.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => service.kill(signal));
}
