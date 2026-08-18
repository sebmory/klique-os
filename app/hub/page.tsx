"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Badge, Button, Card, EmptyState, Input, Select, Textarea } from "@/src/design-system/components";
import { inferBenefitUsage, type BenefitUsage } from "@/lib/benefits-usage";
import type { Partner } from "@/types/partner";

const normalizeResourceStatus = (status: string | null | undefined): "Brouillon" | "Publié" => {
  if (status === "published" || status === "Publié") return "Publié";
  return "Brouillon";
};

type HubTab = "Fil" | "Opportunités" | "Avantages" | "Ressources";
type FeedFilter = "Tout" | "Athlètes" | "Experts & partenaires" | "KLIQUE";
type OpportunityCategoryFilter = "Tout" | "Sport" | "Média" | "Shooting" | "Collaboration" | "Événement" | "Partenariat";
type OpportunityStatusFilter = "Ouvertes" | "Bientôt" | "Fermées" | "Brouillons";
type OpportunityCategory = "Collaboration" | "Shooting" | "Événement" | "Média" | "Casting" | "Partenariat" | "Sport" | "Autre";
type OpportunityStatus = "Ouverte" | "Bientôt" | "Fermée" | "Brouillon";
type BenefitCategoryFilter = "Tout" | "Santé" | "Mobilité" | "Tech" | "Lifestyle" | "Nutrition" | "Formation" | "Sport";
type BenefitStatus = "Actif" | "Bientôt" | "Expiré";
type ResourceCategory = "Mental" | "Nutrition" | "Récupération" | "Performance" | "Image & réseaux sociaux" | "Carrière" | "Administratif" | "Médias" | "Autre";
type ResourceContentType = "Article" | "Guide" | "Vidéo" | "Document" | "Lien" | "Conseil";

type OpportunityFormState = {
  title: string;
  category: OpportunityCategory;
  organisation: string;
  audience: string;
  domain: string;
  location: string;
  date: string;
  deadline: string;
  fullDescription: string;
  prerequisites: string;
  practicalInfo: string;
  status: OpportunityStatus;
};

type CommentItem = {
  id: string;
  author: string;
  text: string;
};

type PublicationItem = {
  id: string;
  author: string;
  role: string;
  specialty: string;
  date: string;
  scope: FeedFilter;
  type: "publication" | "présentation" | "résultat" | "question" | "conseil" | "annonce";
  content: string;
  reactions: number;
  comments: CommentItem[];
  imageUrl?: string;
  reactedByCurrentUser?: boolean;
  authorProfilePath?: string | null;
};

const tabs: HubTab[] = ["Fil", "Opportunités", "Avantages", "Ressources"];
const filters: FeedFilter[] = ["Tout", "Athlètes", "Experts & partenaires", "KLIQUE"];
const opportunityCategoryFilters: OpportunityCategoryFilter[] = ["Tout", "Sport", "Média", "Shooting", "Collaboration", "Événement", "Partenariat"];
const opportunityStatusFilters: OpportunityStatusFilter[] = ["Ouvertes", "Bientôt", "Fermées", "Brouillons"];
const benefitCategoryFilters: BenefitCategoryFilter[] = ["Tout", "Santé", "Mobilité", "Tech", "Lifestyle", "Nutrition", "Formation", "Sport"];

const createEmptyOpportunityForm = (): OpportunityFormState => ({
  title: "",
  category: "Autre",
  organisation: "",
  audience: "",
  domain: "",
  location: "",
  date: "",
  deadline: "",
  fullDescription: "",
  prerequisites: "",
  practicalInfo: "",
  status: "Brouillon",
});

type OpportunityItem = {
  id: string;
  title: string;
  category: OpportunityCategory;
  organisation: string;
  audience: string;
  domain: string;
  location: string;
  date: string;
  deadline: string;
  description: string;
  fullDescription: string;
  prerequisites: string;
  practicalInfo: string;
  status: OpportunityStatus;
};

type SlotStatus = "open" | "closed" | "cancelled";
type SlotRequestStatus = "requested" | "confirmed" | "declined" | "cancelled";

type SlotItem = {
  id: string;
  opportunityId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: SlotStatus;
};

type SlotRequestItem = {
  id: string;
  slotId: string;
  athleteId: string;
  status: SlotRequestStatus;
};

const slotStatusLabels: Record<SlotStatus, string> = {
  open: "Ouvert",
  closed: "Fermé",
  cancelled: "Annulé",
};

const slotRequestStatusLabels: Record<SlotRequestStatus, string> = {
  requested: "Demandée",
  confirmed: "Confirmée",
  declined: "Refusée",
  cancelled: "Annulée",
};

const slotDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const slotTimeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatSlotDate = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date inconnue" : slotDateFormatter.format(parsed);
};

const formatSlotTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "--:--" : slotTimeFormatter.format(parsed);
};

type BenefitItem = {
  id: string;
  partner: string;
  partnerType: string;
  title: string;
  category: BenefitCategoryFilter;
  description: string;
  value: string;
  conditions: string;
  validity: string;
  activation: string;
  status: BenefitStatus;
  usage: BenefitUsage;
};

type ResourceItem = {
  id: string;
  title: string;
  category: ResourceCategory;
  author: string;
  description: string;
  contentType: ResourceContentType;
  content: string;
  date: string;
  status: "Brouillon" | "Publié";
  submittedBy: "KLIQUE" | "Expert";
};

type ResourceFormState = {
  title: string;
  category: ResourceCategory;
  author: string;
  type: ResourceContentType;
  description: string;
  content: string;
  status: "Brouillon" | "Publié";
  date: string;
};

const normalizeBenefitText = (value: unknown): string => String(value ?? "").trim();
const isStatusLike = (value: string): boolean => {
  const normalized = normalizeBenefitText(value).toLowerCase();
  return normalized === "actif" || normalized === "inactif" || normalized === "prospect" || normalized === "non renseigné" || normalized === "non-renseigné";
};

const inferBenefitCategory = (value: string): BenefitCategoryFilter => {
  const normalized = value.toLowerCase();
  if (/(sant|medical|récup|rehab|care|health)/.test(normalized)) return "Santé";
  if (/(mobil|transport|trajet|travel|voiture|station)/.test(normalized)) return "Mobilité";
  if (/(tech|digital|studio|content|media|software|app)/.test(normalized)) return "Tech";
  if (/(lifestyle|image|brand|beauty|fashion|camera)/.test(normalized)) return "Lifestyle";
  if (/(nutrition|nutri|food|diet|meal)/.test(normalized)) return "Nutrition";
  if (/(formation|academy|education|formation|course|module)/.test(normalized)) return "Formation";
  return "Sport";
};

const buildPartnerBenefits = (partners: Partner[]): BenefitItem[] => {
  const seen = new Set<string>();

  return partners
    .map((partner) => {
      const partnerName = normalizeBenefitText(partner.name);
      const typeLabel = partner.expertKlique ? "Expert" : "Partenaire";

      const offerCandidates = [
        normalizeBenefitText(partner.memberOffer),
        normalizeBenefitText(partner.benefits),
        normalizeBenefitText(partner.services),
        normalizeBenefitText(partner.counterparts),
        normalizeBenefitText(partner.description),
      ].filter((value) => value && !isStatusLike(value));

      const titleSource = offerCandidates[0] ?? "";
      const descriptionSource = [
        normalizeBenefitText(partner.benefits),
        normalizeBenefitText(partner.description),
        normalizeBenefitText(partner.notes),
        normalizeBenefitText(partner.services),
      ].find((value) => value && !isStatusLike(value)) ?? "";

      const valueSource = [
        normalizeBenefitText(partner.memberOffer),
        normalizeBenefitText(partner.benefits),
        normalizeBenefitText(partner.services),
        normalizeBenefitText(partner.counterparts),
      ].find((value) => value && !isStatusLike(value)) ?? "";

      const conditionsSource = [
        normalizeBenefitText(partner.notes),
        normalizeBenefitText(partner.description),
        normalizeBenefitText(partner.counterparts),
      ].find((value) => value && !isStatusLike(value)) ?? "";

      const validity = normalizeBenefitText(partner.collaborationEnd || partner.nextFollowUp || "");
      const activation = normalizeBenefitText(partner.contact || partner.email || partner.website || "")
        ? "Contact direct avec le partenaire"
        : "À confirmer avec le partenaire";

      const title = titleSource
        ? titleSource.replace(/^\s*([A-ZÀ-ÖØ-Ý][^.]*)$/u, (match) => match.charAt(0).toUpperCase() + match.slice(1))
        : `Offre réservée aux membres KLIQUE`;

      const description = descriptionSource && descriptionSource !== titleSource ? descriptionSource : "";
      const value = valueSource && valueSource !== titleSource ? valueSource : "";
      const conditions = conditionsSource && conditionsSource !== descriptionSource && conditionsSource !== titleSource ? conditionsSource : "";

      const hasOffer = Boolean(titleSource || descriptionSource || valueSource || conditionsSource || validity);
      if (!hasOffer || !partnerName) return null;

      const signature = `${partnerName}|${titleSource}|${descriptionSource}|${valueSource}`.toLowerCase();
      if (seen.has(signature)) return null;
      seen.add(signature);

      const status: BenefitStatus = partner.status === "Actif" ? "Actif" : partner.status === "Prospect" ? "Bientôt" : "Expiré";
      const usage = inferBenefitUsage({
        usageType: partner.usageType,
        usageLimit: partner.usageLimit,
        memberOffer: partner.memberOffer,
        benefits: partner.benefits,
        services: partner.services,
        description: partner.description,
        notes: partner.notes,
        counterparts: partner.counterparts,
      });
      const normalizedPartnerName = normalizeBenefitText(partner.name).toLowerCase();
      const resolvedUsage = normalizedPartnerName.includes("klyo massage") && usage.usageType === "unlimited"
        ? { usageType: "once" as const }
        : usage;

      return {
        id: `partner-benefit-${partner.id || partnerName}`,
        partner: partnerName,
        partnerType: typeLabel,
        title,
        category: inferBenefitCategory(`${title} ${description} ${value}`),
        description,
        value,
        conditions,
        validity: validity || "À confirmer",
        activation,
        status,
        usage: resolvedUsage,
      } satisfies BenefitItem;
    })
    .filter((benefit): benefit is BenefitItem => Boolean(benefit));
};

