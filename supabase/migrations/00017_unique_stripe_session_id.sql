-- Prevent double-crediting via TOCTOU race condition.
-- The application-level check-then-insert pattern (SELECT → INSERT) is
-- vulnerable when two requests arrive concurrently: both see zero rows,
-- both credit tokens. This constraint makes the INSERT itself the
-- idempotency gate — the second INSERT fails with error 23505.
--
-- PostgreSQL allows multiple NULLs in UNIQUE columns, so admin adjustments
-- (which have NULL stripe_session_id) are unaffected.

-- Step 1: Remove duplicate transactions that were already double-credited.
-- Keeps the earliest transaction per stripe_session_id and reverses the
-- over-credited balance from the duplicates.
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT id, user_id, amount
    FROM token_transactions
    WHERE stripe_session_id IS NOT NULL
      AND id NOT IN (
        SELECT DISTINCT ON (stripe_session_id) id
        FROM token_transactions
        WHERE stripe_session_id IS NOT NULL
        ORDER BY stripe_session_id, created_at ASC
      )
  LOOP
    -- Reverse the over-credited balance
    UPDATE profiles
    SET token_balance = GREATEST(token_balance - dup.amount, 0),
        updated_at = now()
    WHERE id = dup.user_id;

    -- Remove the duplicate transaction
    DELETE FROM token_transactions WHERE id = dup.id;
  END LOOP;
END;
$$;

-- Step 2: Add the UNIQUE constraint now that duplicates are cleaned up.
ALTER TABLE token_transactions
  ADD CONSTRAINT unique_stripe_session_id UNIQUE (stripe_session_id);
