export const ACCESS_SESSION_COOKIE = "klique_access_session";

const SESSION_SALT = "klique-access-v1";

const normalize = (value: unknown): string => String(value ?? "").trim();

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
};

const digestToHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const sha256 = async (input: string): Promise<string> => {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return digestToHex(digest);
};

export const getAccessUser = (): string => normalize(process.env.KLIQUE_ACCESS_USER);

export const getAccessPassword = (): string => normalize(process.env.KLIQUE_ACCESS_PASSWORD);

export const isAccessProtectionConfigured = (): boolean => {
  return Boolean(getAccessUser() && getAccessPassword());
};

export const buildAccessSessionToken = async (
  user: string,
  password: string
): Promise<string> => {
  return sha256(`${SESSION_SALT}:${user}:${password}`);
};

export const areAccessCredentialsValid = (user: string, password: string): boolean => {
  const expectedUser = getAccessUser();
  const expectedPassword = getAccessPassword();
  if (!expectedUser || !expectedPassword) return false;
  return safeEqual(normalize(user), expectedUser) && safeEqual(normalize(password), expectedPassword);
};

export const isAccessSessionValid = async (token: string | undefined): Promise<boolean> => {
  if (!token) return false;
  const user = getAccessUser();
  const password = getAccessPassword();
  if (!user || !password) return false;
  const expectedToken = await buildAccessSessionToken(user, password);
  return safeEqual(token, expectedToken);
};
