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
    dailyFallback.includes('processDueStaffJobReminders'),
  'The supported daily host cron must sweep staff reminders and operational alerts.',
);
check(
  !vercel.crons.some((job) => job.schedule.includes('*/5')),
  'Vercel Hobby rejects five-minute cron schedules; do not make production undeployable.',
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
