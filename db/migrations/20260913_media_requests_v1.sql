CREATE TABLE IF NOT EXISTS media_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES media_subjects (id) ON DELETE CASCADE,
  requested_by_clerk_user_id TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  media_id TEXT NULL,
  request_type TEXT NOT NULL CHECK (
    request_type IN ('interview', 'reaction', 'reportage', 'images', 'podcast')
  ),
  message TEXT NOT NULL,
  deadline DATE NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'submitted',
      'reviewing',
      'awaiting_athlete',
      'accepted',
      'declined',
      'completed',
      'cancelled'
    )
  ),
  admin_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_requests_message_not_blank CHECK (NULLIF(btrim(message), '') IS NOT NULL),
  CONSTRAINT media_requests_requester_email_not_blank CHECK (NULLIF(btrim(requester_email), '') IS NOT NULL),
  CONSTRAINT media_requests_media_id_not_blank CHECK (
    media_id IS NULL OR NULLIF(btrim(media_id), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS media_requests_workspace_status_idx
  ON media_requests (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS media_requests_workspace_requester_idx
  ON media_requests (workspace_id, requested_by_clerk_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS media_requests_workspace_subject_idx
  ON media_requests (workspace_id, subject_id);

-- Association N-N : une demande peut viser plusieurs athletes, chacun repondant separement.
CREATE TABLE IF NOT EXISTS media_request_athletes (
  request_id TEXT NOT NULL REFERENCES media_requests (id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    consent_status IN ('pending', 'approved', 'declined')
  ),
  responded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, athlete_id),
  CONSTRAINT media_request_athletes_athlete_not_blank CHECK (NULLIF(btrim(athlete_id), '') IS NOT NULL),
  CONSTRAINT media_request_athletes_responded_at_check CHECK (
    (consent_status = 'pending') = (responded_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS media_request_athletes_workspace_athlete_idx
  ON media_request_athletes (workspace_id, athlete_id, consent_status);

COMMENT ON TABLE media_requests IS
  'Demandes emises par le role media sur un sujet publie. Lecture limitee a ses propres demandes pour le media, lecture complete et mise a jour du statut pour l Admin, isolation stricte par workspace.';

COMMENT ON COLUMN media_requests.requested_by_clerk_user_id IS
  'Identite Clerk du media demandeur. Renseignee exclusivement depuis le contexte serveur, jamais depuis le body.';

COMMENT ON COLUMN media_requests.requester_email IS
  'E-mail Clerk du media demandeur, capture au moment de la demande.';

COMMENT ON COLUMN media_requests.media_id IS
  'Identifiant du media rattache si connu. NULL sinon.';

COMMENT ON COLUMN media_requests.admin_note IS
  'Note interne Admin sur le traitement de la demande. Jamais alimentee par le media.';

COMMENT ON TABLE media_request_athletes IS
  'Athletes cibles par une demande media et statut de consentement associe. Une demande de type images peut ne cibler aucun athlete.';
