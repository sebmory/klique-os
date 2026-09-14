ALTER TABLE athlete_subscriptions
  DROP CONSTRAINT athlete_subscriptions_plan_code_check,
  ADD CONSTRAINT athlete_subscriptions_plan_code_check
    CHECK (plan_code IN ('essentiel', 'impact', 'signature', 'founder')),
  ADD CONSTRAINT athlete_subscriptions_founder_terms_check
    CHECK (
      plan_code <> 'founder'
      OR (
        is_founder = TRUE
        AND is_complimentary = TRUE
        AND price_chf = 0
        AND discount_percent = 0
        AND photo_sessions_included = 0
        AND media_days_included = 0
        AND competition_sessions_included = 0
        AND custom_contents_included = 0
      )
    );