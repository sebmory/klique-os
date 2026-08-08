"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { semanticColorVariables } from "../tokens";
import { createRootThemeCss, createThemeCss } from "./css-variables";

type SemanticVariableSet = Record<keyof (typeof semanticColorVariables)["light"], string>;
type ThemeMap = Readonly<Record<string, SemanticVariableSet>>;

type ThemeContextValue = {
  theme: string;
  themes: ThemeMap;
  setTheme: (theme: string) => void;
  isDark: boolean;
};

const defaultThemes = semanticColorVariables as unknown as ThemeMap;
const defaultThemeName = "light";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  children: ReactNode;
  initialTheme?: string;
  themes?: ThemeMap;
  prefix?: string;
  storageKey?: string;
};

export const ThemeProvider = ({
  children,
  initialTheme = defaultThemeName,
  themes,
  prefix = "kl",
  storageKey = "klique-theme",
}: ThemeProviderProps) => {
  const mergedThemes = useMemo<ThemeMap>(() => ({ ...defaultThemes, ...(themes ?? {}) }), [themes]);

  const safeInitialTheme = mergedThemes[initialTheme] ? initialTheme : defaultThemeName;
  const [theme, setThemeState] = useState<string>(() => {
    if (typeof window === "undefined") {
      return safeInitialTheme;
    }

    const fromStorage = window.localStorage.getItem(storageKey);
    if (fromStorage && mergedThemes[fromStorage]) {
      return fromStorage;
    }

    return safeInitialTheme;
  });

  const cssText = useMemo(() => {
    const rootCss = createRootThemeCss(":root", prefix);
    const themesCss = createThemeCss(mergedThemes, prefix, defaultThemeName);
    return `${rootCss}\n\n${themesCss}`;
  }, [mergedThemes, prefix]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(storageKey, theme);
  }, [storageKey, theme]);

  const setTheme = useCallback(
    (nextTheme: string) => {
      if (!mergedThemes[nextTheme]) {
        return;
      }

      setThemeState(nextTheme);
    },
    [mergedThemes],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themes: mergedThemes,
      setTheme,
      isDark: theme === "dark",
    }),
    [mergedThemes, setTheme, theme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <style data-klique-theme={prefix}>{cssText}</style>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
};
