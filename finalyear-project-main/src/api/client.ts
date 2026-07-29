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

  /**
   * Multipart upload. Unlike {@link post} this builds a
   * `multipart/form-data` envelope and lets the caller attach a real
   * `File` / `Blob`. The browser's standard `fetch` accepts the
   * {@link FormData} body and sets `Content-Type` automatically; do NOT
   * set it manually or the boundary gets stripped.
   *
   * The default deadline is `API_CONFIG.UPLOAD_TIMEOUT_MS` so a
   * connection on a slow network can finish uploading without being
   * killed by the JSON-RPC budget.
   */
  async upload<T>(path: string, form: FormData, options?: { timeoutMs?: number }): Promise<T> {
    const url = this.buildUrl(path);
    const deadline = options?.timeoutMs ?? API_CONFIG.UPLOAD_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadline);

    let token: string | null;
    try {
      token = await Promise.race<string | null>([
        Promise.resolve(this.tokenProvider()),
        new Promise<string | null>((_, reject) =>
          setTimeout(
            () => reject(new ApiError("Auth timeout", 0, "AUTH_TIMEOUT")),
            Math.min(2_000, deadline),
          ),
        ),
      ]);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }

    // Log the request envelope — invaluable when debugging silent
    // multipart failures on a physical device.
    console.info(
      "[api.upload] request",
      JSON.stringify({ url, method: "POST", hasToken: !!token }),
    );

    try {
      const res = await fetch(url, {
        method: "POST",
        // Intentionally do NOT set `Content-Type` — the browser adds the
        // correct `multipart/form-data; boundary=…` header automatically
        // when the body is a `FormData` instance.
        headers: {
          Accept: "application/json",
          "X-Api-Version": API_CONFIG.API_VERSION,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
        signal: controller.signal,
      });
      const text = await res.text();
      const data = text ? safeJsonParse(text) : undefined;
      console.info(
        "[api.upload] response",
        JSON.stringify({
          url,
          status: res.status,
          ok: res.ok,
          responseBytes: text.length,
          body: data,
        }),
      );
      if (!res.ok) {
        const message =
          (data && typeof data === "object" && "message" in data
            ? String((data as { message: unknown }).message)
            : null) ?? `Upload failed: ${res.status}`;
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
        throw new ApiError(
          `Upload timed out after ${Math.round(deadline / 1000)}s`,
          0,
          "TIMEOUT",
        );
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

  // ---- Core request ----------------------------------------------------

  /**
   * Lowest-level request verb. Most callers go through {@link get},
   * {@link post}, etc. — exposed publicly so endpoints that need a
   * longer deadline (e.g. `refresh()` bulk-fetching 9 resources) can
   * pass `{ timeoutMs }` without bumping the singleton default.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const deadline = options?.timeoutMs ?? this.timeoutMs;
    const traceRiderOrders =
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      method === "GET" &&
      path === "/api/orders";
    const requestStartedAt = Date.now();

    // Set up the AbortController + timer BEFORE any await, so the
    // timeout budget starts ticking the moment this call begins, not
    // after resolving the auth token (which on cold start can take
    // hundreds of milliseconds on its own and could push otherwise
    // well-behaved requests past their deadline).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadline);

    let token: string | null;
    try {
      token = await Promise.race<string | null>([
        Promise.resolve(this.tokenProvider()),
        new Promise<string | null>((_, reject) =>
          setTimeout(
            () => reject(new ApiError("Auth timeout", 0, "AUTH_TIMEOUT")),
            Math.min(2_000, deadline),
          ),
        ),
      ]);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }

    try {
      if (traceRiderOrders) {
        console.info(
          "[RIDER_ORDERS][API_REQUEST]",
          JSON.stringify({ method, url, hasToken: !!token }),
        );
      }

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

      if (traceRiderOrders) {
        const rows = Array.isArray(data) ? data : [];
        console.info(
          "[RIDER_ORDERS][API_RESPONSE]",
          JSON.stringify({
            method,
            url,
            status: res.status,
            ok: res.ok,
            elapsedMs: Date.now() - requestStartedAt,
            responseBytes: text.length,
            backendOrderCount: Array.isArray(data) ? data.length : null,
            orderIds: rows.map((row) =>
              row && typeof row === "object" && "id" in row
                ? String((row as { id: unknown }).id)
                : null,
            ),
            exactJson: text,
          }),
        );
      }

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
        throw new ApiError(
          `Request timed out after ${Math.round(deadline / 1000)}s`,
          0,
          "TIMEOUT",
        );
      }
      // The fetch() error message is platform-specific ("Network request
      // failed" on RN, "Load failed" on web). Augment it with the URL
      // that failed so the user / dev can see exactly which backend was
      // unreachable — fixes the classic "why is my login broken" mystery
      // when BASE_URL points at the wrong LAN IP.
      const rawMessage = (err as Error)?.message ?? "Network error";
      throw new ApiError(
        `Could not reach backend at ${url}: ${rawMessage}. ` +
          `Set EXPO_PUBLIC_API_BASE_URL or update src/api/config.ts.`,
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
