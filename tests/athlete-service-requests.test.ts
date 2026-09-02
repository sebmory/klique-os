import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAthleteServiceRequestHandlers } from "@/app/api/athlete/service-requests/route";
import {
  createAthleteServiceRequest,
  parseAthleteServiceRequestInput,
  type AthleteServiceRequestCreationContext,
  type AthleteServiceRequestCreateRecord,
  type AthleteServiceRequestRepository,
  type PublicAthleteServiceRequest,
} from "@/lib/athlete-service-requests";
import type { AthleteMembershipPlan } from "@/lib/athlete-credits";
import type { AthleteServiceProduct } from "@/lib/athlete-service-catalog";

const essentialPlan: AthleteMembershipPlan = {
  code: "essential",
  name: "Essentiel",
  active: true,
  durationMonths: 12,
  annualPriceChf: 249,
  monthlyInstallmentChf: 21,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
  metadata: {},
};

const impactPlan: AthleteMembershipPlan = {
  ...essentialPlan,
  code: "impact",
  name: "Impact",
  videoAllowed: true,
};

const product = (overrides: Partial<AthleteServiceProduct> = {}): AthleteServiceProduct => ({
  code: "photo_session_standard",
  name: "Session photo KLIQUE",
  active: true,
  priceChf: 149,
  fulfillmentKind: "photo_session",
  includedDeliverables: 1,
  commercialScope: "Session photo standard.",
  allowedPlanCodes: null,
  requiredProductionCredits: 0,
  validityMonths: 12,
  ...overrides,
});

const publicRequest = (
  overrides: Partial<PublicAthleteServiceRequest> = {},
): PublicAthleteServiceRequest => ({
  productCode: "photo_session_standard",
  fulfillmentMode: "included_right",
  status: "received",
  message: null,
  preferredDate: null,
  requestedAt: "2026-09-02T12:00:00.000Z",
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  refusedAt: null,
  refusalReason: null,
  ...overrides,
});

const context = (
  overrides: Partial<AthleteServiceRequestCreationContext> = {},
): AthleteServiceRequestCreationContext => ({
  product: product(),
  membershipActive: true,
  plan: essentialPlan,
  balance: { production: 1, custom_content: 2 },
  reserved: { production: 0, custom_content: 0 },
  ...overrides,
});

const repository = (creationContext: AthleteServiceRequestCreationContext) => {
  const createdRecords: AthleteServiceRequestCreateRecord[] = [];
  const value: AthleteServiceRequestRepository = {
    list: vi.fn().mockResolvedValue([]),
    loadCreationContext: vi.fn().mockResolvedValue(creationContext),
    create: vi.fn(async (record) => {
      createdRecords.push(record);
      return publicRequest({
        productCode: record.productCode,
        fulfillmentMode: record.fulfillmentMode,
        message: record.requestedDetails.message ?? null,
        preferredDate: record.requestedDetails.preferredDate ?? null,
      });
    }),
  };
  return { value, createdRecords };
};

const createRequest = (
  serviceRepository: AthleteServiceRequestRepository,
  overrides: Partial<Parameters<typeof createAthleteServiceRequest>[0]["input"]> = {},
) => createAthleteServiceRequest({
  workspaceId: "workspace-authenticated",
  athleteId: "athlete-authenticated",
  input: {
    productCode: "photo_session_standard",
    fulfillmentMode: "included_right",
    ...overrides,
  },
  repository: serviceRepository,
});

