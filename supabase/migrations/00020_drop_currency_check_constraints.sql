-- Remove CHECK constraints on currency columns so that adding new currencies
-- is a code-only change (update SUPPORTED_CURRENCIES in lib/constants/currency.ts).
-- Validation is enforced at the API layer via isSupportedCurrency().

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_currency_check;
ALTER TABLE token_transactions DROP CONSTRAINT IF EXISTS token_transactions_currency_check;
