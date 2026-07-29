const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/lib/deposit-lifecycle.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(compiled, sourcePath);

const {
  resolveBookingCheckoutAmount,
  validateCompletedBookingCheckout,
} = loaded.exports;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  resolveBookingCheckoutAmount({
    depositCents: 3900,
    depositPaidCents: 1000,
    finalTotalCents: 13000,
    totalPaidCents: 1000,
    paymentChoice: 'deposit',
  }) === 2900,
  'Partial deposits must collect only the remaining deposit.',
);
assert(
  resolveBookingCheckoutAmount({
    depositCents: 3900,
    depositPaidCents: 3900,
    finalTotalCents: 13000,
    totalPaidCents: 3900,
    paymentChoice: 'deposit',
  }) === 0,
  'A paid deposit must never create another deposit charge.',
);
assert(
  resolveBookingCheckoutAmount({
    depositCents: 3900,
    depositPaidCents: 3900,
    finalTotalCents: 13000,
    totalPaidCents: 3900,
    paymentChoice: 'full',
  }) === 9100,
  'Pay-in-full recovery must collect only the remaining order balance.',
);
assert(
  validateCompletedBookingCheckout({
    paymentStatus: 'paid',
    amountCents: 2900,
    expectedAmountCents: 2900,
  }).ok,
  'A settled matching checkout must be accepted.',
);
assert(
  !validateCompletedBookingCheckout({
    paymentStatus: 'unpaid',
    amountCents: 2900,
    expectedAmountCents: 2900,
  }).ok,
  'An unpaid checkout must not advance the booking.',
);
assert(
  !validateCompletedBookingCheckout({
    paymentStatus: 'paid',
    amountCents: 3900,
    expectedAmountCents: 2900,
  }).ok,
  'A mismatched amount must not advance the booking.',
);
assert(
  validateCompletedBookingCheckout({
    paymentStatus: 'paid',
    amountCents: 2900,
    expectedAmountCents: 0,
    alreadyRecordedAmountCents: 2900,
  }).ok,
  'A matching webhook replay must remain idempotently valid.',
);

console.log(
  'Deposit lifecycle QA passed: partial, paid, full-balance, unpaid, mismatch, and idempotent replay rules are stable.',
);
