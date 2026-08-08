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
  hub: "Hub",
  calendar: "Calendrier",
  analytics: "Analytics",
  integrations: "Integrations",
  settings: "Parametres",
};

const titleCase = (value: string) =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function buildBreadcrumb(pathname: string): BreadcrumbItem[] {
  const cleaned = pathname.split("?")[0] ?? pathname;
  const segments = cleaned.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [
      { label: "Accueil", href: "/" },
      { label: "Aujourd'hui", href: "/today" },
    ];
  }

  const items: BreadcrumbItem[] = [{ label: "Accueil", href: "/" }];
  let current = "";

  for (const segment of segments) {
    current += `/${segment}`;
    items.push({
      label: segmentLabelMap[segment] ?? titleCase(segment),
      href: current,
    });
  }

  return items;
}

export function Breadcrumb({ pathname }: { pathname: string }) {
  const items = buildBreadcrumb(pathname);

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
