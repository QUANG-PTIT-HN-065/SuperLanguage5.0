import {
  API_BASE_URL,
  type ApiRequestOptions,
  type ApiResponse,
  getValidAccessToken,
  handleSessionExpired,
  parseResponse,
  refreshAccessToken,
} from "./api-client.js";

const LOCAL_AI_URL = (
  import.meta.env.VITE_LOCAL_AI_URL || "https://ai-local.superlanguage.me"
).replace(/\/+$/, "");

const HEALTH_TIMEOUT_MS = 1500;
const HEALTH_CACHE_TTL_MS = 30_000;

let cachedLocalHealthy: boolean | null = null;
let healthCacheExpiresAt = 0;

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

export function invalidateAiHealthCache(): void {
  cachedLocalHealthy = null;
  healthCacheExpiresAt = 0;
}

/**
 * Ping Local AI Worker (GET /health) with a 1500ms timeout and 30s cache.
 * Falls back to Render API URL if local worker is offline or unreachable.
 */
export async function resolveAiBaseUrl(
  forceCheck = false,
): Promise<{ baseUrl: string; isLocal: boolean }> {
  const now = Date.now();
  if (!forceCheck && cachedLocalHealthy !== null && now < healthCacheExpiresAt) {
    return {
      baseUrl: cachedLocalHealthy ? LOCAL_AI_URL : API_BASE_URL,
      isLocal: cachedLocalHealthy,
    };
  }

  if (!LOCAL_AI_URL) {
    cachedLocalHealthy = false;
    healthCacheExpiresAt = now + HEALTH_CACHE_TTL_MS;
    return { baseUrl: API_BASE_URL, isLocal: false };
  }

  try {
    const response = await fetch(`${LOCAL_AI_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const healthy = response.ok;
    cachedLocalHealthy = healthy;
    healthCacheExpiresAt = Date.now() + HEALTH_CACHE_TTL_MS;
    return {
      baseUrl: healthy ? LOCAL_AI_URL : API_BASE_URL,
      isLocal: healthy,
    };
  } catch {
    cachedLocalHealthy = false;
    healthCacheExpiresAt = Date.now() + HEALTH_CACHE_TTL_MS;
    return { baseUrl: API_BASE_URL, isLocal: false };
  }
}

async function sendToTarget(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions,
  token: string | null,
): Promise<Response> {
  const { anonymous: _anonymous, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  if (isFormData(requestOptions.body)) headers.delete("Content-Type");
  else headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${baseUrl}${path}`, {
    ...requestOptions,
    headers,
    body:
      requestOptions.body === undefined
        ? undefined
        : isFormData(requestOptions.body)
          ? requestOptions.body
          : JSON.stringify(requestOptions.body),
  });
}

/**
 * Smart AI Router:
 * - Prefers Local AI Worker (Windows 11 + Cloudflare Tunnel) when /health responds 200 within 1.5s.
 * - Automatically falls back to Render Cloud API if Local Worker times out, errors, or returns 5xx.
 * - Proactively refreshes expired Supabase JWTs before sending requests.
 */
export async function smartAiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
  allowRefresh = true,
): Promise<ApiResponse<T>> {
  const { anonymous = false } = options;
  let token = anonymous ? null : await getValidAccessToken();
  const target = await resolveAiBaseUrl();

  let response: Response;
  let usedLocal = target.isLocal;

  try {
    response = await sendToTarget(target.baseUrl, path, options, token);
    if (usedLocal && response.status >= 500) {
      invalidateAiHealthCache();
      usedLocal = false;
      response = await sendToTarget(API_BASE_URL, path, options, token);
    }
  } catch (err) {
    if (usedLocal) {
      invalidateAiHealthCache();
      usedLocal = false;
      response = await sendToTarget(API_BASE_URL, path, options, token);
    } else {
      throw err;
    }
  }

  if (response.status === 401 && !anonymous) {
    if (!token) {
      handleSessionExpired();
      throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
    if (allowRefresh) {
      token = await refreshAccessToken(token);
      return smartAiRequest<T>(path, options, false);
    }
  }

  return parseResponse<T>(response);
}
