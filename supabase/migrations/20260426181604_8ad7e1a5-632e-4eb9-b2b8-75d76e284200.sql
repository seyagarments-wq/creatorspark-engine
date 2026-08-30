UPDATE public.sample_requests
SET status = 'rejected',
    rejection_reason = 'We do not offer mystery boxes to creators. To start, every creator works exclusively with the Warfare hoodie. The expectation is roughly 5–10 videos per week (about three filming sessions per week) for the first 90 days of the program. Once you have demonstrated consistent performance and volume on the Warfare hoodie, we will open access to additional products.',
    updated_at = now()
WHERE id = '7b5a6e00-ec28-48b2-8871-3da2a0332047';