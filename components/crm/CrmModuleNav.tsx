"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [{ href: "/crm/personnes", label: "Athlètes" }];

export function CrmModuleNav() {
  const pathname = usePathname();

  return (
    <nav className="crm-module-nav" aria-label="Navigation CRM">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link key={tab.href} href={tab.href} className={isActive ? "crm-module-nav-link is-active" : "crm-module-nav-link"}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
