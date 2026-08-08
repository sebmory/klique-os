import type { ContentGenerationMetadata } from "@/types/content-generation";
import type { ContextUsage } from "@/types/context-intelligence";

export type ContentDocumentType =
  | "interview"
  | "publication"
  | "reel"
  | "story"
  | "podcast"
  | "article"
  | "newsletter"
  | "campaign"
  | "script"
  | "sponsoring_file";

export type ContentDocumentStatus = "draft" | "in_progress" | "final" | "archived";

export type DocumentVersion = {
  id: string;
  createdAt: string;
  label: string;
  source: "generation" | "manual";
};

export type ContentDocumentSidebar = {
  subject: string;
  source: "crm" | "temporary";
  objective: string;
  interviewType?: string;
  platform?: string;
  length?: string;
  tone: string;
  audience: string;
  format: string;
  questionCount?: number;
  templateVersion: string;
  provider: string;
  model: string;
  generatedAt: string;
};

export type InterviewDocumentQuestion = {
  id: string;
  text: string;
  purpose: string;
  topic: string;
  followUps: string[];
  locked: boolean;
  privateNotes: string;
};

export type InterviewDocumentSections = {
  title: string;
  editorialAngle: string;
  introduction: string;
  questions: InterviewDocumentQuestion[];
  conclusion: string;
};

export type ContentDocumentBase = {
  id: string;
  type: ContentDocumentType;
  status: ContentDocumentStatus;
  createdAt: string;
  updatedAt: string;
  versions: DocumentVersion[];
  activeVersionId: string;
  sidebar: ContentDocumentSidebar;
  metadata: ContentGenerationMetadata;
  contextUsage: ContextUsage;
};

export type InterviewDocument = ContentDocumentBase & {
  type: "interview";
  sections: InterviewDocumentSections;
};

export type PublicationDocumentSections = {
  title: string;
  editorialAngle: string;
  hook: string;
  text: string;
  cta: string;
  hashtags: string[];
  visualSuggestion: string;
  editorialNote: string;
};

export type PublicationDocument = ContentDocumentBase & {
  type: "publication";
  sections: PublicationDocumentSections;
};

export type ReelDocumentSections = {
  title: string;
  editorialAngle: string;
  hook: string;
  concept: string;
  scenes: Array<{
    id: string;
    order: number;
    durationSeconds: number;
    role: string;
    shotPlan: string;
    action: string;
    onScreenText: string;
    voiceOver: string;
    bRoll: string;
    transition: string;
    ambianceMusic: string;
    direction?: string;
  }>;
  cta: string;
  caption: string;
  hashtags: string[];
  coverIdea: string;
};

export type ReelDocument = ContentDocumentBase & {
  type: "reel";
  sections: ReelDocumentSections;
};

export type ContentDocument = InterviewDocument | PublicationDocument | ReelDocument;
