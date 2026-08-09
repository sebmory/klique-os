import type { Production } from "@/types/production";

export type ProductionWorkflowStepId =
  | "import"
  | "tri"
  | "retouche"
  | "export"
  | "publication";

export type ProductionWorkflowNormalizedValue = "completed" | "not_completed" | "unknown";

export type ProductionWorkflowStepState = "completed" | "current" | "pending" | "inconsistent";

export type ProductionCalculatedStatus =
  | "not_started"
  | "in_progress"
  | "ready_to_publish"
  | "completed"
  | "needs_review";

export type ProductionWorkflowStatusTone = "neutral" | "warning" | "success" | "danger";

export type ProductionWorkflowSeverity = "warning" | "critical";

export type ProductionWorkflowInconsistencyCode =
  | "UNKNOWN_STEP_VALUE"
  | "TRI_BEFORE_IMPORT"
  | "RETOUCHE_BEFORE_TRI"
  | "EXPORT_BEFORE_RETOUCHE"
  | "PUBLICATION_BEFORE_EXPORT"
  | "STATUS_COMPLETED_BUT_WORKFLOW_OPEN"
  | "STATUS_NOT_STARTED_BUT_WORKFLOW_PROGRESS"
  | "STATUS_READY_BUT_WORKFLOW_NOT_READY"
  | "STATUS_IN_PROGRESS_BUT_WORKFLOW_EMPTY"
  | "PROGRESS_COMPLETE_BUT_STATUS_INCOMPATIBLE";

export type ProductionWorkflowInconsistency = {
  code: ProductionWorkflowInconsistencyCode;
  severity: ProductionWorkflowSeverity;
  message: string;
  stepId?: ProductionWorkflowStepId;
};

export type ProductionWorkflowStep = {
  id: ProductionWorkflowStepId;
  label: string;
  sourceValue: unknown;
  normalizedValue: ProductionWorkflowNormalizedValue;
  state: ProductionWorkflowStepState;
  position: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isPending: boolean;
  hasInconsistency: boolean;
};

export type ProductionWorkflowResult = {
  steps: ProductionWorkflowStep[];
  completedSteps: number;
  totalSteps: number;
  progressPercentage: number;
  currentStep: ProductionWorkflowStep | null;
  nextStep: ProductionWorkflowStep | null;
  calculatedStatus: ProductionCalculatedStatus;
  statusLabel: string;
  statusTone: ProductionWorkflowStatusTone;
  statusSource: string;
  isComplete: boolean;
  hasStarted: boolean;
  hasInconsistency: boolean;
  inconsistencies: ProductionWorkflowInconsistency[];
};

const positiveTokens = new Set([
  "oui",
  "yes",
  "true",
  "1",
  "x",
  "✓",
  "done",
  "ok",
  "publie",
  "publié",
  "termine",
  "terminé",
  "fait",
  "completed",
]);

const negativeTokens = new Set(["non", "no", "false", "0", "", "todo", "a faire", "à faire"]);

const normalize = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const normalizeWorkflowValue = (value: unknown): ProductionWorkflowNormalizedValue => {
  if (typeof value === "boolean") return value ? "completed" : "not_completed";
  if (typeof value === "number") return value > 0 ? "completed" : "not_completed";

  const token = normalize(value);
  if (positiveTokens.has(token)) return "completed";
  if (negativeTokens.has(token)) return "not_completed";
  return "unknown";
};

const normalizeStatusSource = (value: string): string => normalize(value);

const getSourceStatusCategory = (
  status: string
): "completed" | "ready_to_publish" | "in_progress" | "not_started" | "needs_review" | "unknown" => {
  const token = normalizeStatusSource(status);

  if (!token) return "unknown";
  if (token.includes("verif")) return "needs_review";
  if (token.includes("termine") || token.includes("completed") || token.includes("done")) return "completed";
  if (token.includes("pret") && token.includes("publ")) return "ready_to_publish";
  if (token.includes("cours") || token.includes("production")) return "in_progress";
  if (token.includes("demarr") || token.includes("faire") || token.includes("planif")) return "not_started";

  return "unknown";
};

const getStatusMeta = (
  status: ProductionCalculatedStatus
): { label: string; tone: ProductionWorkflowStatusTone; priority: number } => {
  if (status === "needs_review") {
    return { label: "A verifier", tone: "danger", priority: 1 };
  }
  if (status === "completed") {
    return { label: "Termine", tone: "success", priority: 2 };
  }
  if (status === "ready_to_publish") {
    return { label: "Pret a publier", tone: "warning", priority: 3 };
  }
  if (status === "in_progress") {
    return { label: "En production", tone: "warning", priority: 4 };
  }
  return { label: "A demarrer", tone: "neutral", priority: 5 };
};

