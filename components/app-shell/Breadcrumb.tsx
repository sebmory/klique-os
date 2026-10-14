"use client";

import Link from "next/link";

type BreadcrumbItem = {
  label: string;
  href: string;
};

const segmentLabelMap: Record<string, string> = {
  today: "Aujourd'hui",
  crm: "CRM",
  ecosysteme: "Écosystème",
  contents: "Contenus",
  create: "Assistant de creation",
  result: "Interview",
  production: "Production",
  projects: "Projets",
  media: "Medias",
  "ai-studio": "AI Studio",
  hub: "Communauté",
  calendar: "Calendrier",
  analytics: "Analytics",
  visibilite: "Visibilité",
  "benefit-reservations": "Réservations d’avantages",
  integrations: "Integrations",
  settings: "Parametres",
};

const titleCase = (value: string) =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const contentResultLabelByType: Record<string, string> = {
  interview: "Interview",
  publication: "Publication",
  reel: "Reel",
  story: "Story",
  article: "Article",
};

const resolveContentResultLabel = (): string => {
  try {
    const raw = window.sessionStorage.getItem("klique.contents.creation-assistant.article-result.v1") ?? window.sessionStorage.getItem("klique.contents.creation-assistant.interview-result.v1");
    const requestType = raw ? (JSON.parse(raw) as { request?: { requestType?: string } }).request?.requestType : undefined;
    return contentResultLabelByType[requestType ?? ""] ?? "Interview";
  } catch {
    return "Interview";
  }
};

export function buildBreadcrumb(pathname: string, isAdmin = false): BreadcrumbItem[] {
  const cleaned = pathname.split("?")[0] ?? pathname;
  const segments = cleaned.split("/").filter(Boolean);
  const homeItem = isAdmin
    ? { label: "Tableau de bord", href: "/today" }
    : { label: "Accueil", href: "/" };

  if (segments.length === 0) {
    return isAdmin
      ? [homeItem]
      : [homeItem, { label: "Aujourd'hui", href: "/today" }];
  }

  const items: BreadcrumbItem[] = [homeItem];
  let current = "";

  for (const segment of segments) {
    current += `/${segment}`;
    if (isAdmin && current === homeItem.href) continue;
    items.push({
      label: segmentLabelMap[segment] ?? titleCase(segment),
      href: current,
    });
  }

  return items;
}

export function Breadcrumb({ pathname, isAdmin = false }: { pathname: string; isAdmin?: boolean }) {
  const isContentResult = pathname.split("?")[0] === "/contents/create/result";
  const contentResultLabel = isContentResult ? resolveContentResultLabel() : "Interview";

  const items = buildBreadcrumb(pathname, isAdmin).map((item, index, breadcrumbs) =>
    isContentResult && index === breadcrumbs.length - 1 ? { ...item, label: contentResultLabel } : item,
  );

  return (
    <nav className="klique-breadcrumb" aria-label="Fil d'Ariane">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.href}>
              {isLast ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <Link href={item.href}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
