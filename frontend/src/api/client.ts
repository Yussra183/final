import { API_CONFIG, recoverBaseUrl } from "./config";
import { ApiError } from "./errors";

/** Resolves with the current bearer token (or null when unauthenticated). */
export type TokenProvider = () => string | null | Promise<string | null>;

/**
 * Thin, typed fetch client. Designed to be swapped for axios / ky / rn-fetch
 * later by reimplementing this single file.
 */
export class ApiClient {
  /**
   * Mutable on purpose — the network-recovery wrapper rebinds this
   * when it discovers a new reachable host (see
   * {@link requestWithNetworkRecovery}). All subsequent requests use
   * the freshly discovered URL until something else mutates it again.
   */
  private baseUrl: string;
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
    return this.requestWithNetworkRecovery<T>("GET", path, undefined, query);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithNetworkRecovery<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithNetworkRecovery<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithNetworkRecovery<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.requestWithNetworkRecovery<T>("DELETE", path);
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
   *
   * Goes through {@link uploadWithNetworkRecovery} so a transient
   * NETWORK failure (e.g. backend restarted on a new LAN IP) recovers
   * transparently rather than surfacing a hard error.
   */
  upload<T>(
    path: string,
    form: FormData,
    options?: { timeoutMs?: number; query?: Record<string, unknown> },
  ): Promise<T> {
    return this.uploadWithNetworkRecovery<T>(path, form, options);
  }

  /**
   * Internal multipart upload implementation. Marked `private` so the
   * public {@link upload} entry point can route through the network
   * recovery wrapper without callers bypassing it.
   */
  private async uploadImpl<T>(
    path: string,
    form: FormData,
    options?: { timeoutMs?: number; query?: Record<string, unknown> },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query);
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
        `Network request failed (${url}): ${
          (err as Error)?.message ?? "unknown error"
        }`,
        0,
        "NETWORK",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Network recovery -----------------------------------------------

