-- Migration 00019 added p_currency to adjust_token_balance but used CREATE OR
-- REPLACE with a different parameter list, which created a second overload
-- instead of replacing the original 7-param version from 00013. This causes
-- "function is not unique" errors when calling with fewer positional args.
-- Drop the old 7-param overload so only the 8-param version remains.

DROP FUNCTION IF EXISTS adjust_token_balance(UUID, INTEGER, token_transaction_type, TEXT, TEXT, TEXT, UUID);
