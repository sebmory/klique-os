import Link from "next/link";
import { ChevronDown, CircleUserRound } from "lucide-react";
import type { RelationsCardProps } from "@/types/relations";

export function RelationsCard({
  title = "Écosystème KLIQUE",
  resources = [],
  emptyText = "Aucune ressource pour le moment.",
}: RelationsCardProps) {
  if (resources.length === 0) {
    return (
      <div className="relations-card-empty" role="status">
        <span className="relations-empty-icon" aria-hidden>
          <CircleUserRound size={18} />
        </span>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <section className="relations-card-shell" aria-label={title}>
      <header className="relations-shell-head">
        <h3>{title}</h3>
      </header>

      <ul className="relations-resource-grid">
        {resources.map((resource) => {
          const ResourceIcon = resource.icon;
          const cardContent = (
            <>
              <span className="relations-resource-icon" aria-hidden>
                <ResourceIcon size={16} />
              </span>
              <span className="relations-resource-copy">
                <strong>{resource.title}</strong>
                <small>{resource.description}</small>
              </span>
              <span className="relations-resource-count">
                <strong>{resource.count}</strong>
                <small>{resource.countLabel}</small>
              </span>
              <span className="relations-item-chevron" aria-hidden>
                <ChevronDown size={15} />
              </span>
            </>
          );

          return (
            <li key={resource.id}>
              {resource.href && !resource.disabled ? (
                <Link href={resource.href} className="relations-resource-card" aria-label={`Ouvrir ${resource.title}`}>
                  {cardContent}
                </Link>
              ) : (
                <button type="button" className="relations-resource-card is-disabled" aria-disabled="true">
                  {cardContent}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
