/**
 * SWR Fetcher utilities
 * Reusable fetcher functions for data fetching with SWR
 */

export class FetchError extends Error {
  status: number;
  info: unknown;

  constructor(message: string, status: number, info?: unknown) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.info = info;
  }
}

/**
 * Default fetcher for GET requests
 * Handles error responses and JSON parsing
 */
export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);

  if (!res.ok) {
    const info = await res.json().catch(() => null);
    throw new FetchError(
      info?.error || `Failed to fetch: ${res.statusText}`,
      res.status,
      info
    );
  }

  return res.json();
};

/**
 * POST fetcher for mutations
 */
export const postFetcher = async <T>(
  url: string,
  { arg }: { arg?: Record<string, unknown> }
): Promise<T> => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: arg ? JSON.stringify(arg) : undefined,
  });

  if (!res.ok) {
    const info = await res.json().catch(() => null);
    throw new FetchError(
      info?.error || `Failed to post: ${res.statusText}`,
      res.status,
      info
    );
  }

  return res.json();
};

/**
 * PATCH fetcher for updates
 */
export const patchFetcher = async <T>(
  url: string,
  { arg }: { arg: Record<string, unknown> }
): Promise<T> => {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });

  if (!res.ok) {
    const info = await res.json().catch(() => null);
    throw new FetchError(
      info?.error || `Failed to update: ${res.statusText}`,
      res.status,
      info
    );
  }

  return res.json();
};

/**
 * DELETE fetcher for deletions
 */
export const deleteFetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, {
    method: "DELETE",
  });

  if (!res.ok) {
    const info = await res.json().catch(() => null);
    throw new FetchError(
      info?.error || `Failed to delete: ${res.statusText}`,
      res.status,
      info
    );
  }

  return res.json();
};