export const getProductionStatusPriority = (status: ProductionCalculatedStatus): number => {
  return getStatusMeta(status).priority;
};

const stepDefinitions: Array<{
  id: ProductionWorkflowStepId;
  label: string;
  from: (production: Production) => unknown;
}> = [
  { id: "import", label: "Import", from: (production) => production.importDone },
  { id: "tri", label: "Tri", from: (production) => production.triDone },
  { id: "retouche", label: "Retouche", from: (production) => production.retoucheDone },
  { id: "export", label: "Export", from: (production) => production.exportDone },
  { id: "publication", label: "Publication", from: (production) => production.published },
];

const relationRules: Array<{
  code: ProductionWorkflowInconsistencyCode;
  prev: ProductionWorkflowStepId;
  current: ProductionWorkflowStepId;
  message: string;
}> = [
  {
    code: "TRI_BEFORE_IMPORT",
    prev: "import",
    current: "tri",
    message: "Le tri est indique comme termine alors que l import ne l est pas.",
  },
  {
    code: "RETOUCHE_BEFORE_TRI",
    prev: "tri",
    current: "retouche",
    message: "La retouche est indiquee comme terminee alors que le tri ne l est pas.",
  },
  {
    code: "EXPORT_BEFORE_RETOUCHE",
    prev: "retouche",
    current: "export",
    message: "L export est indique comme termine alors que la retouche ne l est pas.",
  },
  {
    code: "PUBLICATION_BEFORE_EXPORT",
    prev: "export",
    current: "publication",
    message: "La publication est indiquee comme terminee alors que l export ne l est pas.",
  },
];

const workflowStepOrder: ProductionWorkflowStepId[] = ["import", "tri", "retouche", "export", "publication"];

export type ProductionWorkflowAdvanceUpdate = Partial<
  Pick<Production, "importDone" | "triDone" | "retoucheDone" | "exportDone" | "published" | "statut">
>;

export type ProductionWorkflowAdvanceResult = {
  canAdvance: boolean;
  completedStepId: ProductionWorkflowStepId | null;
  nextStepId: ProductionWorkflowStepId | null;
  update: ProductionWorkflowAdvanceUpdate;
};

export const advanceProductionWorkflow = (
  production: Production,
  stepId: ProductionWorkflowStepId | null
): ProductionWorkflowAdvanceResult => {
  const workflow = getProductionWorkflow(production);
  const currentStepId = stepId ?? workflow.currentStep?.id ?? workflow.nextStep?.id ?? null;

  if (!currentStepId) {
    return {
      canAdvance: false,
      completedStepId: null,
      nextStepId: null,
      update: {},
    };
  }

  const completedStepIndex = workflowStepOrder.indexOf(currentStepId);
  const nextStepId =
    completedStepIndex >= 0 && completedStepIndex < workflowStepOrder.length - 1
      ? workflowStepOrder[completedStepIndex + 1]
      : null;

  const update: ProductionWorkflowAdvanceUpdate = {};

  switch (currentStepId) {
    case "import":
      update.importDone = true;
      break;
    case "tri":
      update.triDone = true;
      break;
    case "retouche":
      update.retoucheDone = true;
      break;
    case "export":
      update.exportDone = true;
      break;
    case "publication":
      update.published = true;
      break;
  }

  update.statut = currentStepId === "publication" ? "Terminé" : currentStepId === "export" ? "Pret a publier" : "En production";

  return {
    canAdvance: true,
    completedStepId: currentStepId,
    nextStepId,
    update,
  };
};

