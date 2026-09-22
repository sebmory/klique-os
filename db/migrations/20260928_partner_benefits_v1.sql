DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athlete_memberships_workspace_id_id_athlete_id_key'
      AND conrelid = 'athlete_memberships'::regclass
  ) THEN
    ALTER TABLE athlete_memberships
      ADD CONSTRAINT athlete_memberships_workspace_id_id_athlete_id_key
      UNIQUE (workspace_id, id, athlete_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS partner_benefits (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  partner_id UUID NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  usage_policy TEXT NOT NULL CHECK (usage_policy IN (
    'once_lifetime',
    'once_per_membership',
    'unlimited'
  )),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_benefits_workspace_id_id_partner_id_key
    UNIQUE (workspace_id, id, partner_id),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(title) <> ''),
  CHECK (btrim(details) <> ''),
  CHECK (expires_at IS NULL OR valid_from < expires_at)
);

CREATE INDEX IF NOT EXISTS partner_benefits_workspace_partner_status_idx
  ON partner_benefits (workspace_id, partner_id, status, valid_from DESC);

CREATE INDEX IF NOT EXISTS partner_benefits_workspace_validity_idx
  ON partner_benefits (workspace_id, valid_from, expires_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS partner_benefit_reservations (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  benefit_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  athlete_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  membership_starts_at TIMESTAMPTZ NOT NULL,
  membership_ends_at TIMESTAMPTZ NULL,
  usage_policy TEXT NOT NULL CHECK (usage_policy IN (
    'once_lifetime',
    'once_per_membership',
    'unlimited'
  )),
  usage_scope_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'used', 'cancelled', 'expired')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_benefit_reservations_workspace_id_id_key
    UNIQUE (workspace_id, id),
  CONSTRAINT partner_benefit_reservations_benefit_fkey
    FOREIGN KEY (workspace_id, benefit_id, partner_id)
    REFERENCES partner_benefits (workspace_id, id, partner_id)
    ON DELETE RESTRICT,
  CONSTRAINT partner_benefit_reservations_membership_fkey
    FOREIGN KEY (workspace_id, membership_id, athlete_id)
    REFERENCES athlete_memberships (workspace_id, id, athlete_id)
    ON DELETE RESTRICT,
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(athlete_id) <> ''),
  CHECK (btrim(membership_id) <> ''),
  CHECK (btrim(usage_scope_key) <> ''),
  CHECK (membership_ends_at IS NULL OR membership_starts_at < membership_ends_at),
  CHECK (used_at IS NULL OR used_at >= reserved_at),
  CHECK (cancelled_at IS NULL OR cancelled_at >= reserved_at),
  CHECK (expires_at IS NULL OR expires_at >= reserved_at),
  CHECK (
    (usage_policy = 'once_lifetime' AND usage_scope_key = 'lifetime')
    OR (usage_policy = 'once_per_membership' AND usage_scope_key = membership_id)
    OR usage_policy = 'unlimited'
  ),
  CHECK (
    (status = 'reserved' AND used_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'used' AND used_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND used_at IS NULL)
    OR (status = 'expired' AND expires_at IS NOT NULL AND used_at IS NULL AND cancelled_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_benefit_reservations_unique_usage_idx
  ON partner_benefit_reservations (
    workspace_id,
    benefit_id,
    athlete_id,
    usage_scope_key
  )
  WHERE usage_policy IN ('once_lifetime', 'once_per_membership')
    AND status IN ('reserved', 'used');

CREATE INDEX IF NOT EXISTS partner_benefit_reservations_workspace_athlete_idx
  ON partner_benefit_reservations (workspace_id, athlete_id, reserved_at DESC);

CREATE INDEX IF NOT EXISTS partner_benefit_reservations_workspace_partner_idx
  ON partner_benefit_reservations (workspace_id, partner_id, reserved_at DESC);

CREATE INDEX IF NOT EXISTS partner_benefit_reservations_benefit_status_idx
  ON partner_benefit_reservations (benefit_id, status, reserved_at DESC);

CREATE INDEX IF NOT EXISTS partner_benefit_reservations_membership_idx
  ON partner_benefit_reservations (membership_id, reserved_at DESC);

CREATE TABLE IF NOT EXISTS partner_benefit_reservation_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  reservation_id UUID NOT NULL,
  actor_clerk_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('admin', 'athlete', 'partner_expert', 'media')),
  previous_status TEXT NULL CHECK (previous_status IN ('reserved', 'used', 'cancelled', 'expired')),
  new_status TEXT NOT NULL CHECK (new_status IN ('reserved', 'used', 'cancelled', 'expired')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_benefit_reservation_events_reservation_fkey
    FOREIGN KEY (workspace_id, reservation_id)
    REFERENCES partner_benefit_reservations (workspace_id, id)
    ON DELETE RESTRICT,
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(actor_clerk_user_id) <> ''),
  CHECK (
    (previous_status IS NULL AND new_status = 'reserved')
    OR (previous_status = 'reserved' AND new_status IN ('used', 'cancelled', 'expired'))
  )
);

CREATE INDEX IF NOT EXISTS partner_benefit_reservation_events_reservation_idx
  ON partner_benefit_reservation_events (workspace_id, reservation_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS partner_benefit_reservation_events_actor_idx
  ON partner_benefit_reservation_events (workspace_id, actor_clerk_user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_partner_benefit_reservation_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'partner_benefit_reservation_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS partner_benefit_reservation_events_immutable
  ON partner_benefit_reservation_events;
CREATE TRIGGER partner_benefit_reservation_events_immutable
  BEFORE UPDATE OR DELETE ON partner_benefit_reservation_events
  FOR EACH ROW EXECUTE FUNCTION reject_partner_benefit_reservation_event_mutation();

COMMENT ON COLUMN partner_benefits.partner_id IS
  'UUID canonique du partenaire dans 06_Partenaires. Aucune FK Neon n’est disponible pour cette identité externe.';

COMMENT ON COLUMN partner_benefit_reservations.usage_policy IS
  'Politique figée au moment de la réservation afin de préserver la règle appliquée même si l’offre change.';

COMMENT ON COLUMN partner_benefit_reservations.usage_scope_key IS
  'Portée figée : lifetime pour once_lifetime, membership_id pour once_per_membership, valeur libre pour unlimited.';

COMMENT ON TABLE partner_benefit_reservation_events IS
  'Journal immuable des créations et transitions de statut des réservations d’avantages partenaires.';