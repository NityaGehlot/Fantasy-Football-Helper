// app/backend/utils/ttlCache.ts
// In-memory TTL cache with request de-duplication for the backend.

type Entry = { value: unknown; expiresAt: number };

export function createTtlCache(now: () => number = () => Date.now()) {
  const store = new Map<string, Entry>();
  const inflight = new Map<string, Promise<unknown>>();

  async function get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    if (hit && hit.expiresAt > now()) return hit.value as T;

    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const request = loader()
      .then(value => {
        store.set(key, { value, expiresAt: now() + ttlMs });
        return value;
      })
      .catch(err => {
        if (hit) return hit.value as T; // serve stale data rather than failing
        throw err;
      })
      .finally(() => inflight.delete(key));

    inflight.set(key, request);
    return request;
  }

  return { get, clear: () => store.clear() };
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
