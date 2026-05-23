/**
 * Regenerates Supabase Auth + docs HTML from src/lib/email/templates/auth.ts
 * Run after layout changes: node scripts/generate-email-templates.cjs
 *
 * Requires: npx tsx (one-time: npm i -D tsx)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const runner = path.join(__dirname, 'generate-email-templates-runner.ts');

const runnerSrc = `import { AUTH_EMAIL_EXPORTS } from '../src/lib/email/templates/auth';
import { reviewRequestEmailHtml } from '../src/lib/email/templates/transactional';
import { buildReceiptEmailHtml } from '../src/lib/email/templates/receipt';
import { jobCompletedEmailHtml } from '../src/lib/email/templates/transactional';
import { welcomeEmailHtml } from '../src/lib/email/templates/transactional';
import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..');
const pairs: Array<[string, string]> = [
  ['confirm-signup.html', AUTH_EMAIL_EXPORTS.confirmSignup()],
  ['magic-link.html', AUTH_EMAIL_EXPORTS.magicLink()],
  ['reset-password.html', AUTH_EMAIL_EXPORTS.resetPassword()],
  ['change-email.html', AUTH_EMAIL_EXPORTS.changeEmail()],
  ['invite-user.html', AUTH_EMAIL_EXPORTS.inviteUser()],
  ['reauthentication.html', AUTH_EMAIL_EXPORTS.reauthentication()],
];

for (const dir of ['docs/email-templates', 'supabase/email-templates']) {
  for (const [name, html] of pairs) {
    fs.writeFileSync(path.join(root, dir, name), html.trim() + '\\n', 'utf8');
  }
}

fs.writeFileSync(
  path.join(root, 'docs/email-templates/review-request.html'),
  reviewRequestEmailHtml({ guestName: '{{customer}}', vehicle: '{{vehicle}}', reviewUrl: '{{review_link}}' }).trim() + '\\n',
  'utf8',
);

fs.writeFileSync(
  path.join(root, 'docs/email-templates/appointment-receipt.html'),
  buildReceiptEmailHtml({
    customerName: '{{customer}}',
    receiptNumber: '{{receipt_number}}',
    serviceAddress: '{{service_address}}',
    serviceAt: '{{service_at}}',
    line: {
      vehicles: [{ name: '{{vehicle}}', service: '{{service}}' }],
      subtotal: '{{subtotal}}',
      totalPaid: '{{total_paid}}',
      paymentMethod: '{{payment_method}}',
      receiptUrl: '{{receipt_url}}',
    },
  }).trim() + '\\n',
  'utf8',
);

fs.writeFileSync(
  path.join(root, 'docs/email-templates/job-complete.html'),
  jobCompletedEmailHtml({ guestName: '{{customer}}', serviceLabel: '{{service}}' }).trim() + '\\n',
  'utf8',
);

fs.writeFileSync(
  path.join(root, 'docs/email-templates/welcome-email.html'),
  welcomeEmailHtml({ name: '{{customer}}' }).trim() + '\\n',
  'utf8',
);

console.log('Email templates written to docs/email-templates and supabase/email-templates');
`;

fs.writeFileSync(runner, runnerSrc, 'utf8');

try {
  execSync('npx --yes tsx "' + runner + '"', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('Run: npm i -D tsx && node scripts/generate-email-templates.cjs');
  process.exit(1);
} finally {
  try {
    fs.unlinkSync(runner);
  } catch {
    /* ignore */
  }
}
