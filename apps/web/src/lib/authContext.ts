import { createContext, useContext } from "react";
import type { SessionUser, DecodedAccessToken } from "@/types/auth";

export interface AuthContextValue {
  user: SessionUser | null;
  claims: DecodedAccessToken | null;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
