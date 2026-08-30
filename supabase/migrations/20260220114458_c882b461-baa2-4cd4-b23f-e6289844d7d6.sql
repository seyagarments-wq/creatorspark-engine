
CREATE OR REPLACE FUNCTION get_revenue_summary()
RETURNS TABLE(
  total_revenue numeric,
  total_commissions numeric,
  month_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(revenue), 0) AS total_revenue,
    COALESCE(SUM((revenue * commission_rate_at_time) / 100.0), 0) AS total_commissions,
    COALESCE(SUM(CASE WHEN metric_date >= (CURRENT_DATE - INTERVAL '30 days') THEN revenue ELSE 0 END), 0) AS month_revenue
  FROM performance_data;
$$;
