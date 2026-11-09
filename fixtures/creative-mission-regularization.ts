import { createHash } from "node:crypto";

type HistoricalServiceFixture = {
  requestId: string;
  athleteId: string;
  productCode: "photo_session_standard" | "custom_content_single";
  status: "completed" | "refused";
  isAdminRealization: boolean;
  historicalRealizationAt: string | null;
  refusalReason: string | null;
};

type ProductionSheetFixture = {
  source: "google_sheets";
  row: number;
  snapshot: Record<string, unknown>;
};

export type CreativeMissionRegularizationFixture = {
  key: string;
  recordKind: "mission" | "historical_entry";
  businessState: "completed" | "closed_without_action";
  title: string;
  missionType: "media_day" | "match_competition" | "other";
  occurredAt: string;
  occurredAtSource: "historicalRealizationAt_best_available" | "refused_at";
  regularizationStatus: "historical_completed" | "historical_closed_without_action";
  regularizationNote: string;
  historicalCreativeName: string | null;
  historicalProfileDisplayName: string | null;
  athletes: Array<{ id: string; name: string }>;
  services: HistoricalServiceFixture[];
  productions: ProductionSheetFixture[];
};

const completedNote = (details: string) =>
  `Terminée — historique régularisé. Date issue de historicalRealizationAt, meilleure date historique disponible. ${details}`;

const service = (
  requestId: string,
  athleteId: string,
  productCode: HistoricalServiceFixture["productCode"],
  historicalRealizationAt: string,
): HistoricalServiceFixture => ({
  requestId,
  athleteId,
  productCode,
  status: "completed",
  isAdminRealization: true,
  historicalRealizationAt,
  refusalReason: null,
});

const refusedTest = (
  requestId: string,
): HistoricalServiceFixture => ({
  requestId,
  athleteId: "seb-mory",
  productCode: "photo_session_standard",
  status: "refused",
  isAdminRealization: false,
  historicalRealizationAt: null,
  refusalReason: "Test terminé",
});

const production = (
  row: number,
  snapshot: Record<string, unknown>,
): ProductionSheetFixture => ({
  source: "google_sheets",
  row,
  snapshot,
});

