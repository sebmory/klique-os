import { randomUUID } from "node:crypto";
import { Client } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.KLIQUE_CREATIVE_INVITATION_PG_TEST_URL;
const testDatabaseHost = process.env.KLIQUE_CREATIVE_INVITATION_PG_TEST_HOST;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("creative invitation recovery PostgreSQL", () => {
  it("links an existing multi-role user idempotently without replacing Forms data", async () => {
    if (!testDatabaseUrl || !testDatabaseHost) {
      throw new Error("La cible PostgreSQL de test n’est pas configurée.");
    }
    const target = new URL(testDatabaseUrl);
    if (target.hostname !== testDatabaseHost || target.hostname.includes("broad-poetry")) {
      throw new Error("La cible PostgreSQL n’est pas une branche Test autorisée.");
    }

    const client = new Client({ connectionString: testDatabaseUrl });
    const workspaceId = `creative-recovery-${randomUUID()}`;
    const profileId = randomUUID();
    const applicationId = randomUUID();
    const invitationId = randomUUID();
    const creativeClerkUserId = `creative-${randomUUID()}`;
    const adminClerkUserId = `admin-${randomUUID()}`;
    const email = `creative-${randomUUID()}@example.com`;

    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO creative_profiles (
          id, workspace_id, provenance, application_id, display_name,
          creative_type, contact_email, phone, portfolio_url, coverage_areas,
          specialties, bio, status, source_row, approved_by_clerk_user_id,
          approved_at, onboarding_status
        ) VALUES (
          $1::uuid, $2, 'form_application', $3::uuid, 'Fixture Creative',
          'photographer', $4, '+41000000000', 'https://example.com/portfolio',
          ARRAY['Vaud'], ARRAY['Basketball'], 'Fixture Forms preservee',
          'active', 7, $5, NOW(), 'active'
        )
      `, [profileId, workspaceId, applicationId, email, adminClerkUserId]);
      await client.query(`
        INSERT INTO user_access (
          clerk_user_id, email, role, workspace_id, athlete_id, status
        ) VALUES ($1, $2, 'athlete', $3, 'athlete-fixture', 'active')
      `, [creativeClerkUserId, email, workspaceId]);
      await client.query(`
        INSERT INTO creative_invitations (
          id, workspace_id, creative_profile_id, email, clerk_invitation_id,
          status, invited_by_clerk_user_id, created_at, updated_at
        ) VALUES (
          $1::uuid, $2, $3::uuid, $4, 'invitation-fixture',
          'invited', $5, NOW(), NOW()
        )
      `, [invitationId, workspaceId, profileId, email, adminClerkUserId]);

      const before = await client.query<{ fingerprint: string }>(`
        SELECT md5(concat_ws('|',
          provenance, application_id::text, display_name, creative_type,
          contact_email, phone, portfolio_url, coverage_areas::text,
          specialties::text, bio, source_row::text
        )) AS fingerprint
        FROM creative_profiles
        WHERE workspace_id = $1 AND id = $2::uuid
      `, [workspaceId, profileId]);

      const linkExistingUser = () => client.query(`
        WITH current_profile AS (
          SELECT onboarding_status
          FROM creative_profiles
          WHERE workspace_id = $1
            AND id = $2::uuid
        ),
        linked AS (
          INSERT INTO creative_access (
            workspace_id, creative_profile_id, clerk_user_id, status,
            invitation_email, invited_by_clerk_user_id, invited_at,
            activated_at, revoked_at, created_at, updated_at
          )
          VALUES (
            $1, $2::uuid, $3, 'active', $4, $5,
            NOW(), NOW(), NULL, NOW(), NOW()
          )
          ON CONFLICT (workspace_id, creative_profile_id)
          DO UPDATE SET
            clerk_user_id = EXCLUDED.clerk_user_id,
            status = 'active',
            invitation_email = EXCLUDED.invitation_email,
            invited_by_clerk_user_id = EXCLUDED.invited_by_clerk_user_id,
            activated_at = NOW(),
            revoked_at = NULL,
            updated_at = NOW()
          RETURNING creative_profile_id
        ),
        invitation_updated AS (
          UPDATE creative_invitations
          SET status = 'accepted',
              accepted_clerk_user_id = $3,
              accepted_at = COALESCE(accepted_at, NOW()),
              updated_at = NOW()
          WHERE workspace_id = $1
            AND creative_profile_id = $2::uuid
            AND lower(btrim(email)) = lower(btrim($4))
            AND status IN ('invited', 'accepted')
          RETURNING id
        ),
        invitation_inserted AS (
          INSERT INTO creative_invitations (
            workspace_id, creative_profile_id, email, clerk_invitation_id,
            status, invited_by_clerk_user_id, accepted_clerk_user_id,
            created_at, updated_at, accepted_at
          )
          SELECT $1, $2::uuid, $4, NULL, 'accepted', $5, $3, NOW(), NOW(), NOW()
          WHERE NOT EXISTS (SELECT 1 FROM invitation_updated)
          RETURNING id
        ),
        profile_updated AS (
          UPDATE creative_profiles
          SET onboarding_status = 'account_created',
              updated_at = NOW()
          WHERE workspace_id = $1
            AND id = $2::uuid
            AND onboarding_status IN ('invitation_to_send', 'invitation_sent', 'active')
          RETURNING id, onboarding_status
        ),
        onboarding_event AS (
          INSERT INTO creative_onboarding_events (
            workspace_id, creative_profile_id, event_type, from_status,
            to_status, actor_clerk_user_id, details
          )
          SELECT $1, profile_updated.id, 'existing_account_linked',
                 current_profile.onboarding_status, 'account_created', $5,
                 jsonb_build_object('email', $4::text)
          FROM profile_updated, current_profile
          WHERE current_profile.onboarding_status <> profile_updated.onboarding_status
        )
        SELECT creative_profile_id
        FROM linked
      `, [
        workspaceId,
        profileId,
        creativeClerkUserId,
        email,
        adminClerkUserId,
      ]);

      await linkExistingUser();
      await linkExistingUser();

      const counts = await client.query<{
        access_count: number;
        invitation_count: number;
        event_count: number;
        role_count: number;
        other_workspace_count: number;
      }>(`
        SELECT
          (SELECT count(*)::integer FROM creative_access
           WHERE workspace_id = $1 AND creative_profile_id = $2::uuid) AS access_count,
          (SELECT count(*)::integer FROM creative_invitations
           WHERE workspace_id = $1 AND creative_profile_id = $2::uuid) AS invitation_count,
          (SELECT count(*)::integer FROM creative_onboarding_events
           WHERE workspace_id = $1 AND creative_profile_id = $2::uuid
             AND event_type = 'existing_account_linked') AS event_count,
          (SELECT count(*)::integer FROM user_access
           WHERE clerk_user_id = $3 AND role = 'athlete' AND status = 'active') AS role_count,
          (SELECT count(*)::integer FROM creative_access
           WHERE workspace_id = $1 || '-other' AND creative_profile_id = $2::uuid) AS other_workspace_count
      `, [workspaceId, profileId, creativeClerkUserId]);
      const invitation = await client.query<{
        status: string;
        accepted_clerk_user_id: string;
      }>(`
        SELECT status, accepted_clerk_user_id
        FROM creative_invitations
        WHERE workspace_id = $1 AND creative_profile_id = $2::uuid
      `, [workspaceId, profileId]);
      const after = await client.query<{ fingerprint: string }>(`
        SELECT md5(concat_ws('|',
          provenance, application_id::text, display_name, creative_type,
          contact_email, phone, portfolio_url, coverage_areas::text,
          specialties::text, bio, source_row::text
        )) AS fingerprint
        FROM creative_profiles
        WHERE workspace_id = $1 AND id = $2::uuid
      `, [workspaceId, profileId]);

      expect(counts.rows[0]).toEqual({
        access_count: 1,
        invitation_count: 1,
        event_count: 1,
        role_count: 1,
        other_workspace_count: 0,
      });
      expect(invitation.rows[0]).toEqual({
        status: "accepted",
        accepted_clerk_user_id: creativeClerkUserId,
      });
      expect(after.rows[0]?.fingerprint).toBe(before.rows[0]?.fingerprint);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  });
});
