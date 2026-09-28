import { betterAuth } from 'better-auth';
import { verifyPassword } from 'better-auth/crypto';
import { expo } from '@better-auth/expo';
import { db } from './db.js';
import { config } from './config.js';
import { sendPasswordResetEmail } from './email.js';

const allowedRoles = [
  'admin', 'branch_manager', 'sales_manager', 'sales_agent',
  'cashier', 'inventory_manager', 'accountant', 'viewer',
] as const;

/** Email confirmation is intentionally off; app access still waits for admin approval. */
export const auth = betterAuth({
  appName: 'Sellora',
  baseURL: config.authUrl,
  secret: config.authSecret,
  database: db,
  trustedOrigins: config.trustedOrigins,
  advanced: { database: { generateId: 'uuid' } },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      // Supabase stores bcrypt hashes. Keep Better Auth's default scrypt for
      // new accounts, but verify imported bcrypt hashes through local pgcrypto.
      // Existing scrypt accounts continue to use Better Auth's verifier.
      verify: async ({ hash, password }) => {
        if (/^\$2[aby]\$/.test(hash)) {
          try {
            const result = await db.query<{ matches: boolean }>(
              'select public.crypt($1, $2) = $2 as matches',
              [password, hash],
            );
            return result.rows[0]?.matches === true;
          } catch (error) {
            console.error('Could not verify a legacy bcrypt password; pgcrypto may not be installed:',
              error instanceof Error ? error.message : 'database error');
            return false;
          }
        }
        return verifyPassword({ hash, password });
      },
    },
    sendResetPassword: async ({ user, url }) => sendPasswordResetEmail(user.email, url),
  },
  emailVerification: { sendOnSignUp: false },
  user: {
    additionalFields: {
      phone: { type: 'string', required: false },
      dateOfBirth: { type: 'string', required: false },
      requestedRole: { type: [...allowedRoles], required: false, defaultValue: 'cashier' },
    },
  },
  plugins: [expo()],
});
