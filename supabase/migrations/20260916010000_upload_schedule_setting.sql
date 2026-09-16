-- One global weekly upload day for every creator. A schedule, not a gate: nothing reads it to
-- penalise anyone. Admin changes it in Settings; creators see it on home and the calendar.
INSERT INTO public.settings (key, value)
VALUES ('upload_schedule', '{"weekday": "friday"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
