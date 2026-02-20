import axios from "axios";
import { getAccessToken, clearTokens } from "../lib/authStorage";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

function resolveApiBaseUrl() {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const defaultBase = `${window.location.protocol}//${window.location.hostname}:8081`;
  const base = raw && raw.length > 0 ? raw : defaultBase;
  const sanitized = base.replace(/\/+$/, "");
  return sanitized.endsWith("/api") ? sanitized : `${sanitized}/api`;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    "Content-Type": "application/json"
  }
});

export async function requestWithFallback<T = unknown>(
  method: HttpMethod,
  url: string,
  data?: unknown,
  fallbackUrls: string[] = []
) {
  let lastError: unknown;
  for (const candidate of [url, ...fallbackUrls]) {
    try {
      return await api.request<T>({ method, url: candidate, data });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error("request failed");
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearTokens();
      const path = window.location.pathname;
         if (path !== "/login" && path !== "/reset-password" && !path.startsWith("/register")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
