import { flattenTokens, themeTokenContract } from "./contract";

type SemanticVariableSet = Record<keyof typeof themeTokenContract.color.semantic.light, string>;
type SemanticThemeMap = Readonly<Record<string, SemanticVariableSet>>;

const toCssVariableName = (tokenName: string, prefix: string): string => {
  return `--${prefix}-${tokenName}`;
};

export const createCssVariableMap = (prefix = "kl"): Record<string, string> => {
  const flattened = flattenTokens(themeTokenContract);
  const variableMap: Record<string, string> = {};

  for (const [tokenName, tokenValue] of Object.entries(flattened)) {
    variableMap[toCssVariableName(tokenName, prefix)] = tokenValue;
  }

  return variableMap;
};

export const createRootThemeCss = (selector = ":root", prefix = "kl"): string => {
  const flattenedEntries = Object.entries(createCssVariableMap(prefix));
  const semanticEntries = Object.entries(
    createSemanticThemeVariables(themeTokenContract.color.semantic.light, prefix),
  );

  const declarationBlock = [...flattenedEntries, ...semanticEntries]
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `${selector} {\n${declarationBlock}\n}`;
};

const createSemanticThemeVariables = (
  variables: SemanticVariableSet,
  prefix = "kl",
): Record<string, string> => {
  const entries = Object.entries(variables) as Array<[keyof SemanticVariableSet, string]>;
  const map: Record<string, string> = {};

  for (const [name, value] of entries) {
    map[`--${prefix}-color-${name}`] = value;
  }

  return map;
};

const createCssBlock = (selector: string, variables: Record<string, string>): string => {
  const declarationBlock = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  return `${selector} {\n${declarationBlock}\n}`;
};

export const createSemanticThemeCss = (
  prefix = "kl",
  lightSelector = ":root",
  darkSelector = '[data-theme="dark"]',
): string => {
  const lightVars = createSemanticThemeVariables(themeTokenContract.color.semantic.light, prefix);
  const darkVars = createSemanticThemeVariables(themeTokenContract.color.semantic.dark, prefix);

  return [createCssBlock(lightSelector, lightVars), createCssBlock(darkSelector, darkVars)].join("\n\n");
};

export const createThemeCss = (
  themes: SemanticThemeMap,
  prefix = "kl",
  defaultTheme = "light",
): string => {
  const blocks: string[] = [];

  for (const [themeName, variables] of Object.entries(themes)) {
    const selector = themeName === defaultTheme ? ":root" : `[data-theme="${themeName}"]`;
    blocks.push(createCssBlock(selector, createSemanticThemeVariables(variables, prefix)));
  }

  return blocks.join("\n\n");
};

export const tokenVar = (tokenPath: string, prefix = "kl"): string => {
  const normalized = tokenPath.trim().replace(/\./g, "-");
  return `var(--${prefix}-${normalized})`;
};

export const kliqueCssVariableMap = createCssVariableMap();
export const kliqueRootThemeCss = createRootThemeCss();
export const kliqueSemanticThemeCss = createSemanticThemeCss();
export const kliqueThemesCss = createThemeCss(themeTokenContract.color.semantic as unknown as SemanticThemeMap);
