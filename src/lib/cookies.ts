const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  // eslint-disable-next-line security/detect-non-literal-regexp -- `name` is always a hardcoded constant at each call site
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}
