import { themeTokenContract } from "./contract";
import { tokenVar } from "./css-variables";
import type { SemanticColorVariableName } from "../tokens";

type Primitive = string | number;

type JoinPath<K extends string, P extends string> = P extends "" ? K : `${K}-${P}`;

type LeafTokenPaths<T> = T extends Primitive
  ? ""
  : {
      [K in keyof T & string]: T[K] extends Primitive ? K : JoinPath<K, LeafTokenPaths<T[K]>>;
    }[keyof T & string];

export type ThemeTokenPath = LeafTokenPaths<typeof themeTokenContract>;

export type ThemeShortcutPath = `color-${SemanticColorVariableName}`;

export type ThemeReferencePath = ThemeTokenPath | ThemeShortcutPath;

export const tokenRef = (path: ThemeReferencePath | string, prefix = "kl"): string => {
  return tokenVar(path, prefix);
};
