import { optimistic } from "./optimistic";

test("applies before the request resolves and keeps the change on success", async () => {
  const log = [];
  let resolve;
  const pending = optimistic({
    apply: () => log.push("apply"),
    rollback: () => log.push("rollback"),
    request: () => new Promise((r) => { log.push("request"); resolve = r; }),
  });
  expect(log).toEqual(["apply", "request"]);
  resolve("server says yes");
  await expect(pending).resolves.toEqual({ ok: true, data: "server says yes" });
  expect(log).toEqual(["apply", "request"]);
});

test("rolls back and reports when the server refuses", async () => {
  const log = [];
  const res = await optimistic({
    apply: () => log.push("apply"),
    rollback: () => log.push("rollback"),
    request: () => Promise.reject(new Error("nope")),
    onError: (e) => log.push(`error:${e.message}`),
  });
  expect(res.ok).toBe(false);
  expect(log).toEqual(["apply", "rollback", "error:nope"]);
});
