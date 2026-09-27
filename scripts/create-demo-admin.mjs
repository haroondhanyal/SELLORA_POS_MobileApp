import { randomInt, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// This script creates a disposable admin in a test Supabase project only.
if (process.env.ALLOW_DEMO_ADMIN !== 'true') {
  throw new Error('Set ALLOW_DEMO_ADMIN=true after confirming this is a test Supabase project.');
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your local shell. Never put the service key in the mobile app.');
}

const email = (process.env.DEMO_ADMIN_EMAIL || 'demo.admin@example.com').trim().toLowerCase();
const password = process.env.DEMO_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
const suggestedPin = String(randomInt(100000, 1000000));
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Sellora Demo Admin', requested_role: 'admin' },
});
if (error) throw error;
if (!data.user) throw new Error('Supabase did not return the created user.');

// Promote only the newly created test user; the database guard protects normal app sessions.
const { data: profile, error: profileError } = await supabase.from('profiles').update({
  full_name: 'Sellora Demo Admin',
  role: 'admin',
  requested_role: 'admin',
  approval_status: 'approved',
}).eq('id', data.user.id).select('id').maybeSingle();
if (profileError || !profile) {
  await supabase.auth.admin.deleteUser(data.user.id);
  throw profileError ?? new Error('Profile trigger did not create the new user profile; check that migrations are deployed.');
}

console.log(`Demo admin created for ${email}`);
console.log(`Temporary password: ${password}`);
console.log(`Suggested device PIN: ${suggestedPin} (sign in, then set this PIN in My profile)`);
console.log('Copy these credentials now. The PIN is stored on the device after you set it in the app.');
