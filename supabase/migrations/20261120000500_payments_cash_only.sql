-- Gunita Kopi POS: cash-only payments enforced by the database (SRS FR-06, A-08; SRS 8 excludes
-- non-cash payment). The API already refuses non-cash, but process_checkout_transaction is callable
-- with a signed-in token directly through the Data API, and it accepted any payment_method.
-- A CHECK constraint covers every write path; the checkout function, its idempotency and its
-- grants are unchanged (a refused payment rolls the whole checkout back).
-- Safe on existing data: live has no payments, and every payment written so far defaults to 'cash'.

alter table public.payments
  add constraint payments_method_cash_check check (payment_method = 'cash');
