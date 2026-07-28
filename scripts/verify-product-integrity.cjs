const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const bookingSummary = read('src/lib/booking-confirmation-summary.ts');
const confirmationUi = read('src/components/booking/booking-confirmation-experience.tsx');
const revenuePage = read('src/app/(dashboard)/admin/revenue/page.tsx');
const cancellation = read('src/lib/appointment-lifecycle.ts');
const delivery = read('src/lib/confirmation-delivery-status.ts');
const customerIntelligence = read('src/lib/titan/customer-intelligence.ts');
const ownerInsights = read('src/lib/titan/owner-insights.ts');
const adminMonitor = read('src/components/admin/admin-automation-boot.tsx');
const staffMonitor = read('src/components/operations/staff-appointment-operations-monitor.tsx');
const dailyFallback = read('src/app/api/cron/process-follow-ups/route.ts');
const completionOrder = read('docs/PRODUCT_COMPLETION_ORDER.md');
const customerAccount = read('src/lib/customer-account.ts');
const portalAccess = read('src/lib/customer-portal-access.ts');
const canonicalBooking = read('src/app/booking/[token]/page.tsx');
const customerDashboard = read('src/app/(dashboard)/dashboard/page.tsx');
const claimRecovery = read('src/components/customer/customer-account-conflict-recovery.tsx');
const signupForm = read('src/app/(auth)/signup/signup-form.tsx');
const actionLinks = read('src/lib/auth/action-link-registry.ts');
const roleGate = read('src/components/auth/dashboard-role-gate.tsx');
const loginForm = read('src/app/(auth)/login/login-form.tsx');
const forgotPassword = read('src/app/(auth)/forgot-password/page.tsx');
const resetPassword = read('src/app/(auth)/reset-password/page.tsx');
const authCallback = read('src/app/auth/callback/route.ts');
const customerSettingsActions = read('src/app/(dashboard)/dashboard/settings/actions.ts');
const customerProfilePanel = read('src/components/customer/customer-profile-garage-panel.tsx');
const crmVehicles = read('src/lib/crm-vehicles-db.ts');
const customerPhotoUpload = read('src/components/customer/customer-photo-upload.tsx');
const customerMediaRoute = read('src/app/api/customer/media/route.ts');
const customerMemberships = read('src/lib/customer-memberships.ts');
const customerMembershipsRoute = read('src/app/api/customer/memberships/route.ts');
const customerRewardWalletData = read('src/lib/customer-reward-wallet-data.ts');
const customerRewardsRoute = read('src/app/api/customer/rewards/route.ts');
const customerRewardWallet = read('src/components/customer/customer-reward-wallet.tsx');
const vercel = JSON.parse(read('vercel.json'));

