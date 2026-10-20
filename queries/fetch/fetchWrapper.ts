import { API_ROOT } from "@/constants/api-root";
import { API_KEY } from "@/constants/api-key";
import { MirloFetchError } from "./MirloFetchError";
import * as SecureStorage from "expo-secure-store";

/**
 * Headers that identify the app and the logged-in user to Mirlo's API.
 * File downloads use these too, so they authenticate exactly like API calls.
 */
export async function mirloHeaders(): Promise<Record<string, string>> {
  const jwtToken = await SecureStorage.getItemAsync("jwt");
  const refreshToken = await SecureStorage.getItemAsync("refresh");
  const headers: Record<string, string> = {};

  let cookieHeader = "";
  if (jwtToken) cookieHeader += `jwt=${jwtToken}; `;
  if (refreshToken) cookieHeader += `refresh=${refreshToken}`;
  if (cookieHeader) headers["Cookie"] = cookieHeader;
  if (jwtToken) headers["x-mirlo-jwt"] = jwtToken;
  if (refreshToken) headers["x-mirlo-refresh"] = refreshToken;
  if (API_KEY) headers["mirlo-api-key"] = API_KEY;
  return headers;
}

// A request that hasn't answered by now is treated as failed, so a stalled connection
// shows an error instead of leaving the app waiting forever
const REQUEST_TIMEOUT_MS = 10_000;

// Sends the request and reads the whole response, giving up if that takes too long
async function fetchWithTimeout(endpoint: string, init: RequestInit) {
  // One controller carries both the caller's cancellation and the time limit
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener("abort", () => controller.abort());

  try {
    const res = await fetch(`${API_ROOT}${endpoint}`, { ...init, signal: controller.signal });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Wraps fetch() calls to Mirlo's API with error handling.
 *
 * @param endpoint The API request path (appended to API_ROOT)
 * @param init Fetch request options
 * @returns The resolved JSON response
 * @throws MirloFetchError if the response code is not OK
 * @throws SyntaxError if the response body is not JSON
 */
async function fetchWrapper<R>(
  endpoint: string,
  init: RequestInit,
): Promise<R> {
  const headers = new Headers(init.headers);
  Object.entries(await mirloHeaders()).forEach(([key, value]) => headers.append(key, value));

  const { res, text } = await fetchWithTimeout(endpoint, { ...init, headers });

  if (!res.ok) {
    // Opportunistically JSON-parse the body text for the error message
    let message: string = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") message = parsed.error;
    } catch {
      // not JSON — keep the raw text as the message
    }
    throw new MirloFetchError(res, message);
  }

  try {
    return JSON.parse(text);
  } catch {
    // If it's not JSON, return the raw text
    // or wrap it in an object
    return text as any;
  }
}

/**
 * Wraps fetch() POST calls to Mirlo's API with error handling.
 *
 * @param endpoint The API request path (appended to API_ROOT)
 * @param body The JSON-encoded request body
 * @param init Fetch request options
 * @returns The resolved JSON response
 * @throws MirloFetchError if the response code is not OK
 * @throws SyntaxError if the response body is not JSON
 */
export function post<T, R>(
  endpoint: string,
  body: T,
  init: RequestInit = {},
): Promise<R> {
  return fetchWrapper(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    ...init,
  });
}

/**
 * Wraps fetch() GET calls to Mirlo's API with error handling.
 *
 * @param endpoint The API request path (appended to API_ROOT)
 * @param init Fetch request options
 * @returns The resolved JSON response
 * @throws MirloFetchError if the response code is not OK
 * @throws SyntaxError if the response body is not JSON
 */
export function get<R>(endpoint: string, init: RequestInit): Promise<R> {
  return fetchWrapper(endpoint, {
    method: "GET",
    ...init,
  });
}

export function put<T, R>(endpoint: string, body: T): Promise<R> {
  return fetchWrapper(endpoint, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export function getMany<R>(
  endpoint: string,
  init: RequestInit,
  query?: { [key: string]: string },
): Promise<{ results: R[]; total?: number }> {
  const fullEndpoint = convertQueryToSeachParams(endpoint, query);

  return fetchWrapper(fullEndpoint, {
    method: "GET",
    ...init,
  });
}
function convertQueryToSeachParams(
  endpoint: string,
  query?: { [key: string]: string },
) {
  if (query) {
    const searchParams = new URLSearchParams();
    Object.keys(query).forEach((key) => {
      searchParams.set(key, query[key]);
    });
    return endpoint + "?" + searchParams.toString();
  }
  return endpoint;
}
