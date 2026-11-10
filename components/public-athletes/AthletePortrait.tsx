import type { PublicSportColorCategory } from "@/lib/public-athletes";
import styles from "./athlete-portrait.module.css";

type AthletePortraitProps = {
  name: string;
  sport: string;
  portrait?: string;
  colorCategory: PublicSportColorCategory;
  decorative?: boolean;
  priority?: boolean;
};

const getInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("fr"))
    .join("");

export default function AthletePortrait({
  name,
  sport,
  portrait,
  colorCategory,
  decorative = false,
  priority = false,
}: AthletePortraitProps) {
  if (portrait) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles.image}
        src={portrait}
        alt={decorative ? "" : `Portrait de ${name}`}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }

  return (
    <div
      className={`${styles.placeholder} ${styles[colorCategory]}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `Portrait non publié de ${name}`}
      aria-hidden={decorative ? "true" : undefined}
    >
      <span>{getInitials(name)}</span>
      <small>{sport}</small>
    </div>
  );
}
