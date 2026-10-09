import { isChunkLoadError, loadWithReload } from "./lazyPage";

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test("recognises stale-chunk errors only", () => {
  expect(isChunkLoadError({ name: "ChunkLoadError", message: "Loading chunk 123 failed." })).toBe(true);
  expect(isChunkLoadError(new Error("Loading CSS chunk 9 failed"))).toBe(true);
  expect(isChunkLoadError(new TypeError("x is undefined"))).toBe(false);
});

test("a stale chunk after a deploy reloads once, then gives up", async () => {
  const storage = memoryStorage();
  const reload = jest.fn();
  const stale = () => Promise.reject({ name: "ChunkLoadError", message: "Loading chunk 7 failed." });
  loadWithReload(stale, { storage, reload }); // never settles: the page is reloading
  await Promise.resolve(); await Promise.resolve();
  expect(reload).toHaveBeenCalledTimes(1);
  await expect(loadWithReload(stale, { storage, reload })).rejects.toMatchObject({ name: "ChunkLoadError" });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("a successful load clears the flag and real errors are not swallowed", async () => {
  const storage = memoryStorage();
  storage.setItem("victory_chunk_reload", "1");
  await expect(loadWithReload(() => Promise.resolve({ default: "Page" }), { storage })).resolves.toEqual({ default: "Page" });
  expect(storage.getItem("victory_chunk_reload")).toBeNull();
  await expect(loadWithReload(() => Promise.reject(new TypeError("bug")), { storage, reload: jest.fn() })).rejects.toThrow("bug");
});
