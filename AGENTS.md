# Gloss Boss ATX Product Completion Contract

Before proposing or implementing product work, read
[`docs/PRODUCT_COMPLETION_ORDER.md`](docs/PRODUCT_COMPLETION_ORDER.md).

The phases in that document are locked and must be completed in the stated
order. Do not add a later-phase feature while an earlier phase is incomplete,
unless the work is a direct dependency required to make the active phase pass
its acceptance criteria.

For every change:

1. Identify the active phase and checklist item.
2. Trace the full customer, admin, technician, payment, calendar, and messaging
   side effects that the item touches.
3. Implement the complete path, including empty, loading, failure, retry, and
   stale-state behavior.
4. Run `npm run qa:integrity`, TypeScript validation, and the relevant
   end-to-end acceptance check.
5. Do not call an item complete until all affected surfaces show the same state.

