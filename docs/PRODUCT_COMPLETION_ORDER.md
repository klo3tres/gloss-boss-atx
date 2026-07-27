# Gloss Boss ATX Product Completion Order

This is the canonical product-completion sequence. It is intentionally frozen
to stop scattered feature work and page-by-page patching.

## Definition of the finished product

A customer can book, pay, create or claim an account, manage the appointment,
communicate, and complete the job. Customer Portal, Admin, Technician OS,
payments, calendars, messages, work orders, invoices, receipts, rewards, and
reporting must all resolve the same underlying state.

No item is complete with a dead end, infinite loader, stale value, missing
action, unexplained price, disconnected side effect, or unhandled retry path.

## Locked execution order

Completed: **1.1 Claim guest booking**, **1.2 Create account**, **1.3 Login**,
**1.4 Reset password**, **1.5 Edit customer contact information**

Current active item: **1.6 Add and edit vehicles**

Completion evidence is recorded only after the item passes code integrity,
production build, production-data invariants, and its customer-facing recovery
paths. Starting code for a later item does not count as completing the active
item.

### 1. Account and Portal

Complete in this exact order:

1. Claim guest booking
2. Create account
3. Login
4. Reset password
5. Edit customer contact information
6. Add and edit vehicles
7. Upload and view customer photos
8. View memberships
9. View rewards
10. View referrals
11. Send and receive messages

Exit gate: every action works for a new guest, a claimed guest, and a returning
customer without duplicate customer records or lost bookings.

### 2. Payment lifecycle

Complete in this exact order:

1. Pay deposit
2. Pay remaining balance
3. Recover failed, cancelled, and expired checkout
4. Record manual and external payments
5. Refund and partially refund
6. View and download invoices
7. View and download receipts
8. Resolve one consistent payment status everywhere

Exit gate: appointment, work order, customer portal, Stripe/manual payment
records, invoice, receipt, Revenue, and Operations all agree.

### 3. Appointment lifecycle

Complete in this exact order:

1. Confirm
2. Reschedule
3. Cancel
4. Update Google Calendar
5. Update work order
6. Notify customer and technician
7. Release or recreate availability blocks

Exit gate: every lifecycle transition is atomic, retryable, and visible on all
affected surfaces.

### 4. End-to-end acceptance

Execute and pass these golden paths:

1. New guest booking
2. Guest account claim
3. Returning-customer booking
4. Deposit failure and retry
5. Reschedule
6. Cancellation
7. Final payment
8. Invoice and receipt access
9. Reward redemption
10. Customer messaging

Exit gate: all paths pass using production-equivalent data with recorded
evidence and no manual database repair.

### 5. Admin UX consolidation

### 6. Technician OS

### 7. CFO Revenue

### 8. Quote Builder

### 9. Operations Center

### 10. Rewards, referrals, and loyalty expansion

### 11. Titan business automation

## Scope rule

Later phases remain frozen. A change outside the active phase is allowed only
when it is a required dependency for the active checklist item, and that
dependency must be documented in the change.
