"use client";

import { Lightbulb } from "lucide-react";
import { Badge, Button } from "@/src/design-system/components";
import {
  MEDIA_REQUEST_TYPE_LABELS,
  type MediaRequestType,
} from "./media-subject-presentation";

export type EditorialIdea = {
  id: string;
  title: string;
  angle: string;
  whyNow: string;
  profiles: string[];
  formats: MediaRequestType[];
  sport: string;
};

export const EDITORIAL_IDEAS: readonly EditorialIdea[] = [
  {
    id: "giuliano-muret-2028",
    title: "À 11 ans, Giuliano Muret vise les Mondiaux de wakesurf 2028.",
    angle: "Raconter la construction d’un objectif mondial à hauteur d’enfant, entre progression sportive, plaisir et accompagnement familial.",
    whyNow: "La trajectoire vers 2028 commence aujourd’hui et permet de documenter les étapes décisives avant que le résultat ne prenne le dessus sur le parcours.",
    profiles: ["Giuliano Muret", "Entourage sportif", "Experts du wakesurf"],
    formats: ["interview", "reportage", "images"],
    sport: "Wakesurf",
  },
  {
    id: "generation-basket-suisse",
    title: "Une nouvelle génération veut bousculer le basket suisse.",
    angle: "Croiser les ambitions de jeunes talents qui veulent accélérer le renouvellement du basket suisse et faire évoluer son image.",
    whyNow: "Plusieurs profils arrivent simultanément à un moment charnière de leur développement sportif et médiatique.",
    profiles: ["Jeunes basketteurs suisses", "Entraîneurs", "Clubs formateurs"],
    formats: ["reportage", "interview", "reaction"],
    sport: "Basketball",
  },
  {
    id: "fc-nantes-projet-suisse",
    title: "Du centre de formation du FC Nantes à un nouveau projet en Suisse.",
    angle: "Explorer ce que change un passage par un centre de formation reconnu lorsque vient le temps de reconstruire un projet en Suisse.",
    whyNow: "Le changement de championnat ouvre une fenêtre éditoriale naturelle pour revenir sur la formation et présenter les nouvelles ambitions.",
    profiles: ["Athlète issu du FC Nantes", "Staff du nouveau club", "Anciens formateurs"],
    formats: ["interview", "reportage", "podcast"],
    sport: "Football",
  },
  {
    id: "armand-angha-nouvelle-etape",
    title: "Armand Angha franchit une nouvelle étape dans sa carrière.",
    angle: "Mettre en perspective les choix, les apprentissages et les ambitions qui accompagnent cette nouvelle phase de carrière.",
    whyNow: "Une transition sportive récente offre un point d’entrée concret pour dresser un bilan et ouvrir la suite du récit.",
    profiles: ["Armand Angha", "Entraîneurs", "Coéquipiers"],
    formats: ["interview", "reaction", "podcast"],
    sport: "Football",
  },
  {
    id: "antoine-majeux-badminton",
    title: "Antoine Majeux, jeune visage du badminton fribourgeois.",
    angle: "Faire découvrir un jeune parcours local et les exigences d’une discipline encore peu présente dans les récits sportifs régionaux.",
    whyNow: "Sa progression permet d’incarner le renouvellement du badminton fribourgeois et de rendre visible un sport sous-représenté.",
    profiles: ["Antoine Majeux", "Entraîneurs", "Badminton fribourgeois"],
    formats: ["interview", "reportage", "images"],
    sport: "Badminton",
  },
  {
    id: "jeunes-athletes-pression",
    title: "Comment les jeunes athlètes apprennent à gérer la pression.",
    angle: "Donner la parole aux athlètes et à leur encadrement sur les outils concrets utilisés face aux attentes, aux résultats et à l’exposition.",
    whyNow: "La santé mentale et la performance durable occupent une place croissante dans l’accompagnement des jeunes sportifs.",
    profiles: ["Jeunes athlètes KLIQUE", "Préparateurs mentaux", "Entraîneurs"],
    formats: ["reportage", "interview", "podcast"],
    sport: "Multisports",
  },
  {
    id: "retour-apres-blessure",
    title: "Revenir à la compétition après une blessure.",
    angle: "Suivre le chemin physique et mental qui mène des premiers soins au retour en compétition, sans réduire la reprise au seul résultat.",
    whyNow: "Les périodes de reprise offrent des étapes observables et un récit utile sur la patience, le doute et la reconstruction.",
    profiles: ["Athlètes en reprise", "Staff médical", "Entraîneurs"],
    formats: ["reportage", "interview", "images", "podcast"],
    sport: "Multisports",
  },
  {
    id: "coulisses-media-day-klique",
    title: "Dans les coulisses d’un Media Day KLIQUE.",
    angle: "Montrer la préparation, les métiers et les décisions qui transforment une journée de production en contenus utiles aux athlètes.",
    whyNow: "Les prochains Media Days permettent de documenter le dispositif en situation réelle et de révéler le travail habituellement invisible.",
    profiles: ["Athlètes participants", "Équipe KLIQUE", "Photographes et vidéastes"],
    formats: ["reportage", "images", "interview"],
    sport: "Multisports",
  },
];

export function EditorialIdeasCatalog({ onUseIdea }: { onUseIdea: (idea: EditorialIdea) => void }) {
  return (
    <section aria-labelledby="editorial-ideas-title" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start" }}>
        <Lightbulb size={20} aria-hidden style={{ marginTop: "0.15rem", color: "#b45309", flex: "0 0 auto" }} />
        <div>
          <h2 id="editorial-ideas-title" style={{ margin: 0, fontSize: "1.15rem", color: "#111827" }}>
            Boîte à idées éditoriales
          </h2>
          <p style={{ margin: "0.3rem 0 0", color: "#6b7280", lineHeight: 1.55 }}>
            Des pistes internes pour préparer un brouillon de proposition, à compléter avant publication.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.85rem" }}>
        {EDITORIAL_IDEAS.map((idea) => (
          <article
            key={idea.id}
            style={{ display: "grid", gap: "0.75rem", alignContent: "start", padding: "1rem", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff" }}
          >
            <h3 style={{ margin: 0, color: "#111827", fontSize: "1rem", lineHeight: 1.4 }}>{idea.title}</h3>
            <div style={{ display: "grid", gap: "0.55rem", color: "#4b5563", fontSize: "0.9rem", lineHeight: 1.55 }}>
              <p style={{ margin: 0 }}><strong style={{ color: "#111827" }}>Angle journalistique :</strong> {idea.angle}</p>
              <p style={{ margin: 0 }}><strong style={{ color: "#111827" }}>Pourquoi maintenant :</strong> {idea.whyNow}</p>
              <p style={{ margin: 0 }}><strong style={{ color: "#111827" }}>Profils concernés :</strong> {idea.profiles.join(", ")}</p>
            </div>
            <div>
              <p style={{ margin: "0 0 0.4rem", color: "#111827", fontWeight: 700, fontSize: "0.9rem" }}>Formats possibles</p>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {idea.formats.map((format) => (
                  <Badge key={format} style={{ background: "#f3f4f6", color: "#374151", padding: "0.3rem 0.55rem" }}>
                    {MEDIA_REQUEST_TYPE_LABELS[format]}
                  </Badge>
                ))}
              </div>
            </div>
            <Button type="button" onClick={() => onUseIdea(idea)} style={{ justifySelf: "start" }}>
              Utiliser cette idée
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}