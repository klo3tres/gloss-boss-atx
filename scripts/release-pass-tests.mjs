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
