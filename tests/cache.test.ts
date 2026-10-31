import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache, type CacheStorage } from "../app/services/cache";

const memoryStorage = (): CacheStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async k => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async k => void data.delete(k),
  };
};

test("returns cached value within TTL without calling the loader again", async () => {
  let clock = 0;
  const cache = createCache({ now: () => clock });
  let calls = 0;
  const loader = async () => ++calls;

  assert.equal(await cache.get("k", 1000, loader), 1);
  clock = 999;
  assert.equal(await cache.get("k", 1000, loader), 1);
  assert.equal(calls, 1);

  clock = 1001;
  assert.equal(await cache.get("k", 1000, loader), 2);
});

test("concurrent requests for the same key share one network call", async () => {
  const cache = createCache();
  let calls = 0;
  const loader = () => new Promise<number>(r => setTimeout(() => r(++calls), 10));
  const results = await Promise.all([cache.get("k", 1000, loader), cache.get("k", 1000, loader), cache.get("k", 1000, loader)]);
  assert.deepEqual(results, [1, 1, 1]);
  assert.equal(calls, 1);
});

test("falls back to the last good value when a refresh fails", async () => {
  let clock = 0;
  const cache = createCache({ now: () => clock });
  await cache.get("k", 10, async () => "good");
  clock = 100;
  assert.equal(await cache.get("k", 10, async () => { throw new Error("rate limited"); }), "good");
});

test("throws when there is no value to fall back to", async () => {
  const cache = createCache();
  await assert.rejects(cache.get("k", 10, async () => { throw new Error("boom"); }), /boom/);
});

test("persisted values survive a new cache instance (app reload)", async () => {
  const storage = memoryStorage();
  const first = createCache({ storage, now: () => 0 });
  await first.get("league:1:info", 1000, async () => ({ name: "My League" }), { persist: true });

  const second = createCache({ storage, now: () => 500 });
  let called = false;
  const value = await second.get("league:1:info", 1000, async () => { called = true; return null; }, { persist: true });
  assert.deepEqual(value, { name: "My League" });
  assert.equal(called, false);
});

test("non-persisted values are not written to storage", async () => {
  const storage = memoryStorage();
  const cache = createCache({ storage });
  await cache.get("players", 1000, async () => "big");
  assert.equal(storage.data.size, 0);
});

test("force bypasses the cache and invalidate clears matching keys", async () => {
  const storage = memoryStorage();
  const cache = createCache({ storage });
  let n = 0;
  const loader = async () => ++n;
  await cache.get("league:1:rosters", 1000, loader, { persist: true });
  assert.equal(await cache.get("league:1:rosters", 1000, loader, { force: true, persist: true }), 2);

  await cache.get("league:2:rosters", 1000, loader);
  await cache.invalidate("league:1");
  assert.equal(await cache.get("league:1:rosters", 1000, loader, { persist: true }), 4);
  assert.equal(await cache.get("league:2:rosters", 1000, loader), 3);
});