export const creativeMissionRegularizationFixtures: CreativeMissionRegularizationFixture[] = [
  {
    key: "historical:media-day:2026-07-11:armand-angha:raphael-monty",
    recordKind: "mission",
    businessState: "completed",
    title: "Media Day — Armand Angha & Raphaël Monty",
    missionType: "media_day",
    occurredAt: "2026-07-11T12:00:00.000Z",
    occurredAtSource: "historicalRealizationAt_best_available",
    regularizationStatus: "historical_completed",
    regularizationNote: completedNote(
      "Une seule opération physique regroupant portraits photo et interviews pour deux athlètes et quatre prestations.",
    ),
    historicalCreativeName: "Sébastien Mory",
    historicalProfileDisplayName: "Séb Mory",
    athletes: [
      { id: "armand-angha", name: "Armand Angha" },
      { id: "raphael-monty", name: "Raphaël Monty" },
    ],
    services: [
      service(
        "581b533d-2bed-4261-b8d7-1195fc074c36",
        "armand-angha",
        "custom_content_single",
        "2026-07-11T12:00:00.000Z",
      ),
      service(
        "c3b51cc0-9414-4038-bc2e-1bc4c1273b0b",
        "armand-angha",
        "photo_session_standard",
        "2026-07-11T12:00:00.000Z",
      ),
      service(
        "b962d3b2-2f97-45e3-ae75-343a47ed8ec2",
        "raphael-monty",
        "custom_content_single",
        "2026-07-11T12:00:00.000Z",
      ),
      service(
        "c2352c07-22dd-431b-b9c9-bc13df04320c",
        "raphael-monty",
        "photo_session_standard",
        "2026-07-11T12:00:00.000Z",
      ),
    ],
    productions: [
      production(4, {
        date: "2026-07-11",
        athlete: "Armand Angha",
        sport: "Basketball",
        type: "Action",
        place: "Lausanne",
        photographer: "Sébastien Mory",
        status: "En cours",
        photos: 0,
        videos: 1,
        shootingDone: false,
        importDone: true,
        backupDone: false,
        sortDone: true,
        retouchDone: true,
        exportDone: true,
        driveDone: true,
        published: true,
        deliverableAthlete: false,
      }),
      production(5, {
        date: "2026-07-11",
        athlete: "Raphaël Monty",
        sport: "Basketball",
        type: "Portrait",
        place: "Lausanne",
        photographer: "Sébastien Mory",
        status: "Planifié",
        photos: 0,
        videos: 0,
        shootingDone: false,
        importDone: true,
        backupDone: false,
        sortDone: true,
        retouchDone: true,
        exportDone: true,
        driveDone: true,
        published: true,
        deliverableAthlete: false,
      }),
    ],
  },
  {
    key: "historical:media-day:2026-08-25:herez-moussa",
    recordKind: "mission",
    businessState: "completed",
    title: "Media Day — Herez Moussa",
    missionType: "media_day",
    occurredAt: "2026-08-25T12:00:00.000Z",
    occurredAtSource: "historicalRealizationAt_best_available",
    regularizationStatus: "historical_completed",
    regularizationNote: completedNote(
      "Portraits photo et interview regroupés dans une seule opération physique et deux prestations.",
    ),
    historicalCreativeName: "Sébastien Mory",
    historicalProfileDisplayName: "Séb Mory",
    athletes: [{ id: "herez-moussa", name: "Herez Moussa" }],
    services: [
      service(
        "f1e59a75-292d-4fdd-b622-85f29fec52c2",
        "herez-moussa",
        "custom_content_single",
        "2026-08-25T12:00:00.000Z",
      ),
      service(
        "ee5f2eb0-67c7-403b-970c-cc7b690d7ca8",
        "herez-moussa",
        "photo_session_standard",
        "2026-08-25T12:00:00.000Z",
      ),
    ],
    productions: [],
  },
  {
    key: "historical:media-day:2026-09-05:chiona-kapinga:veronika-bernardini",
    recordKind: "mission",
    businessState: "completed",
    title: "Media Day — Chiona Kapinga & Veronika Bernardini",
    missionType: "media_day",
    occurredAt: "2026-09-05T12:00:00.000Z",
    occurredAtSource: "historicalRealizationAt_best_available",
    regularizationStatus: "historical_completed",
    regularizationNote: completedNote(
      "Une seule opération physique regroupant portraits photo et interviews pour deux athlètes et quatre prestations.",
    ),
    historicalCreativeName: "Sébastien Mory",
    historicalProfileDisplayName: "Séb Mory",
    athletes: [
      { id: "chiona-kapinga", name: "Chiona Kapinga" },
      { id: "veronika-bernardini", name: "Veronika Bernardini" },
    ],
    services: [
      service(
        "cc4c0abe-810d-4fdf-b2f6-d473449df647",
        "chiona-kapinga",
        "custom_content_single",
        "2026-09-05T12:00:00.000Z",
      ),
      service(
        "5401b3ac-59be-4c09-975c-2c35a5d4170e",
        "chiona-kapinga",
        "photo_session_standard",
        "2026-09-05T12:00:00.000Z",
      ),
      service(
        "dc94eb3c-b599-46e0-a370-f57998d9a059",
        "veronika-bernardini",
        "custom_content_single",
        "2026-09-05T12:00:00.000Z",
      ),
      service(
        "32394a24-471b-4924-90ea-8437e58806ff",
        "veronika-bernardini",
        "photo_session_standard",
        "2026-09-05T12:00:00.000Z",
      ),
    ],
    productions: [],
  },
  {
    key: "historical:match:2026-09-20:matheus-monteiro",
    recordKind: "mission",
    businessState: "completed",
    title: "Photos en match — Matheus Monteiro",
    missionType: "match_competition",
    occurredAt: "2026-09-20T12:00:00.000Z",
    occurredAtSource: "historicalRealizationAt_best_available",
    regularizationStatus: "historical_completed",
    regularizationNote: completedNote("La note source « Photos en match » est conservée."),
    historicalCreativeName: "Sébastien Mory",
    historicalProfileDisplayName: "Séb Mory",
    athletes: [{ id: "matheus-monteiro", name: "Matheus Monteiro" }],
    services: [
      service(
        "0e2bb487-c405-4027-b3c5-d7a96509e935",
        "matheus-monteiro",
        "photo_session_standard",
        "2026-09-20T12:00:00.000Z",
      ),
    ],
    productions: [],
  },
  {
    key: "historical:match:2026-09-26:abdou-bobodi-camara",
    recordKind: "mission",
    businessState: "completed",
    title: "Photos en match — Abdou Böbödi Camara",
    missionType: "match_competition",
    occurredAt: "2026-09-26T12:00:00.000Z",
    occurredAtSource: "historicalRealizationAt_best_available",
    regularizationStatus: "historical_completed",
    regularizationNote: completedNote(
      "La mention source du photographe Alan Jeanbourquin est conservée comme déclaration historique.",
    ),
    historicalCreativeName: "Alan Jeanbourquin",
    historicalProfileDisplayName: "Alan Jeanbourquin",
    athletes: [{ id: "abdou-bobodi-camara", name: "Abdou Böbödi Camara" }],
    services: [
      service(
        "6f862544-7a9d-432d-b007-5709855961fb",
        "abdou-bobodi-camara",
        "photo_session_standard",
        "2026-09-26T12:00:00.000Z",
      ),
    ],
    productions: [],
  },
  {
    key: "historical:closed-test:b8d3a3e9-ab5e-4900-b3c7-7db3f2b77610",
    recordKind: "historical_entry",
    businessState: "closed_without_action",
    title: "Demande de test classée sans suite — Séb Mory",
    missionType: "other",
    occurredAt: "2026-09-08T07:17:29.635Z",
    occurredAtSource: "refused_at",
    regularizationStatus: "historical_closed_without_action",
    regularizationNote:
      "Classée sans suite — historique régularisé. Raison source conservée : « Test terminé ». Aucun droit consommé.",
    historicalCreativeName: null,
    historicalProfileDisplayName: null,
    athletes: [{ id: "seb-mory", name: "Séb Mory" }],
    services: [
      refusedTest("b8d3a3e9-ab5e-4900-b3c7-7db3f2b77610"),
    ],
    productions: [],
  },
  {
    key: "historical:closed-test:357902f8-d3bf-46d7-a2a3-3192437b766d",
    recordKind: "historical_entry",
    businessState: "closed_without_action",
    title: "Demande de test classée sans suite — Séb Mory",
    missionType: "other",
    occurredAt: "2026-09-08T08:14:27.546Z",
    occurredAtSource: "refused_at",
    regularizationStatus: "historical_closed_without_action",
    regularizationNote:
      "Classée sans suite — historique régularisé. Raison source conservée : « Test terminé ». Aucun droit consommé.",
    historicalCreativeName: null,
    historicalProfileDisplayName: null,
    athletes: [{ id: "seb-mory", name: "Séb Mory" }],
    services: [
      refusedTest("357902f8-d3bf-46d7-a2a3-3192437b766d"),
    ],
    productions: [],
  },
];

export const buildCreativeMissionRegularizationPayload = () => ({
  records: creativeMissionRegularizationFixtures.map((fixture) => ({
    ...fixture,
    productions: fixture.productions.map((item) => {
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(item.snapshot))
        .digest("hex");
      return {
        ...item,
        fingerprint,
        sourceId: `${item.source}:${fingerprint}`,
      };
    }),
  })),
});