const demoBenefits: BenefitItem[] = [
  {
    id: "benefit-1",
    partner: "Lumen Recovery",
    partnerType: "Partenaire",
    title: "Séance premium de récupération musculaire",
    category: "Santé",
    description: "Accès prioritaire à une session de récupération et de mobilité avec un accompagnement personnalisé pour les athlètes en période de charge intense.",
    value: "-20 % sur la séance",
    conditions: "Réservation 48h à l’avance et présentation du profil KLIQUE au moment du rdv.",
    validity: "Jusqu’au 30 novembre 2026",
    activation: "Code KLIQUE-RECUP",
    status: "Actif",
    usage: { usageType: "once" },
  },
  {
    id: "benefit-2",
    partner: "Volt Mobility",
    partnerType: "Partenaire",
    title: "Abonnement mobilité urbaine premium",
    category: "Mobilité",
    description: "Un mois d’abonnement pour les trajets domicile-stade, avec accès à des stations partenaires et un service de dépannage rapide.",
    value: "1 mois offert",
    conditions: "Valable pour les réservations faites depuis le profil membre KLIQUE.",
    validity: "Valable jusqu’au 15 octobre 2026",
    activation: "Activation directe dans l’app partenaire",
    status: "Actif",
    usage: { usageType: "limited", usageLimit: 3 },
  },
  {
    id: "benefit-3",
    partner: "North Studio",
    partnerType: "Partenaire",
    title: "Pack photos et contenu de marque",
    category: "Tech",
    description: "Offre de production pour obtenir un pack de portraits et contenus courts destinés à la visibilité digitale personnelle.",
    value: "-30 % sur le pack",
    conditions: "Disponibilité de 2 créneaux sur la période du mois suivant la demande.",
    validity: "Valable jusqu’au 31 décembre 2026",
    activation: "Prendre rendez-vous via le formulaire partenaire",
    status: "Bientôt",
    usage: { usageType: "limited", usageLimit: 2 },
  },
  {
    id: "benefit-4",
    partner: "Maison Éclipse",
    partnerType: "Partenaire",
    title: "Accès à un atelier lifestyle premium",
    category: "Lifestyle",
    description: "Une session collective autour du branding personnel, du posture et de la présence devant la caméra.",
    value: "Places limitées",
    conditions: "Ouvert aux membres actifs avec une participation en ligne confirmée.",
    validity: "Événement le 22 septembre",
    activation: "Confirmation par e-mail KLIQUE",
    status: "Actif",
    usage: { usageType: "unlimited" },
  },
  {
    id: "benefit-5",
    partner: "Nutrivibe",
    partnerType: "Partenaire",
    title: "Pack nutrition performance",
    category: "Nutrition",
    description: "Un kit de conseils nutritionnels et d’outils pratiques pour mieux préparer les jours de compétition ou de forte charge.",
    value: "-15 % sur le kit",
    conditions: "Commande à partir de 2 produits minimum.",
    validity: "Valable jusqu’au 10 octobre 2026",
    activation: "Code NUTRI-KLIQUE",
    status: "Bientôt",
    usage: { usageType: "unlimited" },
  },
  {
    id: "benefit-6",
    partner: "Kaleido Academy",
    partnerType: "Partenaire",
    title: "Formation accélérée à la présence digitale",
    category: "Formation",
    description: "Un module court pour apprendre à structurer son image, ses messages et ses contenus de manière cohérente.",
    value: "-25 % sur la formation",
    conditions: "Accès réservé aux membres disposant d’un compte KLIQUE actif.",
    validity: "Expirée le 5 août 2026",
    activation: "Activation sur demande",
    status: "Expiré",
    usage: { usageType: "unlimited" },
  },
];

const createEmptyResourceForm = (): ResourceFormState => ({
  title: "",
  category: "Autre",
  author: "KLIQUE",
  type: "Article",
  description: "",
  content: "",
  status: "Publié",
  date: new Date().toISOString().slice(0, 10),
});

const demoPublications: PublicationItem[] = [
  {
    id: "pub-1",
    author: "Mila Benjak",
    role: "Athlète",
    specialty: "Football",
    date: "Aujourd’hui • 12:30",
    scope: "Athlètes",
    type: "publication",
    content: "Session de préparation en studio avec une approche plus naturelle, pour travailler la présence et le regard avant la prochaine rencontre.",
    reactions: 24,
    comments: [
      { id: "c1", author: "Léa", text: "Très belle idée de mise en scène." },
      { id: "c2", author: "Noah", text: "Le ton est vraiment plus naturel." },
    ],
  },
  {
    id: "pub-2",
    author: "Léa Martin",
    role: "Expert & partenaire",
    specialty: "Branding sportif",
    date: "Hier • 18:10",
    scope: "Experts & partenaires",
    type: "conseil",
    content: "Petit rappel utile pour les profils sportifs : privilégier des plans plus simples et des messages clairs lorsque le contenu est pensé pour les réseaux.",
    reactions: 19,
    comments: [
      { id: "c3", author: "Mina", text: "À garder pour les prochaines publications." },
    ],
  },
  {
    id: "pub-3",
    author: "KLIQUE OS",
    role: "KLIQUE",
    specialty: "Production",
    date: "Mercredi • 09:40",
    scope: "KLIQUE",
    type: "annonce",
    content: "Nouvelle version de la Communauté KLIQUE en cours de structuration avec des briques pratiques pour les publications, les opportunités et les ressources partenaires.",
    reactions: 31,
    comments: [
      { id: "c4", author: "Sami", text: "Très clair et très utile." },
      { id: "c5", author: "Iris", text: "J’aime déjà la direction prise." },
    ],
  },
  {
    id: "pub-4",
    author: "Nicolas Renaud",
    role: "Athlète",
    specialty: "Basketball",
    date: "Mardi • 20:05",
    scope: "Athlètes",
    type: "résultat",
    content: "Résultat de la dernière séance : meilleure cohérence du regard, plus de naturel dans le mouvement et une image plus proche de l’identité recherchée.",
    reactions: 15,
    comments: [
      { id: "c6", author: "Jules", text: "Le résultat est vraiment visible." },
    ],
  },
];

const formatTypeLabel = (type: PublicationItem["type"]): string => {
  switch (type) {
    case "publication":
      return "Publication";
    case "présentation":
      return "Présentation";
    case "résultat":
      return "Résultat";
    case "question":
      return "Question";
    case "conseil":
      return "Conseil";
    default:
      return "Annonce";
  }
};

const getInitials = (value: string): string =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("");

const formatFeedDate = (value: string): string => {
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "À l’instant";
    return new Intl.DateTimeFormat("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  } catch {
    return "À l’instant";
  }
};

const mapApiOpportunityToItem = (record: {
  id: string;
  title?: string | null;
  type?: string | null;
  organization?: string | null;
  targetAudience?: string | null;
  sportOrDomain?: string | null;
  location?: string | null;
  date?: string | null;
  deadline?: string | null;
  description?: string | null;
  requirements?: string | null;
  practicalInfo?: string | null;
  status?: string | null;
}): OpportunityItem => ({
  id: record.id,
  title: record.title ?? "",
  category: (record.type as OpportunityCategory) ?? "Autre",
  organisation: record.organization ?? "",
  audience: record.targetAudience ?? "",
  domain: record.sportOrDomain ?? "",
  location: record.location ?? "",
  date: record.date ?? "",
  deadline: record.deadline ?? "",
  description: record.description ?? "",
  fullDescription: record.description ?? "",
  prerequisites: record.requirements ?? "",
  practicalInfo: record.practicalInfo ?? "",
  status: (record.status as OpportunityStatus) ?? "Brouillon",
});

const mapApiPublicationToFeedItem = (record: {
  id: string;
  authorDisplayName?: string;
  authorRole?: string;
  authorSpecialty?: string | null;
  authorProfilePath?: string | null;
  type?: string;
  title?: string | null;
  content?: string;
  createdAt?: string;
  reactions?: number;
  reactedByCurrentUser?: boolean;
  comments?: Array<{ id: string; authorName?: string; text?: string; authorProfilePath?: string | null }>;
}): PublicationItem => {
  const role = record.authorRole ?? "athlete";
  const scope: FeedFilter = role === "partner_expert" ? "Experts & partenaires" : role === "athlete" ? "Athlètes" : "KLIQUE";
  const specialty = record.authorSpecialty?.trim() || (role === "partner_expert" ? "Partenariat" : role === "admin" ? "Communauté" : "Communauté");

  return {
    id: record.id,
    author: record.authorDisplayName ?? "KLIQUE OS",
    role: role === "admin" ? "Admin" : role === "partner_expert" ? "Partenaire" : role === "media" ? "Média" : "Athlète",
    specialty,
    date: formatFeedDate(record.createdAt ?? new Date().toISOString()),
    scope,
    type: (record.type as PublicationItem["type"]) ?? "publication",
    content: record.title ? `${record.title} — ${record.content ?? ""}`.trim() : record.content ?? "",
    reactions: Number(record.reactions ?? 0),
    comments: (record.comments ?? []).map((comment) => ({
      id: comment.id,
      author: comment.authorName ?? "KLIQUE",
      text: comment.text ?? "",
    })),
    reactedByCurrentUser: Boolean(record.reactedByCurrentUser),
    authorProfilePath: record.authorProfilePath ?? null,
  };
};