  /**
   * Wraps {@link requestImpl} with a one-shot recovery: if the call
   * throws an {@link ApiError} with code `NETWORK`, we re-probe the
   * candidate list (see {@link recoverBaseUrl} in `config.ts`) and,
   * if a new reachable host is found, retry the original request once
   * against the updated `BASE_URL`.
   *
   * The recovery is intentionally bounded to a single retry so we
   * never silently mask a real backend outage — if the retry also
   * fails, the error propagates as a normal `NETWORK` ApiError.
   */
  private async requestWithNetworkRecovery<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    try {
      return await this.requestImpl<T>(method, path, body, query, options);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const recovered = await recoverBaseUrl();
      if (!recovered) throw err;
      // Refresh the singleton's baseUrl so the retry uses the freshly
      // discovered host. The next call goes through this same path
      // and rebuilds the URL from `API_CONFIG.BASE_URL` directly.
      this.baseUrl = recovered;
      return this.requestImpl<T>(method, path, body, query, options);
    }
  }

  /**
   * Same as {@link requestWithNetworkRecovery} but for the multipart
   * upload path. The seller-approval flow uses multipart on every
   * approve, so we want the same auto-recovery there.
   */
  private async uploadWithNetworkRecovery<T>(
    path: string,
    form: FormData,
    options?: { timeoutMs?: number; query?: Record<string, unknown> },
  ): Promise<T> {
    try {
      return await this.uploadImpl<T>(path, form, options);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const recovered = await recoverBaseUrl();
      if (!recovered) throw err;
      this.baseUrl = recovered;
      return this.uploadImpl<T>(path, form, options);
    }
  }

  // ---- Core request ----------------------------------------------------

  /**
   * Lowest-level request verb. Most callers go through {@link get},
   * {@link post}, etc. — exposed publicly so endpoints that need a
   * longer deadline (e.g. `refresh()` bulk-fetching 9 resources) can
   * pass `{ timeoutMs }` without bumping the singleton default.
   *
   * Marked `private` so the only public surface is the network-
   * recovery wrapper {@link requestWithNetworkRecovery}. Anything
   * that bypasses the recovery would re-introduce the hard
   * "Network request failed" surface on the first failed request
   * after a backend restart.
   */
  private async requestImpl<T>(
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

      // Diagnostic: trace the raw payload of the public seller
      // list endpoint so we can see whether `lat`/`lng` reach the
      // client, and what values they carry. Wrapped in __DEV__ so
      // this never ships to production bundles.
      const traceSellers =
        typeof __DEV__ !== "undefined" &&
        __DEV__ &&
        method === "GET" &&
        path === "/api/sellers";
      if (traceSellers) {
        console.info(
          "[SELLERS_API][REQUEST]",
          JSON.stringify({ method, url, hasToken: !!token }),
        );
      }

      // Diagnostic: trace the seller profile upsert so we can see
      // exactly what coordinates the seller profile page is sending
      // to /api/sellers/me and what the server returns. Wrapped in
      // __DEV__ so it never ships to production bundles.
      const traceSellerProfile =
        typeof __DEV__ !== "undefined" &&
        __DEV__ &&
        path === "/api/sellers/me";
      if (traceSellerProfile) {
        console.info(
          "[SELLER_PROFILE_API][REQUEST]",
          JSON.stringify({ method, url, hasToken: !!token, body }),
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

      if (traceSellers) {
        const rows = Array.isArray(data) ? data : [];
        console.info(
          "[SELLERS_API][RESPONSE]",
          JSON.stringify({
            method,
            url,
            status: res.status,
            ok: res.ok,
            elapsedMs: Date.now() - requestStartedAt,
            responseBytes: text.length,
            backendSellerCount: Array.isArray(data) ? data.length : null,
            sellers: rows.map((row) => ({
              sellerId:
                row && typeof row === "object" && "sellerId" in row
                  ? String((row as { sellerId: unknown }).sellerId)
                  : null,
              businessName:
                row && typeof row === "object" && "businessName" in row
                  ? String((row as { businessName: unknown }).businessName)
                  : null,
              lat:
                row && typeof row === "object" && "lat" in row
                  ? (row as { lat: unknown }).lat
                  : null,
              lng:
                row && typeof row === "object" && "lng" in row
                  ? (row as { lng: unknown }).lng
                  : null,
              openNow:
                row && typeof row === "object" && "openNow" in row
                  ? (row as { openNow: unknown }).openNow
                  : null,
            })),
            exactJson: text,
          }),
        );
      }

      if (traceSellerProfile) {
        console.info(
          "[SELLER_PROFILE_API][RESPONSE]",
          JSON.stringify({
            method,
            url,
            status: res.status,
            ok: res.ok,
            elapsedMs: Date.now() - requestStartedAt,
            responseBytes: text.length,
            data,
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

/**
 * True when an `ApiError` (or any thrown value) signals a connectivity
 * failure rather than a server-side rejection. Used by the network-
 * recovery wrapper to decide whether to re-probe for a reachable host
 * before giving up.
 *
 * The check is deliberately conservative: any 4xx / 5xx response from
 * the server is treated as authoritative — only the `NETWORK` /
 * `TIMEOUT` / `AUTH_TIMEOUT` synthetic codes (and a few raw fetch
 * failures) trigger recovery.
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return (
      err.code === "NETWORK" ||
      err.code === "TIMEOUT" ||
      err.code === "AUTH_TIMEOUT"
    );
  }
  // Raw `fetch()` rejections (no ApiError wrapping) are connectivity
  // failures — RN surfaces "Network request failed", web surfaces
  // "Load failed". Treat them as recoverable.
  const msg = (err as Error | undefined)?.message ?? "";
  return (
    msg.toLowerCase().includes("network request failed") ||
    msg.toLowerCase().includes("load failed") ||
    msg.toLowerCase().includes("failed to fetch")
  );
}

/** Re-bind the token provider after the user logs in/out. */
export function setTokenProvider(provider: TokenProvider) {
  // Re-create the singleton bound to the new provider.
  (api as unknown as { tokenProvider: TokenProvider }).tokenProvider = provider;
}
