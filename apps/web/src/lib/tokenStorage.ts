// Access + refresh tokens live in localStorage, keyed under one namespaced
// object. This is a plain internal staff tool (not handling card numbers or
// similarly sensitive data), and the backend already uses short-lived
// (15min) access tokens plus opaque, rotating, hashed refresh tokens
// (see apps/api's Session model) specifically so a leaked token has a
// bounded blast radius - that trade-off is what makes localStorage
// acceptable here rather than reaching for httpOnly cookies + a CSRF
// scheme, which would need backend changes this phase doesn't make.
const STORAGE_KEY = "optiflow.session";

interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

export function getStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function setStoredSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
