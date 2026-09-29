import { noteEntry, currentEntry } from "./entrySource";

beforeEach(() => sessionStorage.clear());

test("a visit with no push link counts as direct", () => {
  expect(noteEntry("")).toBeNull();
  expect(currentEntry()).toMatchObject({ entry_source: "direct" });
});

test("a push link records its kind and is stripped from the URL, keeping other params", () => {
  const t0 = 1_000_000;
  expect(noteEntry("?focus=Footwork&src=booking", t0)).toBe("?focus=Footwork");
  expect(currentEntry(t0 + 30 * 60_000)).toEqual({ entry_source: "booking", entry_age_minutes: 30 });
});

test("later navigation doesn't overwrite what opened the app", () => {
  noteEntry("?src=callout", 0);
  noteEntry("?tab=home", 1000);
  expect(currentEntry(2000).entry_source).toBe("callout");
});

test("a later push tap replaces the earlier entry", () => {
  noteEntry("", 0);
  noteEntry("?src=weekly", 5000);
  expect(currentEntry(5000).entry_source).toBe("weekly");
});

test("junk in src is sanitised", () => {
  noteEntry("?src=<script>", 0);
  expect(currentEntry(0).entry_source).toBe("script");
});
