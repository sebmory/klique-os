export const editorialRulesVersion = "editorial-rules-v1";

export const editorialRules = [
  "Privilegier les questions ouvertes lorsque cela est pertinent.",
  "Eviter les cliches et les formulations generiques creuses.",
  "Eviter les repetitions d angle, de sujet ou de formulation.",
  "Varier les formulations et la structure des questions.",
  "Produire des relances pertinentes et concretes.",
  "Adapter le contenu au sport ou au secteur du sujet.",
  "Adapter le niveau de detail au public cible.",
  "Respecter rigoureusement le ton editorial demande.",
  "Ne jamais inventer un fait, un resultat, un club, une blessure, un partenaire, un transfert, une citation ou une actualite.",
  "Distinguer les faits confirmes des suggestions editoriales.",
  "Produire des idees concretes et directement exploitables.",
  "Preparer les declinaisons sociales a partir du contenu principal.",
  "Si l information est absente, poser une question generique plutot que supposer un fait.",
] as const;

export const buildEditorialRulesBlock = (): string => {
  return editorialRules.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
};
