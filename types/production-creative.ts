export type ProductionCreativeCompensation =
  | { type: "unpaid_collaboration"; amountMinor: null; currency: null }
  | { type: "paid_mandate"; amountMinor: number; currency: string };

export type ProductionCreativeAthleteRef = {
  id: string;
  name: string;
};

export type ProductionCreativeBrief = {
  id: string;
  title: string;
  creativeType: "photo" | "video" | "photo_video";
  athletes: ProductionCreativeAthleteRef[];
  scheduledDate: string | null;
  dateToAgree: boolean;
  region: string;
  locationDetails: string | null;
  objective: string;
  deliverables: string;
  deliveryDueDate: string | null;
  compensation: ProductionCreativeCompensation;
  expensesCovered: boolean;
  expenseTerms: string;
  creditsAndUsage: string;
  status: "draft" | "published" | "assigned" | "cancelled";
  conditionsVersion: number;
  applicationStatus: "none" | "interested" | "withdrawn" | "selected" | "not_selected";
  applicationMessage: string | null;
  assignment: {
    confirmationStatus: "pending" | "confirmed" | "confirmation_required";
    deliveryStatus: "pending" | "delivered" | "changes_requested" | "validated";
    deliveryLinks: string[];
    deliveryComment: string | null;
    reviewComment: string | null;
    necessaryContactDetails: string | null;
  } | null;
};

export const CREATIVE_FINANCIAL_NOTICE =
  "Les collaborations KLIQUE sont actuellement non rémunérées. Chaque proposition est librement acceptée selon vos disponibilités. Des possibilités de mandats rémunérés pourront se développer dès 2027, sans garantie de volume ni de rémunération future.";