export const getProductionWorkflow = (production: Production): ProductionWorkflowResult => {
  const stepData = stepDefinitions.map((definition, index) => {
    const sourceValue = definition.from(production);
    const normalizedValue = normalizeWorkflowValue(sourceValue);
    const isCompleted = normalizedValue === "completed";
    return {
      id: definition.id,
      label: definition.label,
      sourceValue,
      normalizedValue,
      position: index + 1,
      isCompleted,
    };
  });

  const completedSteps = stepData.filter((step) => step.isCompleted).length;
  const totalSteps = stepData.length;
  const progressPercentage = Math.round((completedSteps / totalSteps) * 100);
  const isComplete = completedSteps === totalSteps;
  const hasStarted = completedSteps > 0;

  const unknownInconsistencies: ProductionWorkflowInconsistency[] = stepData
    .filter((step) => step.normalizedValue === "unknown")
    .map((step) => ({
      code: "UNKNOWN_STEP_VALUE",
      severity: "warning",
      message: `La valeur de l etape ${step.label} n est pas reconnue et doit etre verifiee.`,
      stepId: step.id,
    }));

  const orderInconsistencies: ProductionWorkflowInconsistency[] = relationRules
    .filter((rule) => {
      const previous = stepData.find((step) => step.id === rule.prev);
      const current = stepData.find((step) => step.id === rule.current);
      if (!previous || !current) return false;
      return current.isCompleted && !previous.isCompleted;
    })
    .map((rule) => ({
      code: rule.code,
      severity: "critical" as const,
      message: rule.message,
      stepId: rule.current,
    }));

  const sourceStatus = String(production.statut ?? "").trim();
  const sourceCategory = getSourceStatusCategory(sourceStatus);
  const statusInconsistencies: ProductionWorkflowInconsistency[] = [];

  if (sourceCategory === "completed" && !isComplete) {
    statusInconsistencies.push({
      code: "STATUS_COMPLETED_BUT_WORKFLOW_OPEN",
      severity: "warning",
      message: "Le statut general indique termine alors que le workflow n est pas complet.",
    });
  }

  if (sourceCategory === "not_started" && completedSteps > 0 && !isComplete) {
    statusInconsistencies.push({
      code: "STATUS_NOT_STARTED_BUT_WORKFLOW_PROGRESS",
      severity: "warning",
      message: "Le statut general indique a demarrer alors que des etapes sont deja terminees.",
    });
  }

  if (sourceCategory === "ready_to_publish" && !isComplete && !(completedSteps === 4 && !isComplete)) {
    statusInconsistencies.push({
      code: "STATUS_READY_BUT_WORKFLOW_NOT_READY",
      severity: "warning",
      message: "Le statut general indique pret a publier mais le workflow ne correspond pas a cet etat.",
    });
  }

  if (sourceCategory === "in_progress" && completedSteps === 0) {
    statusInconsistencies.push({
      code: "STATUS_IN_PROGRESS_BUT_WORKFLOW_EMPTY",
      severity: "warning",
      message: "Le statut general indique en production alors qu aucune etape n est terminee.",
    });
  }

  if (progressPercentage === 100 && !isComplete && (sourceCategory === "not_started" || sourceCategory === "in_progress" || sourceCategory === "ready_to_publish")) {
    statusInconsistencies.push({
      code: "PROGRESS_COMPLETE_BUT_STATUS_INCOMPATIBLE",
      severity: "warning",
      message: "Le workflow est a 100% mais le statut general ne correspond pas a un etat termine.",
    });
  }

  const inconsistencies = [...unknownInconsistencies, ...orderInconsistencies, ...statusInconsistencies];
  const hasInconsistency = inconsistencies.length > 0;

  let calculatedStatus: ProductionCalculatedStatus;
  if (hasInconsistency) {
    calculatedStatus = "needs_review";
  } else if (isComplete) {
    calculatedStatus = "completed";
  } else if (completedSteps === 4) {
    calculatedStatus = "ready_to_publish";
  } else if (hasStarted) {
    calculatedStatus = "in_progress";
  } else {
    calculatedStatus = "not_started";
  }

  const firstPendingIndex = stepData.findIndex((step) => !step.isCompleted);
  const currentStepId = !isComplete && firstPendingIndex >= 0 ? stepData[firstPendingIndex].id : null;

  const steps: ProductionWorkflowStep[] = stepData.map((step) => {
    const hasStepInconsistency = inconsistencies.some((issue) => issue.stepId === step.id);
    const isCurrent = currentStepId === step.id;
    const isPending = !step.isCompleted && !isCurrent;

    let state: ProductionWorkflowStepState = "pending";
    if (step.isCompleted) state = "completed";
    if (isCurrent) state = "current";
    if (hasStepInconsistency) state = "inconsistent";

    return {
      id: step.id,
      label: step.label,
      sourceValue: step.sourceValue,
      normalizedValue: step.normalizedValue,
      state,
      position: step.position,
      isCompleted: step.isCompleted,
      isCurrent,
      isPending,
      hasInconsistency: hasStepInconsistency,
    };
  });

  const currentStep = steps.find((step) => step.isCurrent) ?? null;
  const nextStep =
    currentStep ?? steps.find((step) => step.isPending || step.state === "inconsistent") ?? null;
  const statusMeta = getStatusMeta(calculatedStatus);

  return {
    steps,
    completedSteps,
    totalSteps,
    progressPercentage,
    currentStep,
    nextStep,
    calculatedStatus,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    statusSource: sourceStatus,
    isComplete,
    hasStarted,
    hasInconsistency,
    inconsistencies,
  };
};

export const buildProductionWorkflow = getProductionWorkflow;
