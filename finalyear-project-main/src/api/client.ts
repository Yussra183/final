import { API_CONFIG } from "./config";
import { ApiError } from "./errors";

/** Resolves with the current bearer token (or null when unauthenticated). */
export type TokenProvider = () => string | null | Promise<string | null>;

/**
 * Thin, typed fetch client. Designed to be swapped for axios / ky / rn-fetch
 * later by reimplementing this single file.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly tokenProvider: TokenProvider;

  constructor(opts?: {
    baseUrl?: string;
    timeoutMs?: number;
    tokenProvider?: TokenProvider;
  }) {
    this.baseUrl = opts?.baseUrl ?? API_CONFIG.BASE_URL;
    this.timeoutMs = opts?.timeoutMs ?? API_CONFIG.TIMEOUT_MS;
    this.tokenProvider =
      opts?.tokenProvider ?? (() => null);
  }

  // ---- Public verbs ----------------------------------------------------

  get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, undefined, query);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  // ---- Core request ----------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const token = await this.tokenProvider();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Api-Version": API_CONFIG.API_VERSION,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      const data = text ? safeJsonParse(text) : undefined;

      if (!res.ok) {
        const message =
          (data && typeof data === "object" && "message" in data
            ? String((data as { message: unknown }).message)
            : null) ?? `Request failed: ${res.status}`;
        const code =
          data && typeof data === "object" && "code" in data
            ? String((data as { code: unknown }).code)
            : undefined;
        throw new ApiError(message, res.status, code, data);
      }

      return data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if ((err as Error)?.name === "AbortError") {
        throw new ApiError("Request timed out", 0, "TIMEOUT");
      }
      throw new ApiError(
        (err as Error)?.message ?? "Network error",
        0,
        "NETWORK",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const base = this.baseUrl.replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!query) return `${base}${cleanPath}`;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${base}${cleanPath}?${qs}` : `${base}${cleanPath}`;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Default singleton — bind a token provider from the store at app boot. */
export const api = new ApiClient();

/** Re-bind the token provider after the user logs in/out. */
export function setTokenProvider(provider: TokenProvider) {
  // Re-create the singleton bound to the new provider.
  (api as unknown as { tokenProvider: TokenProvider }).tokenProvider = provider;
}
