import { getVideoPref, setVideoPref } from "./videoPref";

beforeEach(() => localStorage.clear());

test("unanswered until the fighter chooses", () => {
  expect(getVideoPref()).toBeNull();
});

test("remembers on and off", () => {
  setVideoPref(true);
  expect(getVideoPref()).toBe("on");
  setVideoPref(false);
  expect(getVideoPref()).toBe("off");
});

test("ignores junk values", () => {
  localStorage.setItem("victory_record_video", "maybe");
  expect(getVideoPref()).toBeNull();
});
