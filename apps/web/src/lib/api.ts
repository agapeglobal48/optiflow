import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getStoredSession, setStoredSession, clearStoredSession } from "./tokenStorage";
import type { LoginResponse } from "@/types/auth";

// Same-origin "/api" in dev, thanks to vite.config.ts's proxy. In a real
// deployment (frontend on Vercel, API on Railway) the two are on different
// origins, so VITE_API_URL points at the API's real base, e.g.
// "https://optiflow-api.up.railway.app/api" - set at build time in Vercel's
// project settings. Falls back to the relative "/api" when unset.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({ baseURL: API_BASE_URL });

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const session = getStoredSession();
  if (!session) throw new Error("No refresh token available");

  // axios.create() default instance would recurse through this same
  // interceptor - use a bare axios call against the real origin instead.
  const response = await axios.post<LoginResponse>(`${API_BASE_URL}/auth/refresh`, { refreshToken: session.refreshToken });
  setStoredSession({ accessToken: response.data.accessToken, refreshToken: response.data.refreshToken });
  return response.data.accessToken;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const session = getStoredSession();
  if (session?.accessToken) {
    config.headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retried || originalRequest.url === "/auth/refresh") {
      throw error;
    }

    originalRequest._retried = true;

    try {
      // Single-flight: if several requests 401 at once (e.g. a whole
      // dashboard's worth of parallel queries), only refresh once and let
      // everyone else await the same in-flight promise.
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newAccessToken = await refreshPromise;
      originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
      return api(originalRequest);
    } catch {
      clearStoredSession();
      window.location.assign("/login");
      throw error;
    }
  },
);
