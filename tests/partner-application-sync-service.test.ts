import { describe, expect, it, vi } from "vitest";
import {
  createStablePartnerUuid,
  syncPartnerApplicationRow,
  type PartnerApplicationSyncDependencies,
  type PartnerApplicationSyncRepository,
} from "@/lib/partners/application-sync-service";

const formValues = {
  Horodateur: "15/09/2026 05:17:49",
  "Nom de l'entreprise": "Aloha Wake",
  "Personne de contact": "Contact formulaire",
  "E-mail de contact": " HELLO@ALohaWake.ch ",
  Téléphone: "+41 00 000 00 00",
  "Site internet": "alohawake.ch",
  Instagram: "aloha_wake_estavayer",
  Facebook: "",
  "Présentez votre activité en quelques mots / lignes": "École de wakesurf.",
  "Quels avantages souhaiteriez-vous proposer aux membres Klique (la liste est évolutive) ?": "Offre découverte",
  "Merci de préciser les détails des avantages sélectionnés (% de réduction, nature de l'offre / cadeau /produits à tester / etc.)": "50% sur une session par année",
  "Quels types de collaborations vous intéressent pour votre entreprise (la liste est évolutive) ?": "Vidéo promotionnelle",
  "Communication - Acceptez-vous que Klique utilise votre logo et vos visuels pour présenter le partenariat ?": "Oui",
  "Logo - Disposez-vous d'un logo HD pour la communication de Klique ?": "https://drive.example/logo",
};

const shuffledFormHeaders = [
  "Instagram",
  "Horodateur",
  "E-mail de contact",
  "Nom de l'entreprise",
  "Facebook",
  "Personne de contact",
  "Site internet",
  "Téléphone",
  "Quels types de collaborations vous intéressent pour votre entreprise (la liste est évolutive) ?",
  "Présentez votre activité en quelques mots / lignes",
  "Logo - Disposez-vous d'un logo HD pour la communication de Klique ?",
  "Quels avantages souhaiteriez-vous proposer aux membres Klique (la liste est évolutive) ?",
  "Communication - Acceptez-vous que Klique utilise votre logo et vos visuels pour présenter le partenariat ?",
  "Merci de préciser les détails des avantages sélectionnés (% de réduction, nature de l'offre / cadeau /produits à tester / etc.)",
];

const canonicalHeaders = [
  "Nom", "Type de relation", "Catégorie", "Contact principal", "Fonction", "E-mail", "Téléphone", "Site",
  "Offre / avantage membres", "Athlètes concernés", "Statut", "Date premier contact", "Dernier contact",
  "Prochaine relance", "Prochaine action", "Valeur estimée (CHF)", "Contrat signé ?", "Début collaboration",
  "Fin collaboration", "Contenus / contreparties", "Notes", "Priorité stratégique", "Potentiel",
  "Objectif du prochain contact", "Date arrivée KLIQUE", "Partner ID",
];

const createRepository = (
  initialRows: Array<{ rowNumber: number; values: string[] }> = [],
  initialColumnCount = 26,
) => {
  const headers = [...canonicalHeaders];
  const rows = initialRows.map((row) => ({ rowNumber: row.rowNumber, values: [...row.values] }));
  let columnCount = initialColumnCount;
  const repository: PartnerApplicationSyncRepository = {
    readFormRow: vi.fn().mockResolvedValue({
      headers: shuffledFormHeaders,
      values: shuffledFormHeaders.map((header) => formValues[header as keyof typeof formValues] ?? ""),
    }),
    readCanonicalSheet: vi.fn(async () => ({ headerRowNumber: 3, headers: [...headers], rows })),
    readCanonicalSheetProperties: vi.fn(async () => ({ sheetId: 606, columnCount })),
    appendCanonicalColumns: vi.fn(async (_sheetId, appendedColumnCount) => {
      columnCount += appendedColumnCount;
    }),
    appendCanonicalHeaders: vi.fn(async (_headerRowNumber, startColumn, missingHeaders) => {
      while (headers.length < startColumn) headers.push("");
      headers.push(...missingHeaders);
    }),
    updateCanonicalRow: vi.fn(async (rowNumber, values) => {
      const row = rows.find((candidate) => candidate.rowNumber === rowNumber);
      if (row) row.values = [...values];
    }),
    appendCanonicalRow: vi.fn(async (values) => {
      const rowNumber = rows.length === 0 ? 4 : Math.max(...rows.map((row) => row.rowNumber)) + 1;
      rows.push({ rowNumber, values: [...values] });
      return rowNumber;
    }),
  };
  return { repository, headers, rows, getColumnCount: () => columnCount };
};

