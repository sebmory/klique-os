export type TokenPrimitive = string | number;

export type TokenScale<T extends TokenPrimitive> = Readonly<Record<string, T>>;

export type TokenKeys<T extends TokenScale<TokenPrimitive>> = keyof T & string;

export type CssLength = `${number}px` | `${number}rem` | "0";
export type CssTime = `${number}ms` | `${number}s`;
export type CssEasing = `cubic-bezier(${number}, ${number}, ${number}, ${number})`;