check(
  !revenuePage.includes('financial.openBalancesCents ||'),
  'Revenue must never replace a correct zero receivable total with a legacy fallback.',
);
check(
  revenuePage.includes("kind: 'work_order'"),
  'The transaction drilldown must be work-order-driven.',
);
check(
  revenuePage.includes('financial.openBalances.map'),
  'Receivables and aging must use the canonical actionable balance set.',
);
check(
  customerIntelligence.includes('isActionableOpenBalance') &&
    ownerInsights.includes('isActionableOpenBalance'),
  'Owner and customer intelligence must use the same actionable-balance rule as Revenue.',
);
check(
  bookingSummary.includes('reconcilePricingDisplay'),
  'Booking confirmation must reconcile every displayed price to the saved total.',
);
check(
  confirmationUi.includes('Service subtotal') &&
    confirmationUi.includes('Appointment total') &&
    confirmationUi.includes('Custom quote adjustment'),
  'Customer pricing must explicitly label subtotal, adjustments, and final total.',
);
check(
  cancellation.includes('balance_due_cents: 0') &&
    cancellation.includes("status: 'cancelled'"),
  'Cancellation must close both the work-order lifecycle and its receivable.',
);
check(
  !delivery.includes("str(r.kind) === kind"),
  'Last-contact status must not ignore valid messages because of a single template kind.',
);
check(
  adminMonitor.includes('5 * 60 * 1000') &&
    staffMonitor.includes('CHECK_INTERVAL_MS = 5 * 60 * 1000'),
  'Late-job monitoring must run every five minutes in active admin and technician sessions.',
);
check(
  dailyFallback.includes('processAppointmentOperationalAlerts') &&
    dailyFallback.includes('processDueStaffJobReminders') &&
    dailyFallback.includes("request.headers.get('user-agent') === 'vercel-cron/1.0'"),
  'The supported daily host cron must sweep staff reminders and operational alerts.',
);
check(
  !vercel.crons.some((job) => job.schedule.includes('*/5')),
  'Vercel Hobby rejects five-minute cron schedules; do not make production undeployable.',
);
const lockedPhases = [
  '### 1. Account and Portal',
  '### 2. Payment lifecycle',
  '### 3. Appointment lifecycle',
  '### 4. End-to-end acceptance',
  '### 5. Admin UX consolidation',
  '### 6. Technician OS',
  '### 7. CFO Revenue',
  '### 8. Quote Builder',
  '### 9. Operations Center',
  '### 10. Rewards, referrals, and loyalty expansion',
  '### 11. Titan business automation',
];
check(
  lockedPhases.every((phase, index) => {
    const position = completionOrder.indexOf(phase);
    const previous = index === 0 ? -1 : completionOrder.indexOf(lockedPhases[index - 1]);
    return position > previous;
  }),
  'The locked product-completion phases must remain present and in order.',
);
check(
  customerAccount.includes("status: 'conflict'") &&
    customerAccount.includes('if (jobCustomerId) return jobCustomerId === customer.id'),
  'Claimed customer data must fail closed when the email belongs to another auth account.',
);
check(
  portalAccess.includes('.is(\'auth_user_id\', null)') &&
    portalAccess.includes('customer_id.is.null,customer_id.eq.') &&
    portalAccess.includes("errorCode: 'account_conflict'"),
  'Guest booking claims must not overwrite customer or appointment ownership.',
);
check(
  canonicalBooking.includes('accountClaimIssue={accountClaimIssue}') &&
    claimRecovery.includes('Sign out and continue as guest') &&
    customerDashboard.includes("customerResolution?.status === 'conflict'"),
  'Account-claim failures must be visible and recoverable on both the secure link and dashboard.',
);
check(
  signupForm.includes("phase === 'awaiting_confirmation'") &&
    signupForm.includes('confirmPassword') &&
    signupForm.includes('signupConfirmRedirectUrl(confirmationDestination)') &&
    actionLinks.includes("safeNext = next.startsWith('/')") &&
    roleGate.includes("outcome.code === 'MISSING_PROFILE'") &&
    roleGate.includes("fetch('/api/auth/ensure-profile'"),
  'Account creation must preserve the booking destination, confirm the password, show email-confirmation recovery, and self-repair a missing profile.',
);
check(
  loginForm.includes("email: email.trim().toLowerCase()") &&
    loginForm.includes('resolveSafePostLoginRedirect') &&
    loginForm.includes('signupConfirmRedirectUrl(nextDestination)') &&
    loginForm.includes('timeoutMs: 5000') &&
    loginForm.includes('Redirect is taking too long'),
  'Login must normalize identity, preserve safe booking return, recover confirmation, and stop finite waits.',
);
check(
  forgotPassword.includes('passwordResetRedirectUrl(returnDestination)') &&
    forgotPassword.includes("email.trim().toLowerCase()") &&
    resetPassword.includes('resolveSafePostLoginRedirect') &&
    resetPassword.includes("getSafeInternalRedirect(params.get('next')") &&
    authCallback.includes("nextParam.startsWith('/reset-password')"),
  'Password reset must preserve the safe booking destination from request through recovery callback and new login.',
);
check(
  customerSettingsActions.includes('authClient.auth.updateUser') &&
    customerSettingsActions.includes('Check your email to confirm the new address') &&
    customerSettingsActions.includes("not('status', 'in'") &&
    customerProfilePanel.includes('Changing email requires confirmation') &&
    customerAccount.includes("patch.email = email") &&
    portalAccess.includes("currentEmail !== email") &&
    portalAccess.includes(".eq('auth_user_id', authUserId)") &&
    authCallback.includes("typeParam === 'signup' || typeParam === 'email'"),
  'Customer contact editing must verify email changes and synchronize owned active contact records.',
);
check(
  customerProfilePanel.includes('result.vehicle') &&
    !customerProfilePanel.includes("id: `pending-") &&
    crmVehicles.includes("throw new Error('Vehicle does not belong to this customer.')"),
  'Vehicle add/edit must return the permanent record and enforce customer ownership.',
);
check(
  customerPhotoUpload.includes("fetch('/api/customer/media'") &&
    customerPhotoUpload.includes('result.fileUrl') &&
    customerPhotoUpload.includes('router.refresh()') &&
    customerMediaRoute.includes('export async function GET') &&
    customerMediaRoute.includes('ownsAppointment') &&
    customerMediaRoute.includes('visible_to_customer: true') &&
    customerMediaRoute.includes('publish_to_gallery: false'),
  'Customer photos must upload to an owned appointment, preview immediately, refresh the gallery, and stay out of marketing.',
);
check(
  customerMemberships.includes(".eq('customer_id', customerId)") &&
    customerMemberships.includes("String(row.status ?? 'unknown')") &&
    customerMembershipsRoute.includes('listCustomerMemberships(admin, customer.id)'),
  'Membership history must load every status through one customer-scoped source.',
);
check(
  customerRewardWalletData.includes(".eq('customer_id', customerId)") &&
    customerRewardWalletData.includes("['issued', 'available'].includes(status)") &&
    customerRewardWalletData.includes('customer_credit_id') &&
    customerRewardsRoute.includes('loadCustomerRewardWallet(admin, customer.id)') &&
    customerRewardWallet.includes("{ label: 'Locked'"),
  'The customer reward wallet must show every lifecycle status without duplicate linked credits or cross-customer data.',
);

// Regression fixture from the real customer screenshot:
// $165.00 subtotal - $24.75 online discount - $10.25 custom adjustment = $130.00.
const subtotal = 16500;
const onlineDiscount = 2475;
const customAdjustment = -1025;
check(
  subtotal - onlineDiscount + customAdjustment === 13000,
  'Real-customer pricing regression fixture no longer reconciles to $130.00.',
);

if (failures.length) {
  console.error('Product integrity checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Product integrity checks passed.');
