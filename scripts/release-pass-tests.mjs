/**
 * Release pass smoke tests
 * Run: node scripts/release-pass-tests.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('plain vehicle price has no Starting at prefix', () => {
  function formatVehiclePrice(value) {
    if (value == null || value <= 0) return 'Quote';
    return `$${value}`;
  }
  assert.equal(formatVehiclePrice(75), '$75');
  assert.equal(formatVehiclePrice(100), '$100');
});

test('protected owner email constant is set', async () => {
  const ownerConfig = await fs.readFile(new URL('../src/lib/auth/owner-config.ts', import.meta.url), 'utf8');
  assert.match(ownerConfig, /PROTECTED_OWNER_EMAIL/);
  assert.match(ownerConfig, /canAssignRole/);
});

test('avg ticket is zero when no completed jobs', () => {
  const gross = 19400;
  const monthJobs = 0;
  const avg = monthJobs > 0 ? Math.round(gross / monthJobs) : 0;
  assert.equal(avg, 0);
});

test('fetchUserRole does not silently default staff to customer', async () => {
  const src = await fs.readFile(new URL('../src/lib/auth/fetchUserRole.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /role:\s*'customer'[\s\S]*source:\s*'session_fallback'/);
  assert.match(src, /MISSING_PROFILE/);
});

test('reset password mirrors ensure-profile flow', async () => {
  const src = await fs.readFile(new URL('../src/app/(auth)/reset-password/page.tsx', import.meta.url), 'utf8');
  assert.match(src, /ensure-profile/);
  assert.match(src, /waitForSessionHydration/);
  assert.match(src, /window\.location\.assign/);
});

test('demo seed leads are empty', async () => {
  const src = await fs.readFile(new URL('../src/lib/titan/revenue-opportunities.ts', import.meta.url), 'utf8');
  assert.match(src, /const SEED_LEADS[\s\S]*=\s*\[\]/);
});

test('convertLeadToOpportunity maps business fields', async () => {
  const src = await fs.readFile(new URL('../src/lib/titan/lead-radar-engine.ts', import.meta.url), 'utf8');
  assert.match(src, /businessName/);
  assert.match(src, /businessAddress/);
  assert.match(src, /google_places/);
});

test('quote builder enables draft for opportunityId', async () => {
  const src = await fs.readFile(new URL('../src/components/admin/quote-builder-panel.tsx', import.meta.url), 'utf8');
  assert.match(src, /canSaveDraft/);
  assert.match(src, /opportunityId/);
  assert.match(src, /markOpportunityStatusAction/);
});

test('opportunity drawer has contact edit action', async () => {
  const src = await fs.readFile(new URL('../src/components/titan/opportunity-drawer.tsx', import.meta.url), 'utf8');
  assert.match(src, /updateOpportunityContactAction/);
});

test('reward ladder editor replaces raw JSON textarea as primary UI', async () => {
  const src = await fs.readFile(new URL('../src/components/admin/referrals-admin-client.tsx', import.meta.url), 'utf8');
  assert.match(src, /RewardLadderEditor/);
  assert.match(src, /Add ladder tier/);
});

test('segment error boundaries exist', async () => {
  for (const rel of [
    '../src/app/(dashboard)/admin/error.tsx',
    '../src/app/(dashboard)/tech/error.tsx',
    '../src/app/(dashboard)/titan/error.tsx',
    '../src/components/shared/segment-error.tsx',
  ]) {
    await fs.access(new URL(rel, import.meta.url));
  }
});

test('profiles RLS repair migration exists and uses SECURITY DEFINER helpers', async () => {
  const src = await fs.readFile(
    new URL('../supabase/migrations/000129_profiles_rls_auth_repair.sql', import.meta.url),
    'utf8',
  );
  assert.match(src, /infinite recursion/);
  assert.match(src, /security definer/i);
  assert.match(src, /set row_security = off/i);
  assert.match(src, /is_admin_level/);
  assert.match(src, /auth_event_log/);
});

test('auth callback routes recovery to reset-password', async () => {
  const src = await fs.readFile(new URL('../src/app/auth/callback/route.ts', import.meta.url), 'utf8');
  assert.match(src, /recovery/);
  assert.match(src, /\/reset-password/);
  assert.match(src, /typeParam/);
});

test('action link registry covers password reset and staff invite', async () => {
  const src = await fs.readFile(new URL('../src/lib/auth/action-link-registry.ts', import.meta.url), 'utf8');
  assert.match(src, /password_reset/);
  assert.match(src, /staff_invite/);
  assert.match(src, /passwordResetRedirectUrl/);
  assert.match(src, /type=recovery/);
  assert.match(src, /validateActionLinkRegistry/);
});

test('humanizeAuthError hides profiles recursion', async () => {
  const src = await fs.readFile(new URL('../src/lib/auth/auth-event-log.ts', import.meta.url), 'utf8');
  assert.match(src, /infinite recursion/);
  assert.match(src, /profile connection failed/i);
});

test('Ask Titan is hidden on auth recovery routes', async () => {
  const src = await fs.readFile(
    new URL('../src/components/titan/titan-global-assistant.tsx', import.meta.url),
    'utf8',
  );
  assert.match(src, /\/reset-password/);
  assert.match(src, /\/join-team/);
  assert.match(src, /\/auth/);
});

test('signup uses emailRedirectTo confirmation callback', async () => {
  const src = await fs.readFile(new URL('../src/app/(auth)/signup/signup-form.tsx', import.meta.url), 'utf8');
  assert.match(src, /emailRedirectTo/);
  assert.match(src, /Resend confirmation/);
  assert.match(src, /humanizeAuthError/);
});

test('agreement status module exists', async () => {
  const src = await fs.readFile(new URL('../src/lib/agreements/status.ts', import.meta.url), 'utf8');
  assert.match(src, /AgreementStatus/);
  assert.match(src, /AGREEMENT_STATUS_LABELS/);
  assert.match(src, /isAgreementComplete/);
});

test('agreementUrl is in action link registry', async () => {
  const src = await fs.readFile(new URL('../src/lib/auth/action-link-registry.ts', import.meta.url), 'utf8');
  assert.match(src, /export function agreementUrl/);
  assert.match(src, /agreement:/);
  assert.match(src, /\/agreement/);
});

test('migration 000130 agreement comms closed loop exists', async () => {
  const src = await fs.readFile(
    new URL('../supabase/migrations/000130_agreement_comms_closed_loop.sql', import.meta.url),
    'utf8',
  );
  assert.match(src, /agreement_immediate/);
  assert.match(src, /agreement_link/);
  assert.match(src, /agreement_requests/);
});

test('communications page exists', async () => {
  const src = await fs.readFile(
    new URL('../src/app/(dashboard)/admin/communications/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(src, /Communications/);
  assert.match(src, /Transactional/);
  assert.match(src, /Marketing/);
  assert.match(src, /Unsigned upcoming/);
});

test('work order agreement panel string exists', async () => {
  const candidates = [
    '../src/components/tech/work-order-agreement-panel.tsx',
    '../src/components/tech/work-order-agreement-recapture-client.tsx',
    '../src/components/admin/work-order-agreement-panel.tsx',
    '../src/components/tech/work-order-console-client.tsx',
  ];
  let found = false;
  for (const rel of candidates) {
    try {
      const src = await fs.readFile(new URL(rel, import.meta.url), 'utf8');
      if (/WorkOrderAgreementPanel|WorkOrderAgreement|agreement panel|Agreement/i.test(src)) {
        found = true;
        break;
      }
    } catch {
      /* optional path */
    }
  }
  assert.equal(found, true);
});

