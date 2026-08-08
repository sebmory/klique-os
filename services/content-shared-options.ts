export type SharedSelectableOption = {
  id: string;
  label: string;
  description: string;
};

export const CONTENT_TONE_OPTIONS: SharedSelectableOption[] = [
  { id: "institutional", label: "Institutionnel", description: "Cadre officiel et message maitrise." },
  { id: "journalistic", label: "Journalistique", description: "Questions precises et angle editorial." },
  { id: "authentic", label: "Authentique", description: "Voix naturelle et sincere." },
  { id: "inspiring", label: "Inspirant", description: "Narration motivee et orientee impact." },
  { id: "dynamic", label: "Dynamique", description: "Rythme rapide et energie marquee." },
  { id: "casual", label: "Decontracte", description: "Ton leger et conversationnel." },
  { id: "emotional", label: "Emotionnel", description: "Accent sur l emotion et le ressenti." },
  { id: "premium", label: "Premium", description: "Positionnement haut de gamme et exigeant." },
  { id: "direct", label: "Direct", description: "Message concis et frontal." },
  { id: "sober", label: "Sobre", description: "Style epure et factuel." },
  { id: "humorous", label: "Humoristique", description: "Ton leger avec touches d humour." },
  { id: "free", label: "Libre", description: "Ajustement complet du style." },
];

export const CONTENT_AUDIENCE_OPTIONS: SharedSelectableOption[] = [
  { id: "supporters", label: "Supporters", description: "Communaute fans et proximite." },
  { id: "journalists", label: "Journalistes", description: "Attentes medias et points factuels." },
  { id: "sponsors", label: "Sponsors", description: "Valeur de partenariat et image." },
  { id: "general", label: "Grand public", description: "Narration accessible a tous." },
  { id: "youth", label: "Jeunes", description: "Format direct et pedagogique." },
  { id: "professionals", label: "Professionnels", description: "Approche experte et structuree." },
  { id: "community", label: "Communaute", description: "Dialogue avec la communaute engagee." },
  { id: "partners", label: "Partenaires", description: "Communication orientee partenariat." },
  { id: "media", label: "Medias", description: "Traitement presse et media." },
  { id: "free", label: "Libre", description: "Audience personnalisee." },
];

export const getSharedOptionLabel = (options: SharedSelectableOption[], id: string): string => {
  const found = options.find((option) => option.id === id);
  return found?.label ?? id;
};
