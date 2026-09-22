UPDATE membership_plans AS plan
SET
  annual_price_chf = catalog.annual_price_chf,
  production_credits = catalog.production_credits,
  custom_content_credits = catalog.custom_content_credits,
  video_allowed = catalog.video_allowed
FROM (
  VALUES
    ('essential', 249.00::NUMERIC(10, 2), 1, 2, FALSE),
    ('impact', 549.00::NUMERIC(10, 2), 2, 4, TRUE),
    ('signature', 999.00::NUMERIC(10, 2), 3, 6, TRUE)
) AS catalog(code, annual_price_chf, production_credits, custom_content_credits, video_allowed)
WHERE plan.code = catalog.code
  AND (
    plan.annual_price_chf,
    plan.production_credits,
    plan.custom_content_credits,
    plan.video_allowed
  ) IS DISTINCT FROM (
    catalog.annual_price_chf,
    catalog.production_credits,
    catalog.custom_content_credits,
    catalog.video_allowed
  );