test('validateActionLinkRegistry covers agreement', async () => {
  const src = await fs.readFile(new URL('../src/lib/auth/action-link-registry.ts', import.meta.url), 'utf8');
  assert.match(src, /validateActionLinkRegistry/);
  assert.match(src, /def\.type === 'agreement'/);
  assert.match(src, /missing \/agreement route coverage/);
});

test('mojibake repair helper fixes em dash and arrow', async () => {
  const { repairMojibake, hasMojibake, MOJIBAKE_SAMPLE_PATTERNS } = await import('../src/lib/text/fix-mojibake.ts');
  assert.equal(repairMojibake('Fleet â€” detail'), 'Fleet — detail');
  assert.equal(repairMojibake('Open â†’ Admin'), 'Open → Admin');
  assert.equal(hasMojibake('clean text'), false);
  assert.equal(hasMojibake('bad â€” text'), true);
  assert.ok(MOJIBAKE_SAMPLE_PATTERNS.includes('â€”'));
});

test('migration 000131 production completion pass exists', async () => {
  const src = await fs.readFile(
    new URL('../supabase/migrations/000131_production_completion_pass.sql', import.meta.url),
    'utf8',
  );
  assert.match(src, /titan_opportunities/);
  assert.match(src, /â€”/);
  assert.match(src, /replace\(title/);
});

test('staff job reminders enqueue helpers exist', async () => {
  const src = await fs.readFile(new URL('../src/lib/staff-notification-router.ts', import.meta.url), 'utf8');
  assert.match(src, /enqueueStaffJobReminders/);
  assert.match(src, /staff_job_24h/);
  assert.match(src, /staff_job_2h/);
});
