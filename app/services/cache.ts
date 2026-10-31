// app/services/cache.ts
// Small TTL cache used to keep the app from re-requesting the same Sleeper / GitHub data.
// - In-memory hits are instant.
// - Optional persistence (AsyncStorage on device, localStorage on web) survives reloads.
// - Concurrent requests for the same key share one network call.
// - If a refresh fails, the last good value is returned instead of an error.

export type CacheStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type Entry = { value: unknown; expiresAt: number };

export type CacheGetOptions = {
  // Save to storage so the value survives an app reload. Keep off for very large payloads.
  persist?: boolean;
  // Skip any cached value and refetch (the result still gets cached).
  force?: boolean;
};

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

export function createCache({
  storage,
  prefix = "ffh_cache_v1:",
  now = () => Date.now(),
}: {
  storage?: CacheStorage | null;
  prefix?: string;
  now?: () => number;
} = {}) {
  const memory = new Map<string, Entry>();
  const inflight = new Map<string, Promise<unknown>>();

  const readStorage = async (key: string): Promise<Entry | null> => {
    if (!storage) return null;
    try {
      const raw = await storage.getItem(prefix + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Entry;
      return typeof parsed?.expiresAt === "number" ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeStorage = async (key: string, entry: Entry) => {
    if (!storage) return;
    try {
      await storage.setItem(prefix + key, JSON.stringify(entry));
    } catch {
      // Quota exceeded or storage unavailable: memory cache still works.
    }
  };

  async function get<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    { persist = false, force = false }: CacheGetOptions = {}
  ): Promise<T> {
    let stale: Entry | null = memory.get(key) ?? null;

    if (!force) {
      if (stale && stale.expiresAt > now()) return stale.value as T;

      if (persist) {
        const stored = await readStorage(key);
        if (stored) {
          memory.set(key, stored);
          if (stored.expiresAt > now()) return stored.value as T;
          stale = stored;
        }
      }
    }

    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const request = (async () => {
      try {
        const value = await loader();
        const entry = { value, expiresAt: now() + ttlMs };
        memory.set(key, entry);
        if (persist) await writeStorage(key, entry);
        return value;
      } catch (err) {
        if (stale) return stale.value as T;
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, request);
    return request;
  }

  // Drop every cached key that starts with `keyPrefix` (or everything when omitted).
  async function invalidate(keyPrefix = ""): Promise<void> {
    const keys = [...memory.keys()].filter(k => k.startsWith(keyPrefix));
    keys.forEach(k => memory.delete(k));
    if (storage) {
      await Promise.all(keys.map(k => storage.removeItem(prefix + k).catch(() => undefined)));
    }
  }

  return { get, invalidate };
}

export type Cache = ReturnType<typeof createCache>;