describe("Athlete service requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives workspace and athlete identity exclusively from active athlete access", async () => {
    const createRequestMock = vi.fn().mockResolvedValue(publicRequest());
    const handlers = createAthleteServiceRequestHandlers({
      getAccess: vi.fn().mockResolvedValue({
        role: "athlete",
        status: "active",
        workspaceId: "workspace-authenticated",
        athleteId: "athlete-authenticated",
      }),
      listRequests: vi.fn().mockResolvedValue([]),
      createRequest: createRequestMock,
    });
    const request = new Request(
      "http://localhost/api/athlete/service-requests?workspaceId=workspace-client&athleteId=athlete-client",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productCode: "photo_session_standard",
          fulfillmentMode: "included_right",
        }),
      },
    );

    const response = await handlers.POST(request);

    expect(response.status).toBe(201);
    expect(createRequestMock).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      athleteId: "athlete-authenticated",
      input: {
        productCode: "photo_session_standard",
        fulfillmentMode: "included_right",
      },
    });
  });

  it("lists only the authenticated athlete requests through a public projection", async () => {
    const listRequests = vi.fn().mockResolvedValue([publicRequest()]);
    const handlers = createAthleteServiceRequestHandlers({
      getAccess: vi.fn().mockResolvedValue({
        role: "athlete",
        status: "active",
        workspaceId: "workspace-authenticated",
        athleteId: "athlete-authenticated",
      }),
      listRequests,
      createRequest: vi.fn(),
    });

    const response = await handlers.GET(new Request("http://localhost/api/athlete/service-requests"));
    const payload = await response.json();

    expect(listRequests).toHaveBeenCalledWith({
      workspaceId: "workspace-authenticated",
      athleteId: "athlete-authenticated",
    });
    expect(payload.requests[0]).not.toHaveProperty("id");
    expect(payload.requests[0]).not.toHaveProperty("purchaseId");
    expect(payload.requests[0]).not.toHaveProperty("usageMovementId");
  });

  it("freezes an available included right after active reservations", async () => {
    const serviceRepository = repository(context({
      balance: { production: 2, custom_content: 0 },
      reserved: { production: 1, custom_content: 0 },
    }));

    await createRequest(serviceRepository.value, { message: "Besoin de nouvelles photos" });

    expect(serviceRepository.createdRecords[0]).toMatchObject({
      workspaceId: "workspace-authenticated",
      athleteId: "athlete-authenticated",
      snapshotCreditType: "production",
      snapshotCreditQuantity: 1,
      snapshotPriceChf: null,
    });
  });

  it("rejects an included right when active reservations exhaust the balance", async () => {
    const serviceRepository = repository(context({
      balance: { production: 1, custom_content: 0 },
      reserved: { production: 1, custom_content: 0 },
    }));

    await expect(createRequest(serviceRepository.value)).rejects.toMatchObject({
      code: "insufficient_rights",
    });
    expect(serviceRepository.value.create).not.toHaveBeenCalled();
  });

  it("freezes only the server price for a paid supplement", async () => {
    const serviceRepository = repository(context());

    await createRequest(serviceRepository.value, { fulfillmentMode: "paid_extra" });

    expect(serviceRepository.createdRecords[0]).toMatchObject({
      snapshotCreditType: null,
      snapshotCreditQuantity: null,
      snapshotPriceChf: 149,
    });
  });

  it("requires the hybrid mode and freezes price plus right for match conversion", async () => {
    const matchUpgrade = product({
      code: "match_coverage_upgrade",
      name: "Conversion en couverture de match",
      priceChf: 30,
      fulfillmentKind: "match_credit_upgrade",
      requiredProductionCredits: 1,
    });
    const serviceRepository = repository(context({
      product: matchUpgrade,
      balance: { production: 1, custom_content: 0 },
    }));

    await createRequest(serviceRepository.value, {
      productCode: "match_coverage_upgrade",
      fulfillmentMode: "paid_with_right",
    });

    expect(serviceRepository.createdRecords[0]).toMatchObject({
      productCode: "match_coverage_upgrade",
      fulfillmentMode: "paid_with_right",
      snapshotCreditType: "production",
      snapshotCreditQuantity: 1,
      snapshotPriceChf: 30,
    });
  });

  it("refuses no_charge and unknown client fields", () => {
    expect(() => parseAthleteServiceRequestInput({
      productCode: "photo_session_standard",
      fulfillmentMode: "no_charge",
    })).toThrow("Ce mode n’est pas disponible.");
    expect(() => parseAthleteServiceRequestInput({
      productCode: "photo_session_standard",
      fulfillmentMode: "included_right",
      snapshotPriceChf: 0,
    })).toThrow("Données invalides.");
  });

  it("restricts video to Impact or Signature", async () => {
    const video = product({
      code: "simple_video_capsule",
      name: "Capsule vidéo simple",
      priceChf: 349,
      fulfillmentKind: "simple_video",
      allowedPlanCodes: ["impact", "signature"],
    });
    const essentialRepository = repository(context({ product: video, plan: essentialPlan }));
    const impactRepository = repository(context({
      product: video,
      plan: impactPlan,
      balance: { production: 2, custom_content: 0 },
    }));

    await expect(createRequest(essentialRepository.value)).rejects.toMatchObject({
      code: "plan_not_allowed",
    });
    await createRequest(impactRepository.value);
    expect(impactRepository.createdRecords[0]).toMatchObject({
      snapshotCreditType: "production",
      snapshotCreditQuantity: 2,
    });
  });

  it("creates only a received request without any financial linkage or write", async () => {
    const serviceRepository = repository(context());

    const result = await createRequest(serviceRepository.value, {
      preferredDate: "2026-10-01T10:00:00.000Z",
    });

    expect(result.status).toBe("received");
    expect(serviceRepository.value.loadCreationContext).toHaveBeenCalledTimes(1);
    expect(serviceRepository.value.create).toHaveBeenCalledTimes(1);
    expect(serviceRepository.createdRecords[0]).not.toHaveProperty("purchaseId");
    expect(serviceRepository.createdRecords[0]).not.toHaveProperty("usageMovementId");
    expect(Object.keys(serviceRepository.value).sort()).toEqual([
      "create",
      "list",
      "loadCreationContext",
    ]);
  });
});