export default function HubPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isAthleteCommunity = pathname.startsWith("/athlete/");
  const [activeTab, setActiveTab] = useState<HubTab>("Fil");
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("Tout");
  const [activeOpportunityCategory, setActiveOpportunityCategory] = useState<OpportunityCategoryFilter>("Tout");
  const [activeBenefitCategory, setActiveBenefitCategory] = useState<BenefitCategoryFilter>("Tout");
  const [activeResourceCategory, setActiveResourceCategory] = useState<ResourceCategory | "Tout">("Tout");
  const [activeOpportunityStatus, setActiveOpportunityStatus] = useState<OpportunityStatusFilter>("Ouvertes");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [benefits, setBenefits] = useState<BenefitItem[]>([]);
  const [interestedOpportunities, setInterestedOpportunities] = useState<Record<string, boolean>>({});
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(true);
  const [opportunitiesError, setOpportunitiesError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotRequests, setSlotRequests] = useState<SlotRequestItem[]>([]);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotForm, setSlotForm] = useState({ startsAt: "", endsAt: "", capacity: "1" });
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [composerTitle, setComposerTitle] = useState("");
  const [composerContent, setComposerContent] = useState("");
  const [feedItems, setFeedItems] = useState<PublicationItem[]>(demoPublications);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [canCreateOpportunity, setCanCreateOpportunity] = useState(false);
  const [isOpportunityComposerOpen, setIsOpportunityComposerOpen] = useState(false);
  const [opportunityForm, setOpportunityForm] = useState<OpportunityFormState>(createEmptyOpportunityForm);
  const [opportunityFormError, setOpportunityFormError] = useState<string | null>(null);
  const [editingOpportunityId, setEditingOpportunityId] = useState<string | null>(null);
  const [opportunityActionError, setOpportunityActionError] = useState<string | null>(null);
  const [isCompactBenefitsLayout, setIsCompactBenefitsLayout] = useState(false);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [isResourceComposerOpen, setIsResourceComposerOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState<ResourceFormState>(createEmptyResourceForm());
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const visiblePublications = useMemo(() => {
    if (activeFilter === "Tout") return feedItems;
    return feedItems.filter((publication) => publication.scope === activeFilter);
  }, [activeFilter, feedItems]);

  const visibleOpportunities = useMemo(() => {
    return opportunities.filter((opportunity) => {
      const matchesCategory = activeOpportunityCategory === "Tout" || opportunity.category === activeOpportunityCategory;
      const matchesStatus =
        (activeOpportunityStatus === "Ouvertes" && opportunity.status === "Ouverte") ||
        (activeOpportunityStatus === "Bientôt" && opportunity.status === "Bientôt") ||
        (activeOpportunityStatus === "Fermées" && opportunity.status === "Fermée") ||
        (activeOpportunityStatus === "Brouillons" && opportunity.status === "Brouillon");
      return matchesCategory && matchesStatus;
    });
  }, [activeOpportunityCategory, activeOpportunityStatus, opportunities]);

  const visibleBenefits = useMemo(() => {
    return benefits.filter((benefit) => activeBenefitCategory === "Tout" || benefit.category === activeBenefitCategory);
  }, [activeBenefitCategory, benefits]);

  const visibleResources = useMemo(() => {
    return resources.filter((resource) => {
      const isVisible = canCreateOpportunity ? true : resource.status === "Publié";
      return isVisible && (activeResourceCategory === "Tout" || resource.category === activeResourceCategory);
    });
  }, [activeResourceCategory, canCreateOpportunity, resources]);

  const selectedResource = useMemo(() => resources.find((resource) => resource.id === selectedResourceId) ?? null, [resources, selectedResourceId]);

  const selectedOpportunity = useMemo(() => opportunities.find((opportunity) => opportunity.id === selectedOpportunityId) ?? null, [opportunities, selectedOpportunityId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateLayout = () => setIsCompactBenefitsLayout(window.innerWidth < 980);
    updateLayout();
    window.addEventListener("resize", updateLayout);

    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  useEffect(() => {
    const loadAccess = async () => {
      try {
        const response = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          userAccess?: { role?: string | null } | null;
          permissions?: { isAdmin?: boolean | null; isActive?: boolean | null } | null;
        };
        const isAdmin = Boolean(payload?.permissions?.isAdmin && payload?.permissions?.isActive);
        setCanCreateOpportunity(isAdmin);
      } catch {
        setCanCreateOpportunity(false);
      }
    };

    void loadAccess();
  }, []);

  useEffect(() => {
    const loadFeed = async () => {
      try {
        const response = await fetch("/api/hub-community", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load community feed");
        const payload = (await response.json()) as { publications?: Array<Record<string, unknown>> };
        const publications = Array.isArray(payload.publications) ? payload.publications : [];
        if (publications.length > 0) {
          setFeedItems(publications.map((publication) => mapApiPublicationToFeedItem(publication as Parameters<typeof mapApiPublicationToFeedItem>[0])));
        } else {
          setFeedItems(isAthleteCommunity ? [] : demoPublications);
        }
      } catch {
        setFeedItems(isAthleteCommunity ? [] : demoPublications);
      }
    };

    const loadOpportunities = async () => {
      setOpportunitiesLoading(true);
      setOpportunitiesError(null);
      try {
        const response = await fetch("/api/hub-opportunities", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load opportunities");
        const payload = (await response.json()) as { opportunities?: Array<Record<string, unknown>>; currentUserInterestIds?: string[] };
        const opportunities = Array.isArray(payload.opportunities) ? payload.opportunities : [];
        setOpportunities(opportunities.map((opportunity) => mapApiOpportunityToItem(opportunity as Parameters<typeof mapApiOpportunityToItem>[0])));
        setInterestedOpportunities(
          (Array.isArray(payload.currentUserInterestIds) ? payload.currentUserInterestIds : []).reduce<Record<string, boolean>>(
            (accumulator, opportunityId) => {
              accumulator[opportunityId] = true;
              return accumulator;
            },
            {},
          ),
        );
      } catch {
        setOpportunities([]);
        setInterestedOpportunities({});
        setOpportunitiesError("Les opportunités n’ont pas pu être chargées.");
      } finally {
        setOpportunitiesLoading(false);
      }
    };

    const loadPartnerBenefits = async () => {
      try {
        const response = await fetch("/api/partners", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load partners");
        const payload = (await response.json()) as { partners?: Partner[] };
        const partners = Array.isArray(payload.partners) ? payload.partners : [];
        setBenefits(buildPartnerBenefits(partners));
      } catch {
        setBenefits([]);
      }
    };

    const loadResources = async () => {
      try {
        const response = await fetch("/api/hub-resources", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load resources");
        const payload = (await response.json()) as { resources?: Array<Record<string, unknown>> };
        const loadedResources = Array.isArray(payload.resources) ? payload.resources : [];
        const mappedResources: ResourceItem[] = loadedResources.map((resource) => ({
          id: String(resource.id ?? ""),
          title: String(resource.title ?? ""),
          category: String(resource.category ?? "Autre") as ResourceCategory,
          author: String(resource.author ?? "KLIQUE"),
          description: String(resource.description ?? ""),
          contentType: String(resource.type ?? "Article") as ResourceContentType,
          content: String(resource.content ?? ""),
          date: resource.publishedAt ? String(resource.publishedAt) : String(resource.createdAt ?? ""),
          status: normalizeResourceStatus(String(resource.status ?? "")),
          submittedBy: "KLIQUE",
        }));
        setResources(mappedResources);
      } catch {
        setResources([]);
      }
    };

    void loadFeed();
    void loadOpportunities();
    void loadPartnerBenefits();
    void loadResources();
  }, [isAthleteCommunity]);

  const toggleComments = (publicationId: string) => {
    setExpandedComments((current) => ({
      ...current,
      [publicationId]: !current[publicationId],
    }));
  };

  const handleToggleInterest = async (opportunityId: string) => {
    const currentlyInterested = Boolean(interestedOpportunities[opportunityId]);
    setInterestedOpportunities((current) => ({
      ...current,
      [opportunityId]: !currentlyInterested,
    }));

    try {
      const response = await fetch("/api/hub-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-interest", opportunityId }),
      });

      if (!response.ok) {
        setInterestedOpportunities((current) => ({
          ...current,
          [opportunityId]: currentlyInterested,
        }));
      }
    } catch {
      setInterestedOpportunities((current) => ({
        ...current,
        [opportunityId]: currentlyInterested,
      }));
    }
  };

  const isShootingDetail = Boolean(canCreateOpportunity && selectedOpportunity && selectedOpportunity.category === "Shooting");

  const loadSlots = useCallback(async (opportunityId: string) => {
    setSlotsLoading(true);
    setSlotsError(null);

    try {
      const [slotsResponse, athletesResponse] = await Promise.all([
        fetch(`/api/hub-opportunity-slots?opportunityId=${encodeURIComponent(opportunityId)}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/athletes", { credentials: "include", cache: "no-store" }),
      ]);

      if (!slotsResponse.ok) throw new Error("Unable to load slots");

      const payload = (await slotsResponse.json()) as { slots?: SlotItem[]; requests?: SlotRequestItem[] };
      setSlots(Array.isArray(payload.slots) ? payload.slots : []);
      setSlotRequests(Array.isArray(payload.requests) ? payload.requests : []);

      if (athletesResponse.ok) {
        const athletesPayload = (await athletesResponse.json()) as { athletes?: { key?: string; name?: string }[] };
        setAthleteNames(
          (athletesPayload.athletes ?? []).reduce<Record<string, string>>((accumulator, athlete) => {
            if (athlete.key && athlete.name) accumulator[athlete.key] = athlete.name;
            return accumulator;
          }, {}),
        );
      }
    } catch {
      setSlots([]);
      setSlotRequests([]);
      setSlotsError("Les créneaux n’ont pas pu être chargés.");
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isShootingDetail || !selectedOpportunity) {
      setSlots([]);
      setSlotRequests([]);
      setSlotsError(null);
      return;
    }

    void loadSlots(selectedOpportunity.id);
  }, [isShootingDetail, loadSlots, selectedOpportunity]);

  const handleAddSlot = async () => {
    if (!selectedOpportunity) return;

    const capacity = Number(slotForm.capacity);
    if (!slotForm.startsAt || !slotForm.endsAt) {
      setSlotsError("Le début et la fin du créneau sont obligatoires.");
      return;
    }
    if (new Date(slotForm.endsAt).getTime() <= new Date(slotForm.startsAt).getTime()) {
      setSlotsError("La fin doit être postérieure au début.");
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
      setSlotsError("La capacité doit être comprise entre 1 et 20.");
      return;
    }

    setSlotsError(null);

    try {
      const response = await fetch("/api/hub-opportunity-slots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: selectedOpportunity.id,
          startsAt: new Date(slotForm.startsAt).toISOString(),
          endsAt: new Date(slotForm.endsAt).toISOString(),
          capacity,
        }),
      });

      if (!response.ok) throw new Error("Unable to create slot");

      setSlotForm({ startsAt: "", endsAt: "", capacity: "1" });
      await loadSlots(selectedOpportunity.id);
    } catch {
      setSlotsError("Le créneau n’a pas pu être créé.");
    }
  };

  const handleSlotStatusChange = async (slotId: string, status: SlotStatus) => {
    if (!selectedOpportunity) return;
    setSlotsError(null);

    try {
      const response = await fetch("/api/hub-opportunity-slots", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, status }),
      });

      if (!response.ok) throw new Error("Unable to update slot");
      await loadSlots(selectedOpportunity.id);
    } catch {
      setSlotsError("Le statut du créneau n’a pas pu être modifié.");
    }
  };

  const handleSlotRequestStatusChange = async (requestId: string, status: Exclude<SlotRequestStatus, "requested">) => {
    if (!selectedOpportunity) return;
    setSlotsError(null);

    try {
      const response = await fetch("/api/hub-opportunity-slots", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      });

      if (response.status === 409) {
        setSlotsError("Le créneau est complet : la demande ne peut pas être confirmée.");
        return;
      }

      if (!response.ok) throw new Error("Unable to update request");
      await loadSlots(selectedOpportunity.id);
    } catch {
      setSlotsError("La demande n’a pas pu être mise à jour.");
    }
  };

  const handleCreateOpportunity = () => {
    if (!canCreateOpportunity) return;
    setOpportunityFormError(null);
    setEditingOpportunityId(null);
    setOpportunityForm(createEmptyOpportunityForm());
    setIsOpportunityComposerOpen(true);
    setSelectedOpportunityId(null);
  };

  const handleEditOpportunity = (opportunity: OpportunityItem) => {
    if (!canCreateOpportunity) return;
    setOpportunityFormError(null);
    setOpportunityActionError(null);
    setEditingOpportunityId(opportunity.id);
    setOpportunityForm({
      title: opportunity.title,
      category: opportunity.category,
      organisation: opportunity.organisation,
      audience: opportunity.audience,
      domain: opportunity.domain,
      location: opportunity.location,
      date: opportunity.date,
      deadline: opportunity.deadline,
      fullDescription: opportunity.fullDescription,
      prerequisites: opportunity.prerequisites,
      practicalInfo: opportunity.practicalInfo,
      status: opportunity.status,
    });
    setIsOpportunityComposerOpen(true);
  };

  const handlePublishDraftOpportunity = async (opportunity: OpportunityItem) => {
    if (!canCreateOpportunity) return;
    if (typeof window !== "undefined" && !window.confirm("Publier cette opportunité ? Elle deviendra visible par les membres KLIQUE.")) {
      return;
    }

    setOpportunityActionError(null);

    try {
      const response = await fetch("/api/hub-opportunities", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          title: opportunity.title,
          type: opportunity.category,
          organization: opportunity.organisation,
          targetAudience: opportunity.audience,
          sportOrDomain: opportunity.domain,
          location: opportunity.location,
          date: opportunity.date,
          deadline: opportunity.deadline,
          description: opportunity.fullDescription,
          requirements: opportunity.prerequisites,
          practicalInfo: opportunity.practicalInfo,
          status: "Ouverte",
        }),
      });

      if (!response.ok) throw new Error("Failed to publish opportunity");

      const payload = (await response.json()) as { opportunity?: Record<string, unknown> };
      if (!payload.opportunity) throw new Error("Missing opportunity payload");

      const updated = mapApiOpportunityToItem(payload.opportunity as Parameters<typeof mapApiOpportunityToItem>[0]);
      setOpportunities((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setActiveOpportunityStatus("Ouvertes");
    } catch {
      setOpportunityActionError("L’opportunité n’a pas pu être publiée.");
    }
  };

  const handleDeleteOpportunity = async (opportunity: OpportunityItem) => {
    if (!canCreateOpportunity) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Supprimer définitivement « ${opportunity.title} » ? Les créneaux, demandes et intérêts associés seront également supprimés.`)
    ) {
      return;
    }

    setOpportunityActionError(null);

    try {
      const response = await fetch("/api/hub-opportunities", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.id }),
      });

      if (!response.ok) throw new Error("Failed to delete opportunity");

      setOpportunities((current) => current.filter((item) => item.id !== opportunity.id));
      setSelectedOpportunityId(null);
    } catch {
      setOpportunityActionError("L’opportunité n’a pas pu être supprimée.");
    }
  };

  const handleCloseOpportunityComposer = () => {
    setIsOpportunityComposerOpen(false);
    setOpportunityFormError(null);
    setEditingOpportunityId(null);
    setOpportunityForm(createEmptyOpportunityForm());
  };

  const handleSubmitOpportunity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = opportunityForm.title.trim();
    const trimmedFullDescription = opportunityForm.fullDescription.trim();

    if (!trimmedTitle) {
      setOpportunityFormError("Le titre est obligatoire.");
      return;
    }
    if (!opportunityForm.category) {
      setOpportunityFormError("Le type est obligatoire.");
      return;
    }
    if (!trimmedFullDescription) {
      setOpportunityFormError("La description est obligatoire.");
      return;
    }

    setOpportunityFormError(null);
    const nextStatusFilter = opportunityForm.status === "Brouillon" ? "Brouillons" : opportunityForm.status === "Bientôt" ? "Bientôt" : "Ouvertes";
    const isEditing = Boolean(editingOpportunityId);

    try {
      const response = await fetch("/api/hub-opportunities", {
        method: isEditing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEditing ? { opportunityId: editingOpportunityId } : {}),
          title: trimmedTitle,
          type: opportunityForm.category,
          organization: opportunityForm.organisation.trim() || "KLIQUE OS",
          targetAudience: opportunityForm.audience.trim() || "Audience KLIQUE",
          sportOrDomain: opportunityForm.domain.trim() || "À définir",
          location: opportunityForm.location.trim() || "À définir",
          date: opportunityForm.date.trim() || "À définir",
          deadline: opportunityForm.deadline.trim() || "À définir",
          description: trimmedFullDescription,
          requirements: opportunityForm.prerequisites.trim() || "Aucun prérequis spécifique n’est demandé pour cette opportunité.",
          practicalInfo: opportunityForm.practicalInfo.trim() || "Les informations pratiques seront envoyées à la publication.",
          status: opportunityForm.status,
        }),
      });

      if (!response.ok) throw new Error("Failed to save opportunity");

      const payload = (await response.json()) as { opportunity?: Record<string, unknown> };
      if (!payload.opportunity) throw new Error("Missing opportunity payload");

      const createdOpportunity = mapApiOpportunityToItem(payload.opportunity as Parameters<typeof mapApiOpportunityToItem>[0]);
      setOpportunities((current) =>
        isEditing
          ? current.map((item) => (item.id === createdOpportunity.id ? createdOpportunity : item))
          : [createdOpportunity, ...current.filter((item) => item.id !== createdOpportunity.id)],
      );
      setOpportunitiesError(null);
      setOpportunityActionError(null);
      setActiveOpportunityStatus(nextStatusFilter);
      setIsOpportunityComposerOpen(false);
      setEditingOpportunityId(null);
      setOpportunityForm(createEmptyOpportunityForm());
      setSelectedOpportunityId(createdOpportunity.id);
    } catch {
      setOpportunityFormError("L’opportunité n’a pas pu être enregistrée. Veuillez réessayer.");
    }
  };

  const handleSaveResource = async () => {
    const trimmedTitle = resourceForm.title.trim();
    const trimmedDescription = resourceForm.description.trim();
    const trimmedContent = resourceForm.content.trim();
    if (!trimmedTitle || !trimmedDescription || !trimmedContent) return;

    try {
      const response = await fetch("/api/hub-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: editingResourceId ?? undefined,
          title: trimmedTitle,
          category: resourceForm.category,
          author: resourceForm.author.trim() || "KLIQUE",
          type: resourceForm.type,
          description: trimmedDescription,
          content: trimmedContent,
          status: resourceForm.status === "Publié" ? "published" : "draft",
          date: resourceForm.date || new Date().toISOString().slice(0, 10),
        }),
      });

      if (!response.ok) throw new Error("Failed to save resource");
      const payload = (await response.json()) as { resource?: Record<string, unknown> };
      if (payload.resource) {
        const nextResource: ResourceItem = {
          id: String(payload.resource.id ?? ""),
          title: String(payload.resource.title ?? trimmedTitle),
          category: String(payload.resource.category ?? resourceForm.category) as ResourceCategory,
          author: String((payload.resource.author ?? resourceForm.author.trim()) || "KLIQUE"),
          description: String(payload.resource.description ?? trimmedDescription),
          contentType: String(payload.resource.type ?? resourceForm.type) as ResourceContentType,
          content: String(payload.resource.content ?? trimmedContent),
          date: String((payload.resource.publishedAt ?? payload.resource.createdAt ?? resourceForm.date) || new Date().toISOString().slice(0, 10)),
          status: normalizeResourceStatus(String(payload.resource.status ?? resourceForm.status)),
          submittedBy: "KLIQUE",
        };

        setResources((current) => {
          if (editingResourceId) {
            return current.map((resource) => (resource.id === editingResourceId ? nextResource : resource));
          }
          return [nextResource, ...current];
        });
      }
    } catch {
      // Keep the current UI stable if the API call fails.
    } finally {
      setIsResourceComposerOpen(false);
      setEditingResourceId(null);
      setResourceForm(createEmptyResourceForm());
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    try {
      const response = await fetch("/api/hub-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", resourceId }),
      });
      if (!response.ok) throw new Error("Failed to delete resource");
    } catch {
      // Keep the current UI stable if the API call fails.
    }

    setResources((current) => current.filter((resource) => resource.id !== resourceId));
    if (selectedResourceId === resourceId) {
      setSelectedResourceId(null);
    }
  };

  const handleEditResource = (resource: ResourceItem) => {
    setEditingResourceId(resource.id);
    setResourceForm({
      title: resource.title,
      category: resource.category,
      author: resource.author,
      type: resource.contentType,
      description: resource.description,
      content: resource.content,
      status: resource.status,
      date: resource.date,
    });
    setIsResourceComposerOpen(true);
  };

  const handleOpenResource = (resource: ResourceItem) => {
    if (resource.contentType === "Lien" || /^https?:\/\//i.test(resource.content.trim())) {
      window.open(resource.content, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(`/hub/resources/${resource.id}`);
  };

  const handlePublish = async () => {
    const trimmedContent = composerContent.trim();
    if (!trimmedContent) return;

    try {
      const response = await fetch("/api/hub-community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: composerTitle.trim(),
          content: trimmedContent,
          type: "publication",
        }),
      });

      if (!response.ok) throw new Error("Failed to publish");

      const payload = (await response.json()) as { publication?: Record<string, unknown> };
      if (payload.publication) {
        setFeedItems((current) => [mapApiPublicationToFeedItem(payload.publication as Parameters<typeof mapApiPublicationToFeedItem>[0]), ...current]);
      }
    } catch {
      const fallbackPublication: PublicationItem = {
        id: `local-${Date.now()}`,
        author: "KLIQUE OS",
        role: "Admin",
        specialty: "Communauté",
        date: "À l’instant",
        scope: "KLIQUE",
        type: "publication",
        content: composerTitle.trim() ? `${composerTitle.trim()} — ${trimmedContent}` : trimmedContent,
        reactions: 0,
        comments: [],
      };
      setFeedItems((current) => [fallbackPublication, ...current]);
    } finally {
      setComposerTitle("");
      setComposerContent("");
    }
  };

  const toggleReaction = async (publicationId: string) => {
    try {
      const response = await fetch("/api/hub-community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "react", publicationId }),
      });

      if (!response.ok) throw new Error("Failed to toggle reaction");
      const payload = (await response.json()) as { publication?: Record<string, unknown> };
      if (payload.publication) {
        setFeedItems((current) => current.map((publication) => (publication.id === publicationId ? mapApiPublicationToFeedItem(payload.publication as Parameters<typeof mapApiPublicationToFeedItem>[0]) : publication)));
      }
    } catch {
      setFeedItems((current) =>
        current.map((publication) => {
          if (publication.id !== publicationId) return publication;
          const reacted = Boolean(publication.reactedByCurrentUser);
          return {
            ...publication,
            reactedByCurrentUser: !reacted,
            reactions: reacted ? publication.reactions - 1 : publication.reactions + 1,
          };
        })
      );
    }
  };

  const handleCommentSubmit = async (publicationId: string) => {
    const draft = commentDrafts[publicationId]?.trim();
    if (!draft) return;

    try {
      const response = await fetch("/api/hub-community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", publicationId, text: draft }),
      });

      if (!response.ok) throw new Error("Failed to send comment");
      const payload = (await response.json()) as { publication?: Record<string, unknown> };
      if (payload.publication) {
        setFeedItems((current) => current.map((publication) => (publication.id === publicationId ? mapApiPublicationToFeedItem(payload.publication as Parameters<typeof mapApiPublicationToFeedItem>[0]) : publication)));
      }
    } catch {
      setFeedItems((current) =>
        current.map((publication) => {
          if (publication.id !== publicationId) return publication;
          return {
            ...publication,
            comments: [...publication.comments, { id: `comment-${Date.now()}`, author: "Vous", text: draft }],
          };
        })
      );
    } finally {
      setCommentDrafts((current) => ({ ...current, [publicationId]: "" }));
    }
  };

  return (
    <section style={{ display: "grid", gap: "1.25rem", padding: "1.25rem", maxWidth: "1200px", margin: "0 auto" }}>
      <Card style={{ padding: "1.25rem", display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>COMMUNAUTÉ</p>
            <h1 style={{ margin: "0.25rem 0 0", fontSize: "1.8rem", fontWeight: 800, color: "#111827" }}>La Communauté KLIQUE</h1>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
          {tabs.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  border: isActive ? "1px solid #f59e0b" : "1px solid #e5e7eb",
                  background: isActive ? "#fff7ed" : "white",
                  color: isActive ? "#92400e" : "#374151",
                  borderRadius: "999px",
                  padding: "0.6rem 0.9rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </Card>

      {activeTab === "Fil" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          {canCreateOpportunity ? (
            <Card
              style={{
                padding: "1.1rem",
                display: "grid",
                gap: "0.95rem",
                background: "linear-gradient(135deg, #fffdf8 0%, #fff7ed 100%)",
                border: "1px solid #f5d6b0",
                boxShadow: "0 18px 40px rgba(17, 24, 39, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                  <Avatar style={{ width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                    KC
                  </Avatar>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.08rem", color: "#111827" }}>Créer une publication</h2>
                    <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>Partagez une mise à jour, un conseil ou un résultat avec la communauté KLIQUE.</p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handlePublish}
                  disabled={!composerContent.trim()}
                  style={{
                    padding: "0.72rem 1rem",
                    borderRadius: "999px",
                    background: "linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)",
                    color: "#fff",
                    border: "1px solid #f59e0b",
                    boxShadow: "0 10px 20px rgba(245, 158, 11, 0.24)",
                    fontWeight: 800,
                    opacity: composerContent.trim() ? 1 : 0.6,
                    cursor: composerContent.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Publier
                </Button>
              </div>

              <Input
                placeholder="Titre ou accroche"
                value={composerTitle}
                onChange={(event) => setComposerTitle(event.target.value)}
                style={{ width: "100%", borderRadius: "14px" }}
              />
              <Textarea
                placeholder="Écrivez votre publication ici…"
                value={composerContent}
                onChange={(event) => setComposerContent(event.target.value)}
                style={{ minHeight: "102px", width: "100%", borderRadius: "14px" }}
              />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{
                    border: "1px solid #f5d6b0",
                    background: "#fff7ed",
                    color: "#92400e",
                    borderRadius: "999px",
                    padding: "0.6rem 0.9rem",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Ajouter une image
                </button>
              </div>
            </Card>
          ) : (
            <Card style={{ padding: "1rem", display: "grid", gap: "0.75rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.08rem", color: "#111827" }}>Fil communautaire</h2>
                  <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>Consultez le fil, réagissez aux publications et participez aux échanges sans publier de contenu.</p>
                </div>
                <Badge style={{ background: "#fff7ed", color: "#b45309", padding: "0.35rem 0.7rem" }}>Lecture seule</Badge>
              </div>
            </Card>
          )}

          <Card style={{ padding: "1rem", display: "grid", gap: "0.95rem", border: "1px solid #f1e4d3", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.08rem", color: "#111827" }}>Fil communautaire</h2>
                <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>Un espace vivant, premium et chaleureux pour la communauté KLIQUE.</p>
              </div>
              <div style={{ minWidth: "240px" }}>
                <div style={{ position: "relative" }}>
                  <Select
                    value={activeFilter}
                    onChange={(event) => setActiveFilter(event.target.value as FeedFilter)}
                    style={{
                      width: "100%",
                      borderRadius: "999px",
                      padding: "0.72rem 2.6rem 0.72rem 0.95rem",
                      background: "#fff",
                      border: "1px solid #f0e2d0",
                      color: "#374151",
                      fontWeight: 700,
                      appearance: "none",
                      boxShadow: "0 8px 18px rgba(17, 24, 39, 0.04)",
                    }}
                  >
                    {filters.map((filter) => (
                      <option key={filter} value={filter}>
                        {filter}
                      </option>
                    ))}
                  </Select>
                  <span style={{ position: "absolute", right: "0.95rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#b45309" }}>▾</span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.9rem" }}>
              {visiblePublications.length === 0 ? (
                <EmptyState style={{ border: "1px dashed #d1d5db", padding: "1rem", textAlign: "center" }}>
                  <h3 style={{ margin: "0 0 0.25rem", color: "#111827" }}>Aucune publication pour le moment.</h3>
                  <p style={{ margin: 0, color: "#6b7280" }}>Les actualités et échanges de la Communauté KLIQUE apparaîtront ici.</p>
                </EmptyState>
              ) : null}

              {visiblePublications.map((publication) => {
                const authorCard = (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                    <Avatar
                      style={{
                        width: "48px",
                        height: "48px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)",
                        color: "#fff",
                      }}
                    >
                      {getInitials(publication.author)}
                    </Avatar>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
                        <strong style={{ color: "#111827" }}>{publication.author}</strong>
                        <Badge style={{ background: "#fef3c7", color: "#92400e", padding: "0.25rem 0.6rem" }}>{publication.role}</Badge>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: "0.95rem", marginTop: "0.2rem" }}>
                        {publication.specialty} • {publication.date}
                      </div>
                    </div>
                  </div>
                );

                return (
                  <Card key={publication.id} style={{ padding: "1rem", background: "#ffffff", display: "grid", gap: "0.8rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
                      {publication.authorProfilePath ? (
                        <Link href={publication.authorProfilePath} style={{ textDecoration: "none" }}>
                          {authorCard}
                        </Link>
                      ) : (
                        authorCard
                      )}
                      <Badge style={{ background: "#f3f4f6", color: "#374151", padding: "0.35rem 0.65rem" }}>{formatTypeLabel(publication.type)}</Badge>
                    </div>

                    {publication.imageUrl ? (
                      <div style={{ borderRadius: "16px", overflow: "hidden", border: "1px solid #f0e2d0", minHeight: "160px" }}>
                        <img src={publication.imageUrl} alt="Publication communautaire" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                    ) : null}

                    <p style={{ margin: 0, color: "#374151", lineHeight: 1.7, fontSize: "1rem" }}>{publication.content}</p>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => toggleReaction(publication.id)}
                          style={{
                            border: publication.reactedByCurrentUser ? "1px solid #f59e0b" : "1px solid #e5e7eb",
                            background: publication.reactedByCurrentUser ? "#fff7ed" : "#f9fafb",
                            color: publication.reactedByCurrentUser ? "#92400e" : "#374151",
                            borderRadius: "999px",
                            padding: "0.5rem 0.8rem",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          👍 {publication.reactions}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleComments(publication.id)}
                          style={{ border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", borderRadius: "999px", padding: "0.5rem 0.8rem", cursor: "pointer", fontWeight: 700 }}
                        >
                          💬 {publication.comments.length}
                        </button>
                      </div>
                      <Badge style={{ background: "#fff7ed", color: "#b45309" }}>{publication.scope}</Badge>
                    </div>

                    {expandedComments[publication.id] ? (
                      <div style={{ borderTop: "1px solid #f3e7d5", paddingTop: "0.8rem", display: "grid", gap: "0.6rem" }}>
                        <div style={{ fontWeight: 700, color: "#111827" }}>Commentaires</div>
                        <div style={{ display: "grid", gap: "0.5rem" }}>
                          {publication.comments.map((comment) => (
                            <div key={comment.id} style={{ background: "#f9fafb", borderRadius: "12px", padding: "0.75rem", color: "#4b5563", lineHeight: 1.6 }}>
                              <strong style={{ color: "#111827" }}>{comment.author}</strong>
                              <div style={{ marginTop: "0.2rem" }}>{comment.text}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                          <Input
                            placeholder="Écrire un commentaire…"
                            value={commentDrafts[publication.id] ?? ""}
                            onChange={(event) =>
                              setCommentDrafts((current) => ({
                                ...current,
                                [publication.id]: event.target.value,
                              }))
                            }
                            style={{ flex: 1, minWidth: "220px", borderRadius: "999px" }}
                          />
                          <Button type="button" onClick={() => handleCommentSubmit(publication.id)} style={{ borderRadius: "999px", padding: "0.6rem 0.9rem" }}>
                            Envoyer
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </Card>
        </div>
      ) : activeTab === "Opportunités" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <Card style={{ padding: "1.15rem", display: "grid", gap: "0.9rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>OPPORTUNITÉS</p>
                <h2 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Opportunités KLIQUE</h2>
                <p style={{ margin: 0, color: "#6b7280", maxWidth: "720px", lineHeight: 1.6 }}>
                  Créez et pilotez les projets, shootings, événements et partenariats proposés à la communauté KLIQUE.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                {canCreateOpportunity ? (
                  <Button type="button" onClick={handleCreateOpportunity} style={{ borderRadius: "999px", padding: "0.7rem 1.05rem", background: "linear-gradient(135deg, #111827 0%, #374151 100%)", color: "#fff", border: "1px solid #111827", fontWeight: 700 }}>
                    Nouvelle opportunité
                  </Button>
                ) : (
                  <Badge style={{ background: "#fef3c7", color: "#92400e", padding: "0.35rem 0.7rem" }}>Lecture seule</Badge>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                {opportunityCategoryFilters.map((category) => {
                  const isActive = category === activeOpportunityCategory;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveOpportunityCategory(category)}
                      style={{
                        border: isActive ? "1px solid #f59e0b" : "1px solid #e5e7eb",
                        background: isActive ? "#fff7ed" : "white",
                        color: isActive ? "#92400e" : "#374151",
                        borderRadius: "999px",
                        padding: "0.35rem 0.7rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                {opportunityStatusFilters.map((status) => {
                  const isActive = status === activeOpportunityStatus;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setActiveOpportunityStatus(status)}
                      style={{
                        border: isActive ? "1px solid #111827" : "1px solid #e5e7eb",
                        background: isActive ? "#111827" : "white",
                        color: isActive ? "#ffffff" : "#374151",
                        borderRadius: "999px",
                        padding: "0.35rem 0.7rem",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {canCreateOpportunity && isOpportunityComposerOpen ? (
            <>
              <div
                aria-hidden
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(17, 24, 39, 0.55)",
                  backdropFilter: "blur(2px)",
                  WebkitBackdropFilter: "blur(2px)",
                  zIndex: 60,
                }}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Créer une opportunité"
                style={{
                  position: "fixed",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  padding: "1rem",
                  zIndex: 61,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    pointerEvents: "auto",
                    padding: "1.15rem",
                    display: "grid",
                    gap: "1rem",
                    width: "min(960px, 100%)",
                    maxHeight: "calc(100vh - 2rem)",
                    overflowY: "auto",
                    background: "#ffffff",
                    borderRadius: "20px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 30px 70px rgba(17, 24, 39, 0.35)",
                  }}
                >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.8rem", flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#111827" }}>{editingOpportunityId ? "Modifier l’opportunité" : "Nouvelle opportunité"}</h3>
                    <p style={{ margin: "0.2rem 0 0", color: "#6b7280" }}>Renseignez les informations proposées à la communauté KLIQUE.</p>
                  </div>
                  <Button type="button" onClick={handleCloseOpportunityComposer} style={{ borderRadius: "999px", padding: "0.6rem 0.9rem", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}>
                    Fermer
                  </Button>
                </div>

                <form onSubmit={handleSubmitOpportunity} style={{ display: "grid", gap: "1.1rem" }} noValidate>
                  <section style={{ display: "grid", gap: "0.7rem" }}>
                    <h4 style={{ margin: 0, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Informations principales</h4>
                    <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Titre *</span>
                        <Input value={opportunityForm.title} onChange={(event) => setOpportunityForm((current) => ({ ...current, title: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Type *</span>
                        <Select value={opportunityForm.category} onChange={(event) => setOpportunityForm((current) => ({ ...current, category: event.target.value as OpportunityCategory }))} style={{ width: "100%", borderRadius: "14px" }}>
                          {(["Collaboration", "Shooting", "Événement", "Média", "Casting", "Partenariat", "Sport", "Autre"] as OpportunityCategory[]).map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Organisation / auteur</span>
                        <Input value={opportunityForm.organisation} onChange={(event) => setOpportunityForm((current) => ({ ...current, organisation: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Statut</span>
                        <Select value={opportunityForm.status} onChange={(event) => setOpportunityForm((current) => ({ ...current, status: event.target.value as OpportunityStatus }))} style={{ width: "100%", borderRadius: "14px" }}>
                          {(["Brouillon", "Ouverte", "Bientôt", "Fermée"] as OpportunityStatus[]).map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>
                  </section>

                  <section style={{ display: "grid", gap: "0.7rem" }}>
                    <h4 style={{ margin: 0, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Dates et public</h4>
                    <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Date</span>
                        <Input value={opportunityForm.date} onChange={(event) => setOpportunityForm((current) => ({ ...current, date: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Deadline</span>
                        <Input value={opportunityForm.deadline} onChange={(event) => setOpportunityForm((current) => ({ ...current, deadline: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Lieu</span>
                        <Input value={opportunityForm.location} onChange={(event) => setOpportunityForm((current) => ({ ...current, location: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Public concerné</span>
                        <Input value={opportunityForm.audience} onChange={(event) => setOpportunityForm((current) => ({ ...current, audience: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>Sport / domaine</span>
                        <Input value={opportunityForm.domain} onChange={(event) => setOpportunityForm((current) => ({ ...current, domain: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                      </label>
                    </div>
                  </section>

                  <section style={{ display: "grid", gap: "0.7rem" }}>
                    <h4 style={{ margin: 0, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Détails</h4>
                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                      <span>Description *</span>
                      <Textarea value={opportunityForm.fullDescription} onChange={(event) => setOpportunityForm((current) => ({ ...current, fullDescription: event.target.value }))} style={{ minHeight: "110px", width: "100%", borderRadius: "14px" }} />
                    </label>
                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                      <span>Conditions / prérequis</span>
                      <Textarea value={opportunityForm.prerequisites} onChange={(event) => setOpportunityForm((current) => ({ ...current, prerequisites: event.target.value }))} style={{ minHeight: "82px", width: "100%", borderRadius: "14px" }} />
                    </label>
                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem", fontWeight: 600 }}>
                      <span>Informations pratiques</span>
                      <Textarea value={opportunityForm.practicalInfo} onChange={(event) => setOpportunityForm((current) => ({ ...current, practicalInfo: event.target.value }))} style={{ minHeight: "82px", width: "100%", borderRadius: "14px" }} />
                    </label>
                  </section>

                  {opportunityFormError ? (
                    <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
                      {opportunityFormError}
                    </p>
                  ) : null}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
                    <Button type="button" onClick={handleCloseOpportunityComposer} style={{ borderRadius: "999px", padding: "0.7rem 1.05rem", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}>
                      Annuler
                    </Button>
                    <Button type="submit" style={{ borderRadius: "999px", padding: "0.7rem 1.05rem", background: "linear-gradient(135deg, #111827 0%, #374151 100%)", color: "#fff", border: "1px solid #111827", fontWeight: 700 }}>
                      {editingOpportunityId
                        ? "Enregistrer les modifications"
                        : opportunityForm.status === "Brouillon"
                          ? "Enregistrer le brouillon"
                          : "Publier l’opportunité"}
                    </Button>
                  </div>
                </form>
                </div>
              </div>
            </>
          ) : null}

          {selectedOpportunity ? (
            <Card style={{ padding: "1rem", display: "grid", gap: "1rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.8rem", flexWrap: "wrap" }}>
                <div>
                  <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>GESTION DE L’OPPORTUNITÉ</p>
                  <h3 style={{ margin: "0.3rem 0 0", fontSize: "1.2rem", color: "#111827" }}>{selectedOpportunity.title}</h3>
                </div>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  <Button type="button" onClick={() => setSelectedOpportunityId(null)} style={{ borderRadius: "999px", padding: "0.7rem 0.95rem" }}>
                    ← Retour aux opportunités
                  </Button>
                  {canCreateOpportunity ? (
                    <>
                      <Button type="button" onClick={() => handleEditOpportunity(selectedOpportunity)} style={{ borderRadius: "999px", padding: "0.7rem 0.95rem", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}>
                        Modifier
                      </Button>
                      {selectedOpportunity.status === "Brouillon" ? (
                        <Button type="button" onClick={() => handlePublishDraftOpportunity(selectedOpportunity)} style={{ borderRadius: "999px", padding: "0.7rem 0.95rem", background: "linear-gradient(135deg, #111827 0%, #374151 100%)", color: "#fff", border: "1px solid #111827", fontWeight: 700 }}>
                          Publier
                        </Button>
                      ) : null}
                      <Button type="button" onClick={() => handleDeleteOpportunity(selectedOpportunity)} style={{ borderRadius: "999px", padding: "0.7rem 0.95rem", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                        Supprimer
                      </Button>
                    </>
                  ) : interestedOpportunities[selectedOpportunity.id] ? (
                    <Button type="button" onClick={() => handleToggleInterest(selectedOpportunity.id)} style={{ borderRadius: "999px", padding: "0.7rem 0.95rem", background: "#fff7ed", color: "#92400e", border: "1px solid #f5d6b0" }}>
                      Annuler l’intérêt
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => handleToggleInterest(selectedOpportunity.id)} style={{ borderRadius: "999px", padding: "0.7rem 0.95rem", background: "linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)", color: "#fff", border: "1px solid #f59e0b" }}>
                      Manifester mon intérêt
                    </Button>
                  )}
                </div>
              </div>

              {opportunityActionError ? (
                <p role="alert" style={{ margin: 0, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
                  {opportunityActionError}
                </p>
              ) : null}

              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <Badge style={{ background: "#fef3c7", color: "#92400e", padding: "0.3rem 0.6rem" }}>{selectedOpportunity.category}</Badge>
                <Badge style={{ background: selectedOpportunity.status === "Ouverte" ? "#ecfdf5" : selectedOpportunity.status === "Bientôt" ? "#eff6ff" : "#f3f4f6", color: selectedOpportunity.status === "Ouverte" ? "#047857" : selectedOpportunity.status === "Bientôt" ? "#1d4ed8" : "#6b7280", padding: "0.3rem 0.6rem" }}>
                  {selectedOpportunity.status}
                </Badge>
                {interestedOpportunities[selectedOpportunity.id] ? (
                  <div style={{ display: "grid", gap: "0.2rem" }}>
                    <Badge style={{ background: "#dcfce7", color: "#166534", padding: "0.3rem 0.6rem" }}>Intérêt envoyé</Badge>
                    <span style={{ color: "#6b7280", fontSize: "0.9rem" }}>Votre profil pourra être examiné par KLIQUE ou l’organisateur.</span>
                  </div>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                <div style={{ display: "grid", gap: "0.35rem", color: "#4b5563" }}>
                  <div><strong style={{ color: "#111827" }}>Organisation / auteur :</strong> {selectedOpportunity.organisation}</div>
                  <div><strong style={{ color: "#111827" }}>Public concerné :</strong> {selectedOpportunity.audience}</div>
                  <div><strong style={{ color: "#111827" }}>Sport / domaine :</strong> {selectedOpportunity.domain}</div>
                  <div><strong style={{ color: "#111827" }}>Lieu :</strong> {selectedOpportunity.location}</div>
                </div>
                <div style={{ display: "grid", gap: "0.35rem", color: "#4b5563" }}>
                  <div><strong style={{ color: "#111827" }}>Date :</strong> {selectedOpportunity.date}</div>
                  <div><strong style={{ color: "#111827" }}>Deadline :</strong> {selectedOpportunity.deadline}</div>
                  <div><strong style={{ color: "#111827" }}>Type :</strong> {selectedOpportunity.category}</div>
                  <div><strong style={{ color: "#111827" }}>Statut :</strong> {selectedOpportunity.status}</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.6rem", color: "#374151", lineHeight: 1.7 }}>
                <div>
                  <h4 style={{ margin: "0 0 0.2rem", color: "#111827" }}>Description</h4>
                  <p style={{ margin: 0 }}>{selectedOpportunity.fullDescription}</p>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 0.2rem", color: "#111827" }}>Conditions / prérequis</h4>
                  <p style={{ margin: 0 }}>{selectedOpportunity.prerequisites}</p>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 0.2rem", color: "#111827" }}>Informations pratiques</h4>
                  <p style={{ margin: 0 }}>{selectedOpportunity.practicalInfo}</p>
                </div>
              </div>

              {isShootingDetail ? (
                <div style={{ display: "grid", gap: "0.9rem", borderTop: "1px solid #f0e2d0", paddingTop: "1rem" }}>
                  <div>
                    <h4 style={{ margin: "0 0 0.2rem", color: "#111827" }}>Créneaux de shooting</h4>
                    <p style={{ margin: 0, color: "#6b7280" }}>Gérez les créneaux et les demandes des athlètes pour cette opportunité.</p>
                  </div>

                  {slotsError ? (
                    <div role="alert" style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "0.7rem 0.85rem" }}>
                      {slotsError}
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}>
                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem" }}>
                      <span>Début</span>
                      <Input
                        type="datetime-local"
                        value={slotForm.startsAt}
                        onChange={(event) => setSlotForm((current) => ({ ...current, startsAt: event.target.value }))}
                      />
                    </label>
                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem" }}>
                      <span>Fin</span>
                      <Input
                        type="datetime-local"
                        value={slotForm.endsAt}
                        onChange={(event) => setSlotForm((current) => ({ ...current, endsAt: event.target.value }))}
                      />
                    </label>
                    <label style={{ display: "grid", gap: "0.3rem", color: "#374151", fontSize: "0.9rem" }}>
                      <span>Capacité</span>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={slotForm.capacity}
                        onChange={(event) => setSlotForm((current) => ({ ...current, capacity: event.target.value }))}
                      />
                    </label>
                    <Button type="button" onClick={handleAddSlot} style={{ borderRadius: "999px", padding: "0.7rem 0.95rem" }}>
                      Ajouter un créneau
                    </Button>
                  </div>

                  {slotsLoading ? (
                    <p style={{ margin: 0, color: "#6b7280" }} aria-live="polite">Chargement des créneaux...</p>
                  ) : slots.length === 0 ? (
                    <EmptyState style={{ border: "1px dashed #d1d5db", padding: "1rem", textAlign: "center" }}>
                      <h3 style={{ margin: "0 0 0.25rem", color: "#111827" }}>Aucun créneau</h3>
                      <p style={{ margin: 0, color: "#6b7280" }}>Ajoutez un premier créneau pour permettre aux athlètes d’en demander un.</p>
                    </EmptyState>
                  ) : (
                    <div style={{ display: "grid", gap: "0.8rem" }}>
                      {slots.map((slot) => {
                        const requestsForSlot = slotRequests.filter((slotRequest) => slotRequest.slotId === slot.id);
                        const confirmedCount = requestsForSlot.filter((slotRequest) => slotRequest.status === "confirmed").length;

                        return (
                          <Card key={slot.id} style={{ padding: "0.9rem", display: "grid", gap: "0.7rem", border: "1px solid #f0e2d0" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                              <div style={{ color: "#4b5563" }}>
                                <strong style={{ color: "#111827" }}>{formatSlotDate(slot.startsAt)}</strong>
                                <span> • {formatSlotTime(slot.startsAt)} – {formatSlotTime(slot.endsAt)}</span>
                              </div>
                              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                                <Badge style={{ background: "#f3f4f6", color: "#374151", padding: "0.3rem 0.6rem" }}>
                                  {confirmedCount} / {slot.capacity} confirmé(s)
                                </Badge>
                                <Badge style={{ background: slot.status === "open" ? "#ecfdf5" : slot.status === "closed" ? "#f3f4f6" : "#fef2f2", color: slot.status === "open" ? "#047857" : slot.status === "closed" ? "#6b7280" : "#b91c1c", padding: "0.3rem 0.6rem" }}>
                                  {slotStatusLabels[slot.status]}
                                </Badge>
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                              {slot.status !== "open" ? (
                                <Button type="button" onClick={() => handleSlotStatusChange(slot.id, "open")} style={{ borderRadius: "999px", padding: "0.5rem 0.85rem", background: "linear-gradient(135deg, #111827 0%, #374151 100%)", color: "#fff", border: "1px solid #111827", fontWeight: 700 }}>
                                  Ouvrir
                                </Button>
                              ) : (
                                <Button type="button" onClick={() => handleSlotStatusChange(slot.id, "closed")} style={{ borderRadius: "999px", padding: "0.5rem 0.85rem", background: "linear-gradient(135deg, #111827 0%, #374151 100%)", color: "#fff", border: "1px solid #111827", fontWeight: 700 }}>
                                  Fermer
                                </Button>
                              )}

                              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                {slot.status !== "open" && slot.status !== "closed" ? (
                                  <Button type="button" onClick={() => handleSlotStatusChange(slot.id, "closed")} style={{ borderRadius: "999px", padding: "0.5rem 0.8rem", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}>
                                    Fermer
                                  </Button>
                                ) : null}
                                {slot.status !== "cancelled" ? (
                                  <Button type="button" onClick={() => handleSlotStatusChange(slot.id, "cancelled")} style={{ borderRadius: "999px", padding: "0.5rem 0.8rem", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                                    Annuler
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            {requestsForSlot.length === 0 ? (
                              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>Aucune demande pour ce créneau.</p>
                            ) : (
                              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
                                {requestsForSlot.map((slotRequest) => (
                                  <li key={slotRequest.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", borderTop: "1px solid #f3f4f6", paddingTop: "0.5rem" }}>
                                    <div style={{ color: "#374151" }}>
                                      <strong style={{ color: "#111827" }}>{athleteNames[slotRequest.athleteId] || slotRequest.athleteId}</strong>
                                      <span> • {slotRequestStatusLabels[slotRequest.status]}</span>
                                    </div>
                                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                      <Button type="button" onClick={() => handleSlotRequestStatusChange(slotRequest.id, "confirmed")} style={{ borderRadius: "999px", padding: "0.45rem 0.75rem" }}>
                                        Confirmer
                                      </Button>
                                      <Button type="button" onClick={() => handleSlotRequestStatusChange(slotRequest.id, "declined")} style={{ borderRadius: "999px", padding: "0.45rem 0.75rem" }}>
                                        Refuser
                                      </Button>
                                      <Button type="button" onClick={() => handleSlotRequestStatusChange(slotRequest.id, "cancelled")} style={{ borderRadius: "999px", padding: "0.45rem 0.75rem" }}>
                                        Annuler
                                      </Button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </Card>
          ) : (
            <>
              <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                {visibleOpportunities.map((opportunity) => {
                  const statusColor =
                    opportunity.status === "Ouverte"
                      ? { background: "#ecfdf5", color: "#047857" }
                      : opportunity.status === "Bientôt"
                        ? { background: "#eff6ff", color: "#1d4ed8" }
                        : opportunity.status === "Brouillon"
                          ? { background: "#fef2f2", color: "#b91c1c" }
                          : { background: "#f3f4f6", color: "#6b7280" };

                  return (
                    <Card key={opportunity.id} style={{ padding: "1rem", display: "grid", gap: "0.8rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                        <Badge style={{ background: "#fef3c7", color: "#92400e", padding: "0.3rem 0.6rem" }}>{opportunity.category}</Badge>
                        <Badge style={{ ...statusColor, padding: "0.3rem 0.6rem" }}>{opportunity.status}</Badge>
                      </div>

                      <div>
                        <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#111827" }}>{opportunity.title}</h3>
                        <p style={{ margin: "0.35rem 0 0", color: "#6b7280", lineHeight: 1.6 }}>{opportunity.description}</p>
                      </div>

                      <div style={{ display: "grid", gap: "0.35rem", color: "#4b5563", fontSize: "0.92rem" }}>
                        <div><strong style={{ color: "#111827" }}>Date :</strong> {opportunity.date}</div>
                        <div><strong style={{ color: "#111827" }}>Lieu :</strong> {opportunity.location}</div>
                        <div><strong style={{ color: "#111827" }}>Deadline :</strong> {opportunity.deadline}</div>
                      </div>

                      <Button type="button" onClick={() => setSelectedOpportunityId(opportunity.id)} style={{ borderRadius: "999px", padding: "0.65rem 1rem", alignSelf: "flex-start", background: "linear-gradient(135deg, #111827 0%, #374151 100%)", color: "#fff", border: "1px solid #111827", fontWeight: 700 }}>
                        Gérer l’opportunité
                      </Button>
                    </Card>
                  );
                })}
              </div>

              {visibleOpportunities.length === 0 && !opportunitiesLoading && !opportunitiesError ? (
                <Card style={{ padding: "0.9rem" }}>
                  <EmptyState style={{ border: "1px dashed #d1d5db", padding: "0.85rem", textAlign: "center" }}>
                    <h3 style={{ margin: "0 0 0.2rem", color: "#111827", fontSize: "1rem" }}>Aucune opportunité pour ce filtre</h3>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>Changez de type ou de statut, ou créez une nouvelle opportunité.</p>
                  </EmptyState>
                </Card>
              ) : null}

              {opportunitiesLoading ? (
                <Card style={{ padding: "1rem" }}>
                  <p style={{ margin: 0, color: "#6b7280" }} aria-live="polite">Chargement des opportunités...</p>
                </Card>
              ) : null}

              {opportunitiesError ? (
                <Card style={{ padding: "1rem" }}>
                  <div role="alert" style={{ display: "grid", gap: "0.35rem" }}>
                    <h3 style={{ margin: 0, color: "#b91c1c" }}>Impossible de charger les opportunités</h3>
                    <p style={{ margin: 0, color: "#6b7280" }}>{opportunitiesError}</p>
                  </div>
                </Card>
              ) : null}
            </>
          )}
        </div>
      ) : activeTab === "Avantages" ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <Card style={{ padding: "1.15rem", display: "grid", gap: "1rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>AVANTAGES</p>
                <h2 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Des offres pensées pour les membres KLIQUE</h2>
                <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
                  Les avantages sont exclusivement réservés aux membres KLIQUE. Pour en bénéficier, vous devrez présenter votre Pass KLIQUE actif au partenaire ou expert proposant l’offre.
                </p>
              </div>
              <Badge style={{ background: "#fef3c7", color: "#92400e", padding: "0.35rem 0.7rem" }}>Réservé aux membres</Badge>
            </div>

            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              {benefitCategoryFilters.map((category) => {
                const isActive = category === activeBenefitCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveBenefitCategory(category)}
                    style={{
                      border: isActive ? "1px solid #f59e0b" : "1px solid #e5e7eb",
                      background: isActive ? "#fff7ed" : "white",
                      color: isActive ? "#92400e" : "#374151",
                      borderRadius: "999px",
                      padding: "0.58rem 0.8rem",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </Card>

          <div style={{ display: "grid", gap: "1rem" }}>
            {visibleBenefits.map((benefit) => {
              const statusColor =
                benefit.status === "Actif"
                  ? { background: "#ecfdf5", color: "#047857" }
                  : benefit.status === "Bientôt"
                    ? { background: "#eff6ff", color: "#1d4ed8" }
                    : { background: "#f3f4f6", color: "#6b7280" };
              const shortDescription = benefit.conditions || benefit.value || benefit.description;
              const usageLabel =
                benefit.usage.usageType === "once"
                  ? "Utilisable 1 fois"
                  : benefit.usage.usageType === "limited"
                    ? `Utilisable ${benefit.usage.usageLimit} fois`
                    : "Utilisations illimitées";

              return (
                <Card
                  key={benefit.id}
                  style={{
                    padding: "1rem",
                    display: "grid",
                    gap: "1rem",
                    border: "1px solid #efe3d4",
                    boxShadow: "0 24px 50px rgba(15, 23, 42, 0.06)",
                    background: "#fffdf9",
                    borderRadius: "24px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: "1rem",
                      gridTemplateColumns: isCompactBenefitsLayout ? "1fr" : "minmax(220px, 0.95fr) minmax(280px, 1.25fr) minmax(190px, 0.75fr)",
                    }}
                  >
                    <div style={{ background: "#0f172a", color: "#f8fafc", borderRadius: "20px", padding: "1rem", display: "grid", gap: "0.8rem", minHeight: isCompactBenefitsLayout ? "auto" : "100%" }}>
                      <div style={{ width: "54px", height: "54px", borderRadius: "18px", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.18)", display: "grid", placeItems: "center", fontSize: "1rem", fontWeight: 700 }}>
                        {benefit.partner.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ margin: 0, color: "#cbd5e1", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Partenaire</p>
                        <h3 style={{ margin: "0.25rem 0 0", fontSize: "1.05rem", lineHeight: 1.3 }}>{benefit.partner}</h3>
                      </div>
                      <Badge style={{ width: "fit-content", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", padding: "0.35rem 0.7rem" }}>
                        {benefit.partnerType}
                      </Badge>
                      {shortDescription ? <p style={{ margin: 0, color: "#dbeafe", lineHeight: 1.6, fontSize: "0.92rem" }}>{shortDescription}</p> : null}
                    </div>

                    <div style={{ display: "grid", gap: "0.85rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: "0.3rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                            <Badge style={{ background: "#fff7ed", color: "#b45309", border: "1px solid #f6d4b0", padding: "0.35rem 0.65rem" }}>{benefit.category}</Badge>
                            <div style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#f59e0b" }} />
                            <div style={{ color: "#6b7280", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Offre membre</div>
                          </div>
                          <h3 style={{ margin: 0, fontSize: "1.25rem", lineHeight: 1.3, color: "#111827" }}>{benefit.title}</h3>
                        </div>
                        <Badge style={{ ...statusColor, padding: "0.35rem 0.7rem" }}>{benefit.status}</Badge>
                      </div>

                      {benefit.value ? <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#c2410c", lineHeight: 1.4 }}>{benefit.value}</div> : null}
                      {benefit.description ? <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.7 }}>{benefit.description}</p> : null}

                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", color: "#92400e", fontSize: "0.84rem", fontWeight: 700, background: "#fff7ed", border: "1px solid #f5d6b0", borderRadius: "999px", padding: "0.4rem 0.7rem", alignSelf: "flex-start" }}>
                        🔒 Réservé aux membres KLIQUE
                      </div>
                      <div style={{ padding: "0.85rem", borderRadius: "16px", border: "1px solid #f3e7d5", background: "rgba(255,255,255,0.8)", display: "grid", gap: "0.3rem" }}>
                        <div style={{ fontWeight: 800, color: "#111827" }}>Présentez votre Pass KLIQUE actif pour bénéficier de cette offre.</div>
                        <div style={{ color: "#6b7280", fontSize: "0.92rem", lineHeight: 1.55 }}>L’accès est réservé aux membres KLIQUE et peut être vérifié directement au moment de l’échange.</div>
                        <div style={{ color: "#b45309", fontSize: "0.84rem", fontWeight: 700, marginTop: "0.15rem" }}>{usageLabel}</div>
                      </div>
                    </div>

                    <div style={{ borderRadius: "20px", border: "1px solid #ece7df", background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)", minHeight: "220px", display: "grid", placeItems: "center", padding: "1rem" }}>
                      <div style={{ textAlign: "center", display: "grid", gap: "0.5rem" }}>
                        <div style={{ width: "72px", height: "72px", borderRadius: "999px", background: "#ffffff", border: "1px solid #e5e7eb", display: "grid", placeItems: "center", margin: "0 auto", color: "#0f172a", fontSize: "1.5rem", fontWeight: 800 }}>
                          ✦
                        </div>
                        <div style={{ color: "#334155", fontWeight: 800 }}>Visuel premium</div>
                        <div style={{ color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>Espace réservé pour une image partenaire ou un support exclusif.</div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid #efe4d4",
                      paddingTop: "0.95rem",
                      display: "grid",
                      gap: "0.8rem",
                      gridTemplateColumns: isCompactBenefitsLayout ? "1fr" : "minmax(180px, 1fr) minmax(180px, 1fr) auto",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ color: "#6b7280", fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Validité</div>
                      <div style={{ color: "#111827", fontWeight: 700, marginTop: "0.2rem" }}>{benefit.validity}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Activation</div>
                      <div style={{ color: "#111827", fontWeight: 700, marginTop: "0.2rem" }}>{benefit.activation}</div>
                    </div>
                    <Button type="button" style={{ borderRadius: "999px", padding: "0.8rem 1rem", alignSelf: "flex-start", background: "#f59e0b", color: "#fff", border: "none" }}>
                      Voir l’avantage →
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          <Card style={{ padding: "1.15rem", display: "grid", gap: "1rem", border: "1px solid #f0e2d0", boxShadow: "0 12px 28px rgba(17, 24, 39, 0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>RESSOURCES</p>
                <h2 style={{ margin: "0.3rem 0 0.35rem", fontSize: "1.35rem", color: "#111827" }}>Une bibliothèque utile pour progresser au quotidien</h2>
                <p style={{ margin: 0, color: "#6b7280", maxWidth: "760px", lineHeight: 1.6 }}>
                  Retrouvez des contenus pratiques, pensés pour accompagner les membres KLIQUE dans leur préparation mentale, physique et professionnelle.
                </p>
              </div>
              {canCreateOpportunity ? (
                <Button
                  type="button"
                  onClick={() => {
                    setEditingResourceId(null);
                    setResourceForm(createEmptyResourceForm());
                    setIsResourceComposerOpen(true);
                  }}
                  style={{ borderRadius: "999px", padding: "0.72rem 0.95rem", background: "#f59e0b", color: "#fff", border: "none" }}
                >
                  Ajouter une ressource
                </Button>
              ) : null}
            </div>

            {isResourceComposerOpen ? (
              <Card style={{ padding: "1rem", display: "grid", gap: "0.9rem", border: "1px solid #f0e2d0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, color: "#111827" }}>{editingResourceId ? "Modifier une ressource" : "Ajouter une ressource"}</h3>
                  <button type="button" onClick={() => { setIsResourceComposerOpen(false); setEditingResourceId(null); setResourceForm(createEmptyResourceForm()); }} style={{ border: "none", background: "transparent", color: "#6b7280", cursor: "pointer", fontWeight: 700 }}>
                    Fermer
                  </button>
                </div>

                <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <Input placeholder="Titre" value={resourceForm.title} onChange={(event) => setResourceForm((current) => ({ ...current, title: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                  <select value={resourceForm.category} onChange={(event) => setResourceForm((current) => ({ ...current, category: event.target.value as ResourceCategory }))} style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.75rem 0.9rem", color: "#111827", background: "white" }}>
                    {(["Mental", "Nutrition", "Récupération", "Performance", "Image & réseaux sociaux", "Carrière", "Administratif", "Médias", "Autre"] as ResourceCategory[]).map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <Input placeholder="Auteur" value={resourceForm.author} onChange={(event) => setResourceForm((current) => ({ ...current, author: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                  <select value={resourceForm.type} onChange={(event) => setResourceForm((current) => ({ ...current, type: event.target.value as ResourceContentType }))} style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.75rem 0.9rem", color: "#111827", background: "white" }}>
                    {(["Article", "Guide", "Vidéo", "Document", "Lien", "Conseil"] as ResourceContentType[]).map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <select value={resourceForm.status} onChange={(event) => setResourceForm((current) => ({ ...current, status: event.target.value as "Brouillon" | "Publié" }))} style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.75rem 0.9rem", color: "#111827", background: "white" }}>
                    <option value="Brouillon">Brouillon</option>
                    <option value="Publié">Publié</option>
                  </select>
                  <Input type="date" value={resourceForm.date} onChange={(event) => setResourceForm((current) => ({ ...current, date: event.target.value }))} style={{ width: "100%", borderRadius: "14px" }} />
                </div>

                <Textarea placeholder="Description courte" value={resourceForm.description} onChange={(event) => setResourceForm((current) => ({ ...current, description: event.target.value }))} style={{ minHeight: "86px", width: "100%", borderRadius: "14px" }} />
                <Textarea placeholder="Contenu ou URL selon le type" value={resourceForm.content} onChange={(event) => setResourceForm((current) => ({ ...current, content: event.target.value }))} style={{ minHeight: "108px", width: "100%", borderRadius: "14px" }} />

                <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
                  <Button type="button" onClick={handleSaveResource} style={{ borderRadius: "999px", padding: "0.72rem 0.92rem", background: "#f59e0b", color: "#fff", border: "none" }}>
                    {resourceForm.status === "Publié" ? "Publier" : "Enregistrer le brouillon"}
                  </Button>
                </div>
              </Card>
            ) : null}

            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              {(["Tout", ...(["Mental", "Nutrition", "Récupération", "Performance", "Image & réseaux sociaux", "Carrière", "Administratif", "Médias", "Autre"] as ResourceCategory[]) ] as Array<ResourceCategory | "Tout">).map((category) => {
                const isActive = category === activeResourceCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveResourceCategory(category)}
                    style={{
                      border: isActive ? "1px solid #f59e0b" : "1px solid #e5e7eb",
                      background: isActive ? "#fff7ed" : "white",
                      color: isActive ? "#92400e" : "#374151",
                      borderRadius: "999px",
                      padding: "0.58rem 0.8rem",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </Card>

          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {visibleResources.map((resource) => (
              <Card key={resource.id} style={{ padding: "1rem", display: "grid", gap: "0.8rem", border: "1px solid #efe3d4", boxShadow: "0 20px 40px rgba(15, 23, 42, 0.05)", borderRadius: "20px", background: "#fffdf9" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                  <Badge style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.35rem 0.65rem" }}>{resource.category}</Badge>
                  <div style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 600 }}>{resource.date}</div>
                </div>

                <div>
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.08rem", color: "#111827", lineHeight: 1.3 }}>{resource.title}</h3>
                  <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>{resource.description}</p>
                </div>

                <div style={{ display: "grid", gap: "0.35rem", color: "#374151", fontSize: "0.92rem" }}>
                  <div><strong style={{ color: "#111827" }}>Auteur :</strong> {resource.author}</div>
                  <div><strong style={{ color: "#111827" }}>Type :</strong> {resource.contentType}</div>
                </div>

                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                  <Button type="button" onClick={() => handleOpenResource(resource)} style={{ borderRadius: "999px", padding: "0.75rem 0.95rem", alignSelf: "flex-start", background: "#f59e0b", color: "#fff", border: "none" }}>
                    Consulter
                  </Button>
                  {canCreateOpportunity ? (
                    <>
                      <button type="button" onClick={() => handleEditResource(resource)} style={{ border: "1px solid #e5e7eb", background: "white", color: "#374151", borderRadius: "999px", padding: "0.55rem 0.8rem", cursor: "pointer", fontWeight: 700 }}>
                        Modifier
                      </button>
                      <button type="button" onClick={() => handleDeleteResource(resource.id)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "999px", padding: "0.55rem 0.8rem", cursor: "pointer", fontWeight: 700 }}>
                        Supprimer
                      </button>
                    </>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {selectedResource ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.56)", display: "grid", placeItems: "center", padding: "1rem", zIndex: 50 }}>
          <Card style={{ width: "100%", maxWidth: "640px", padding: "1.1rem", display: "grid", gap: "0.9rem", border: "1px solid #f0e2d0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.8rem" }}>
              <div>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{selectedResource.category}</p>
                <h3 style={{ margin: "0.25rem 0 0", color: "#111827" }}>{selectedResource.title}</h3>
              </div>
              <button type="button" onClick={() => setSelectedResourceId(null)} style={{ border: "none", background: "transparent", color: "#6b7280", cursor: "pointer", fontWeight: 700 }}>
                Fermer
              </button>
            </div>
            <div style={{ color: "#374151", lineHeight: 1.7 }}>{selectedResource.content}</div>
            <div style={{ color: "#6b7280", fontSize: "0.92rem" }}>
              <div><strong style={{ color: "#111827" }}>Auteur :</strong> {selectedResource.author}</div>
              <div><strong style={{ color: "#111827" }}>Type :</strong> {selectedResource.contentType}</div>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
