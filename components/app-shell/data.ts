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

export type SearchEntry = {
  id: string;
  label: string;
  category: "Personnes" | "Organisations" | "Projets" | "Medias" | "Actions rapides";
  href: string;
};

export type NotificationItem = {
  id: string;
  text: string;
  unread: boolean;
  dateLabel: string;
};

export const workspaces: Workspace[] = [
  { id: "klique-os", name: "KLIQUE OS", description: "Workspace principal", monogram: "KO" },
  { id: "klique-agency", name: "KLIQUE Agency", description: "Agence", monogram: "KA" },
  { id: "elfic-fribourg", name: "Elfic Fribourg", description: "Club", monogram: "EF" },
  { id: "personnel", name: "Personnel", description: "Espace prive", monogram: "PM" },
];

export const mainNavigation: NavItem[] = [
  { id: "today", label: "Aujourd'hui", href: "/today", icon: "house" },
  { id: "crm", label: "CRM", href: "/crm", icon: "users" },
  { id: "ecosysteme", label: "Écosystème", href: "/ecosysteme", icon: "network" },
  { id: "contents", label: "Contenus", href: "/contents", icon: "contents" },
  { id: "production", label: "Production", href: "/production", icon: "production" },
  { id: "projects", label: "Projets", href: "/projects", icon: "folder" },
  { id: "media", label: "Medias", href: "/media", icon: "image" },
  { id: "ai-studio", label: "AI Studio", href: "/ai-studio", icon: "sparkles", badge: "IA" },
  { id: "hub", label: "Hub", href: "/hub", icon: "messages" },
  { id: "calendar", label: "Calendrier", href: "/calendar", icon: "calendar" },
];

export const secondaryNavigation: NavItem[] = [
  { id: "analytics", label: "Analytics", href: "/analytics", icon: "chart" },
  { id: "integrations", label: "Integrations", href: "/integrations", icon: "plug" },
  { id: "settings", label: "Parametres", href: "/settings", icon: "settings" },
];

export const commandEntries: SearchEntry[] = [
  { id: "person-1", label: "Mila Benjak", category: "Personnes", href: "/crm" },
  { id: "person-2", label: "Liban Maxamed", category: "Personnes", href: "/crm" },
  { id: "org-1", label: "Elfic Fribourg", category: "Organisations", href: "/crm" },
  {
    id: "project-1",
    label: "Shooting portraits KLIQUE",
    category: "Projets",
    href: "/projects",
  },
  { id: "media-1", label: "Portraits Premium Avril", category: "Medias", href: "/media" },
  { id: "action-1", label: "Creer une personne", category: "Actions rapides", href: "/crm" },
  { id: "action-2", label: "Creer un projet", category: "Actions rapides", href: "/projects" },
];

export const notificationsSeed: NotificationItem[] = [
  {
    id: "notif-1",
    text: "Nouveau media ajoute au projet Shooting portraits KLIQUE.",
    unread: true,
    dateLabel: "il y a 4 min",
  },
  {
    id: "notif-2",
    text: "Elfic Fribourg a ete lie a une nouvelle personne.",
    unread: true,
    dateLabel: "il y a 22 min",
  },
  {
    id: "notif-3",
    text: "Un evenement commence demain a 11 h.",
    unread: false,
    dateLabel: "aujourd'hui",
  },
  {
    id: "notif-4",
    text: "Une nouvelle activite a ete enregistree dans le CRM.",
    unread: false,
    dateLabel: "hier",
  },
];
