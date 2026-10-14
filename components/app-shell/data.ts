import type { IconName } from "./icons";

export type Workspace = {
  id: string;
  name: string;
  description: string;
  monogram: string;
};

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  badge?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: IconName;
  items: NavItem[];
};

export type SearchEntry = {
  id: string;
  label: string;
  category: "Personnes" | "Organisations" | "Projets" | "Medias" | "Actions rapides";
  href?: string;
  action?: "open-notifications";
};

export const openNotificationsEvent = "klique:open-notifications";

export const workspaces: Workspace[] = [
  { id: "klique-os", name: "KLIQUE OS", description: "Workspace principal", monogram: "KO" },
  { id: "klique-agency", name: "KLIQUE Agency", description: "Agence", monogram: "KA" },
  { id: "elfic-fribourg", name: "Elfic Fribourg", description: "Club", monogram: "EF" },
  { id: "personnel", name: "Personnel", description: "Espace prive", monogram: "PM" },
];

export const adminNavigationGroups: NavGroup[] = [
  {
    id: "pilotage",
    label: "Pilotage",
    icon: "chart",
    items: [
      { id: "today", label: "Tableau de bord", href: "/today", icon: "house" },
      { id: "calendar", label: "Calendrier", href: "/calendar", icon: "calendar" },
      { id: "visibility", label: "Visibilité", href: "/analytics/visibilite", icon: "chart" },
    ],
  },
  {
    id: "relations",
    label: "Relations",
    icon: "users",
    items: [
      { id: "athletes", label: "Athlètes", href: "/crm/personnes", icon: "users" },
      { id: "creatives", label: "Créatifs", href: "/crm/creatifs", icon: "image" },
      { id: "partners", label: "Partenaires & experts", href: "/ecosysteme", icon: "network" },
      { id: "requests", label: "Demandes", href: "/crm/demandes", icon: "messages" },
    ],
  },
  {
    id: "production",
    label: "Production",
    icon: "production",
    items: [
      { id: "productions", label: "Productions", href: "/production", icon: "production" },
      { id: "creative-missions", label: "Missions créatives", href: "/missions", icon: "folder" },
      { id: "media-bank", label: "Banque médias", href: "/media", icon: "image" },
      { id: "media-days", label: "Journées média", href: "/media-days", icon: "calendar" },
      { id: "media-desk", label: "Sujets médias", href: "/media-desk", icon: "newspaper" },
      { id: "shooting-assistant", label: "Assistant shooting", href: "/shooting/assistant", icon: "sparkles" },
    ],
  },
  {
    id: "contents",
    label: "Contenus",
    icon: "contents",
    items: [
      { id: "content-studio", label: "Studio de contenus", href: "/contents", icon: "contents" },
      { id: "story-studio", label: "Story Studio", href: "/contents/story-studio/brand-kits", icon: "image" },
    ],
  },
  {
    id: "community",
    label: "Communauté",
    icon: "messages",
    items: [
      { id: "community-overview", label: "Vue Communauté", href: "/hub", icon: "messages" },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: "settings",
    items: [
      { id: "settings", label: "Paramètres", href: "/settings", icon: "settings" },
      { id: "notifications", label: "Notifications & annonces", href: "/settings/notifications", icon: "messages" },
    ],
  },
];

export const adminCreativeNavigationGroup: NavGroup = {
  id: "personal-space",
  label: "Espace personnel",
  icon: "contents",
  items: [
    { id: "creative", label: "Espace créatif", href: "/creative", icon: "contents" },
  ],
};

export const mainNavigation: NavItem[] = adminNavigationGroups
  .filter((group) => group.id !== "administration")
  .flatMap((group) => group.items);

export const secondaryNavigation: NavItem[] = [
  ...adminNavigationGroups.find((group) => group.id === "administration")?.items ?? [],
];

export const commandEntries: SearchEntry[] = [
  { id: "admin-athletes", label: "Athlètes", category: "Personnes", href: "/crm/personnes" },
  { id: "admin-creatives", label: "Créatifs", category: "Personnes", href: "/crm/creatifs" },
  { id: "admin-partners", label: "Partenaires & experts", category: "Organisations", href: "/ecosysteme" },
  { id: "admin-productions", label: "Productions", category: "Projets", href: "/production" },
  { id: "admin-creative-missions", label: "Missions créatives", category: "Projets", href: "/missions" },
  { id: "admin-media", label: "Banque médias", category: "Medias", href: "/media" },
  { id: "admin-dashboard", label: "Tableau de bord", category: "Actions rapides", href: "/today" },
  { id: "admin-calendar", label: "Calendrier opérationnel", category: "Actions rapides", href: "/calendar" },
  { id: "admin-requests", label: "Demandes", category: "Actions rapides", href: "/crm/demandes" },
  { id: "admin-settings", label: "Paramètres", category: "Actions rapides", href: "/settings" },
];

export const athleteCommandEntries: SearchEntry[] = [
  { id: "athlete-home", label: "Mon espace", category: "Actions rapides", href: "/athlete" },
  { id: "athlete-profile", label: "Mon profil", category: "Personnes", href: "/athlete/profile" },
  { id: "athlete-services", label: "Services", category: "Actions rapides", href: "/athlete/services" },
  { id: "athlete-community", label: "Communauté", category: "Actions rapides", href: "/athlete/community" },
];

export const mediaCommandEntries: SearchEntry[] = [
  { id: "media-desk", label: "Media Desk", category: "Actions rapides", href: "/media-desk" },
  { id: "media-athletes", label: "Athlètes", category: "Personnes", href: "/media/athletes" },
  { id: "media-contents", label: "Contenus", category: "Actions rapides", href: "/contents" },
];

export const creativeCommandEntries: SearchEntry[] = [
  { id: "creative-missions", label: "Mes missions", category: "Actions rapides", href: "/creative" },
];

export const partnerCommandEntries: SearchEntry[] = [
  { id: "partner-home", label: "Accueil Partenaire", category: "Actions rapides", href: "/partner" },
  { id: "partner-community", label: "Communauté", category: "Actions rapides", href: "/partner/community" },
  { id: "partner-athletes", label: "Annuaire des athlètes", category: "Personnes", href: "/partner/athletes" },
  { id: "partner-athlete-profiles", label: "Fiches Athlètes publiques", category: "Personnes", href: "/partner/athletes" },
  { id: "partner-benefit-reservations", label: "Réservations d’avantages", category: "Actions rapides", href: "/partner/benefit-reservations" },
  { id: "partner-contact-requests", label: "Mes mises en relation", category: "Actions rapides", href: "/partner/contact-requests" },
  { id: "partner-notifications", label: "Notifications", category: "Actions rapides", action: "open-notifications" },
  { id: "partner-profile", label: "Mon espace / profil", category: "Actions rapides", href: "/partner" },
];
