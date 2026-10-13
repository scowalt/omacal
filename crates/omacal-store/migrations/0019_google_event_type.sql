-- Source identity, not a second/native all-day flag. Existing caches stay
-- unknown until a normal refetch or a user-requested calendar rebuild.
ALTER TABLE events ADD COLUMN google_event_type TEXT;
