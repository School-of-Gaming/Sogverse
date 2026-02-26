-- Migration: Allow re-enrollment after unenroll
--
-- The original UNIQUE(group_id, gamer_id) constraint from migration 00018
-- prevents re-enrollment because the old unenrolled row still holds the slot.
-- Replace it with a partial unique index that only applies to active enrollments.

-- Drop the absolute constraint
ALTER TABLE group_enrollments DROP CONSTRAINT group_enrollments_group_id_gamer_id_key;

-- Add partial unique index: only one active enrollment per group per gamer
CREATE UNIQUE INDEX idx_group_enrollments_unique_active
  ON group_enrollments(group_id, gamer_id) WHERE status = 'active';