const dependencies = (repository: PartnerApplicationSyncRepository): PartnerApplicationSyncDependencies => ({
  repository,
  now: () => new Date("2026-09-22T12:00:00.000Z"),
});

const canonicalRow = (overrides: Record<number, string> = {}) => {
  const values = Array.from({ length: canonicalHeaders.length }, () => "");
  for (const [index, value] of Object.entries(overrides)) values[Number(index)] = value;
  return values;
};

describe("Partner application synchronization service", () => {
  it("creates one Prospect with a stable UUID and remains unchanged on replay", async () => {
    const state = createRepository();

    const created = await syncPartnerApplicationRow(5, dependencies(state.repository));
    const replayed = await syncPartnerApplicationRow(5, dependencies(state.repository));

    expect(created).toMatchObject({ status: "created", canonicalRow: 4, sourceRow: 5 });
    expect(replayed).toMatchObject({ status: "unchanged", canonicalRow: 4, partnerId: created.partnerId });
    expect(created.partnerId).toBe(createStablePartnerUuid("hello@alohawake.ch", "Aloha Wake"));
    expect(state.repository.appendCanonicalRow).toHaveBeenCalledOnce();
    expect(state.repository.updateCanonicalRow).not.toHaveBeenCalled();
    expect(state.repository.readCanonicalSheetProperties).toHaveBeenCalledTimes(2);
    expect(state.repository.appendCanonicalColumns).toHaveBeenCalledOnce();
    expect(state.repository.appendCanonicalColumns).toHaveBeenCalledWith(606, 11);
    expect(state.getColumnCount()).toBe(37);
    expect(state.repository.appendCanonicalHeaders).toHaveBeenCalledWith(3, 26, expect.any(Array));
    expect(state.headers.slice(0, 26)).toEqual(canonicalHeaders);
    const createdValues = state.rows[0].values;
    expect(createdValues[state.headers.indexOf("Nom")]).toBe("Aloha Wake");
    expect(createdValues[state.headers.indexOf("Statut")]).toBe("Prospect");
    expect(createdValues[state.headers.indexOf("Offre / avantage membres")]).toBe("");
    expect(createdValues[state.headers.indexOf("Contenus / contreparties")]).toBe("");
    expect(createdValues[state.headers.indexOf("Type d’avantage proposé")]).toBe("Offre découverte");
    expect(createdValues[state.headers.indexOf("Détails de l’avantage proposé")]).toBe("50% sur une session par année");
  });

  it("does not extend a canonical sheet that already has 37 columns", async () => {
    const state = createRepository([], 37);

    await syncPartnerApplicationRow(5, dependencies(state.repository));
    await syncPartnerApplicationRow(5, dependencies(state.repository));

    expect(state.repository.readCanonicalSheetProperties).toHaveBeenCalledTimes(2);
    expect(state.repository.appendCanonicalColumns).not.toHaveBeenCalled();
    expect(state.getColumnCount()).toBe(37);
  });

  it.each([
    [null, 26],
    [606, null],
    [1.5, 26],
    [606, 0],
  ])("rejects invalid canonical sheet metadata: %o, %o", async (sheetId, columnCount) => {
    const state = createRepository();
    vi.mocked(state.repository.readCanonicalSheetProperties).mockResolvedValue({ sheetId, columnCount });

    await expect(syncPartnerApplicationRow(5, dependencies(state.repository))).rejects.toMatchObject({
      code: "validation",
      message: "Métadonnées de la feuille 06_Partenaires absentes ou invalides.",
    });
    expect(state.repository.appendCanonicalColumns).not.toHaveBeenCalled();
    expect(state.repository.appendCanonicalHeaders).not.toHaveBeenCalled();
  });

  it("matches by normalized email first and fills only empty canonical fields", async () => {
    const adminUuid = "5e4f5ced-2aa0-4538-8e57-3e2a9f6b0833";
    const state = createRepository([{ rowNumber: 9, values: canonicalRow({
      0: "Nom choisi par Admin",
      2: "Sport nautique",
      3: "Contact Admin",
      5: "hello@alohawake.ch",
      7: "https://admin.example",
      8: "Offre publiée par Admin",
      10: "Actif",
      19: "Contrepartie Admin",
      25: adminUuid,
    }) }]);

    const result = await syncPartnerApplicationRow(5, dependencies(state.repository));
    const updated = state.rows[0].values;

    expect(result).toMatchObject({ status: "updated", canonicalRow: 9, partnerId: adminUuid });
    expect(updated[state.headers.indexOf("Nom")]).toBe("Nom choisi par Admin");
    expect(updated[state.headers.indexOf("Contact principal")]).toBe("Contact Admin");
    expect(updated[state.headers.indexOf("Site")]).toBe("https://admin.example");
    expect(updated[state.headers.indexOf("Statut")]).toBe("Actif");
    expect(updated[state.headers.indexOf("Offre / avantage membres")]).toBe("Offre publiée par Admin");
    expect(updated[state.headers.indexOf("Contenus / contreparties")]).toBe("Contrepartie Admin");
    expect(updated[state.headers.indexOf("Instagram")]).toBe("aloha_wake_estavayer");
  });

  it("falls back to the normalized company name when email does not match", async () => {
    const state = createRepository([{ rowNumber: 7, values: canonicalRow({
      0: "  Àloha-Wake ",
      5: "different@example.com",
      25: "a4ed0d44-36d6-48e3-b399-28f6ac9e2538",
    }) }]);

    const result = await syncPartnerApplicationRow(5, dependencies(state.repository));

    expect(result.canonicalRow).toBe(7);
    expect(state.repository.appendCanonicalRow).not.toHaveBeenCalled();
  });

  it("refuses multiple canonical matches without writing", async () => {
    const state = createRepository([
      { rowNumber: 7, values: canonicalRow({ 0: "Aloha Wake", 5: "hello@alohawake.ch" }) },
      { rowNumber: 8, values: canonicalRow({ 0: "Aloha Wake Suisse", 5: "hello@alohawake.ch" }) },
    ]);

    await expect(syncPartnerApplicationRow(5, dependencies(state.repository)))
      .rejects.toMatchObject({ code: "conflict" });
    expect(state.repository.updateCanonicalRow).not.toHaveBeenCalled();
    expect(state.repository.appendCanonicalRow).not.toHaveBeenCalled();
  });

  it("rejects missing or duplicated source headers before canonical writes", async () => {
    const state = createRepository();
    vi.mocked(state.repository.readFormRow).mockResolvedValue({
      headers: [...shuffledFormHeaders, "Nom de l'entreprise"],
      values: [...shuffledFormHeaders.map((header) => formValues[header as keyof typeof formValues] ?? ""), "Duplicate"],
    });

    await expect(syncPartnerApplicationRow(5, dependencies(state.repository)))
      .rejects.toMatchObject({ code: "validation" });
    expect(state.repository.readCanonicalSheet).not.toHaveBeenCalled();
  });
});