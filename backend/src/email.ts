import { spawn } from 'node:child_process';
import { config } from './config.js';

/** Delivers a reset message through a local sendmail-compatible MTA. */
export async function sendPasswordResetEmail(recipient: string, resetUrl: string) {
  const executable = config.mailSendmailPath;
  const sender = config.mailFrom;
  if (!executable || !sender) {
    throw new Error('Password recovery email is not configured. Set MAIL_SENDMAIL_PATH and MAIL_FROM on the Sellora server.');
  }
  if (!executable.startsWith('/') || /[\r\n]/.test(sender) || /[\r\n<>]/.test(recipient)) {
    throw new Error('The configured mail sender or recipient is invalid.');
  }
  if (!resetUrl.startsWith(`${config.authUrl.replace(/\/$/, '')}/`)) {
    throw new Error('The password reset link does not match this Sellora server.');
  }

  const message = [
    `From: ${sender}`,
    `To: ${recipient}`,
    'Subject: Reset your Sellora password',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'A password reset was requested for your Sellora account.',
    'Open this one-time link in the Sellora app to choose a new password:',
    resetUrl,
    '',
    'If you did not request this, ignore this message.',
  ].join('\r\n');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['-i', '-t'], { stdio: ['pipe', 'ignore', 'pipe'], env: process.env });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('The mail delivery command timed out.'));
    }, 15_000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
    child.once('error', (error) => { clearTimeout(timer); reject(new Error(`Could not start the configured mail service: ${error.message}`)); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Password reset email could not be delivered${stderr ? `: ${stderr.trim()}` : '.'}`));
    });
    child.stdin.end(message);
  });
}
