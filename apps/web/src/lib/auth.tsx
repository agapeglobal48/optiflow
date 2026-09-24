import { useState, type ReactNode } from "react";
import { api } from "./api";
import { getStoredSession, setStoredSession, clearStoredSession } from "./tokenStorage";
import { decodeAccessToken } from "./jwt";
import type { LoginResponse, SessionUser, DecodedAccessToken } from "@/types/auth";
import { AuthContext, type AuthContextValue } from "./authContext";

interface AuthState {
  user: SessionUser | null;
  claims: DecodedAccessToken | null;
}

const USER_STORAGE_KEY = "optiflow.user";

function loadStoredUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

// Reading localStorage is synchronous, so the initial auth state is
// computed once, lazily, as the useState initializer - no effect, no
// loading flash, no risk of a stale render before hydration runs.
function getInitialAuthState(): AuthState {
  const session = getStoredSession();
  const user = loadStoredUser();
  if (session && user) {
    return { user, claims: decodeAccessToken(session.accessToken) };
  }
  return { user: null, claims: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(getInitialAuthState);

  async function login(email: string, password: string) {
    const response = await api.post<LoginResponse>("/auth/login", { email, password });
    const { accessToken, refreshToken, user } = response.data;
    setStoredSession({ accessToken, refreshToken });
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    setState({ user, claims: decodeAccessToken(accessToken) });
  }

  async function logout() {
    const session = getStoredSession();
    clearStoredSession();
    localStorage.removeItem(USER_STORAGE_KEY);
    setState({ user: null, claims: null });
    if (session?.refreshToken) {
      // Best-effort - the whole point of a session list on the backend is
      // that a token invalidation failure here doesn't matter for THIS
      // browser (local state is already cleared), only for revocation of
      // that one refresh token, which naturally expires anyway.
      await api.post("/auth/logout", { refreshToken: session.refreshToken }).catch(() => {});
    }
  }

  function hasPermission(permission: string): boolean {
    return state.claims?.permissions.includes(permission) ?? false;
  }

  const value: AuthContextValue = {
    ...state,
    isAuthenticated: state.user !== null,
    hasPermission,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
