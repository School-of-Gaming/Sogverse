-- Migration: Set REPLICA IDENTITY FULL on voice_rooms
-- Description: Required for Supabase Realtime to deliver UPDATE/DELETE events
-- through RLS. Without this, only INSERT events are delivered to subscribers
-- because Realtime cannot evaluate RLS policies against old row values.

ALTER TABLE voice_rooms REPLICA IDENTITY FULL;
