-- Drops the `refunds` ledger. It was write-only: one Stripe webhook handler
-- inserted into it and nothing ever read it back.
--
-- WHY
--
-- The table was built as a local mirror of Stripe's refund records, on the
-- assumption that some later surface — a parent-facing billing history, an admin
-- reconciliation view — would read it. None arrived. What did arrive is the cost
-- of keeping a mirror honest: the handler had to decide *which* refund an event
-- was about, and getting that wrong understated the refunded total in our own
-- favour without erroring anywhere (both a lost-refund race and a
-- silently-absent payload field had to be handled). That is a money-shaped
-- correctness burden carried for no reader.
--
-- Stripe is the system of record for refunds, retains them indefinitely, and
-- exposes them per charge. Every column here was copied from a Stripe object, so
-- the ledger is fully backfillable from the Stripe API if a reader is ever built
-- — and a backfill would then be written against whatever that reader needs
-- rather than against a schema guessed years earlier.
--
-- SCOPE
--
-- Dropping the table takes its policies, indexes, constraints and grants with
-- it; none of them existed independently. Nothing referenced the table: no
-- inbound foreign keys, no view, no function body, and the only application code
-- touching it was the `charge.refunded` handler removed in the same change.
-- `charge.refunded` now falls through to the webhook route's unhandled-event
-- branch and is answered 200, like every other event type we do not process.
--
-- `refund_reason` goes with it. The enum existed solely to type
-- `refunds.reason`, so leaving it behind would keep a dead type in the generated
-- database types forever. Unlike an enum *value*, an unused enum *type* can be
-- dropped outright, and recreating it is one statement if refunds ever return.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.refunds;

-- ---------------------------------------------------------------------------
-- 2. The enum that only it used
-- ---------------------------------------------------------------------------
--
-- No CASCADE, deliberately: the table above was the only thing typed by it, so
-- if some other dependent turns up this must fail loudly rather than quietly
-- take that dependent with it.

DROP TYPE IF EXISTS public.refund_reason;

-- ---------------------------------------------------------------------------
-- 3. Assert the end state
-- ---------------------------------------------------------------------------
--
-- Both statements above are conditional, and a conditional whose predicate did
-- not match looks exactly like one that did its job.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'refunds'
  ) THEN
    RAISE EXCEPTION 'public.refunds is still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname = 'refund_reason'
  ) THEN
    RAISE EXCEPTION 'public.refund_reason is still present';
  END IF;
END;
$$;
