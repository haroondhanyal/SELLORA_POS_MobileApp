import 'dotenv/config';
import { resolve } from 'node:path';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Copy backend/.env.example to backend/.env and configure it.`);
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  authSecret: required('BETTER_AUTH_SECRET'),
  authUrl: required('BETTER_AUTH_URL'),
  restJwtSecret: required('REST_JWT_SECRET'),
  postgrestUrl: process.env.POSTGREST_URL ?? 'http://127.0.0.1:4101',
  port: Number(process.env.PORT ?? 4100),
  host: process.env.API_HOST ?? '0.0.0.0',
  storageRoot: resolve(process.env.STORAGE_ROOT ?? '.local/storage'),
  mailSendmailPath: process.env.MAIL_SENDMAIL_PATH?.trim() || null,
  mailFrom: process.env.MAIL_FROM?.trim() || null,
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? 'sellora://,exp://*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

if (config.authSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be at least 32 characters.');
}

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}
