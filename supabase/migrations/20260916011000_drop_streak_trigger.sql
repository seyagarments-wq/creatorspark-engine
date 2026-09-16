-- XP / streak teardown, database side. The AFTER INSERT trigger on videos awarded XP,
-- advanced streaks and consistency milestones on every upload (function last rewritten in
-- 20260327052732). The program has none of that any more. Tables stay (reversible); only the
-- write path goes.
DROP TRIGGER IF EXISTS trg_update_streak_on_video_insert ON public.videos;
DROP FUNCTION IF EXISTS public.update_streak_on_video_insert();
