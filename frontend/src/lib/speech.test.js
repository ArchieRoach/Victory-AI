import { unlockSpeech, say, _resetSpeech } from "./speech";

beforeEach(() => {
  _resetSpeech();
  global.SpeechSynthesisUtterance = function (text) { this.text = text; };
  window.speechSynthesis = { speak: jest.fn(), cancel: jest.fn(), resume: jest.fn(), paused: false };
});

test("the Start tap unlocks speech once and asks for the playback audio session", () => {
  navigator.audioSession = { type: "auto" };
  unlockSpeech();
  unlockSpeech();
  expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  expect(navigator.audioSession.type).toBe("playback");
});

test("a new combo call cuts off the one still being spoken", () => {
  say("1, 2", { interrupt: true });
  expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  expect(window.speechSynthesis.speak.mock.calls[0][0].text).toBe("1, 2");
});

describe("natural voice clips", () => {
  const { setVoiceSource, primeVoice, hasClip, pickFallbackVoice } = require("./speech");
  let played;

  beforeEach(() => {
    played = [];
    global.Audio = function () {
      this.paused = true;
      this.ended = false;
      this.addEventListener = () => {};
      this.play = () => { played.push(this.src); return Promise.resolve(); };
      this.pause = () => {};
    };
    global.fetch = jest.fn(() => Promise.resolve({ blob: () => Promise.resolve("blob") }));
    global.URL.createObjectURL = jest.fn((b) => `blob:${b}`);
    navigator.audioSession = { type: "auto" };
  });

  test("a line with a clip plays the clip, not the robot voice", async () => {
    setVoiceSource(async (texts) => ({ clips: Object.fromEntries(texts.map((t) => [t, `https://cdn/${t}.mp3`])) }));
    await primeVoice(["Jab, Cross"]);
    expect(hasClip("Jab, Cross")).toBe(true);
    unlockSpeech();
    say("Jab, Cross", { interrupt: true });
    expect(played[played.length - 1]).toBe("blob:blob");
    expect(window.speechSynthesis.speak.mock.calls.filter((c) => c[0].text === "Jab, Cross")).toHaveLength(0);
  });

  test("a line without a clip is spoken now and fetched for next time", async () => {
    const source = jest.fn(async () => ({ clips: {} }));
    setVoiceSource(source);
    unlockSpeech();
    say("Hands up");
    expect(window.speechSynthesis.speak.mock.calls.some((c) => c[0].text === "Hands up")).toBe(true);
    expect(source).toHaveBeenCalledWith(["Hands up"]);
  });

  test("the fallback prefers enhanced, deeper English voices", () => {
    const v = pickFallbackVoice([
      { name: "Samantha", lang: "en-US" },
      { name: "Daniel", lang: "en-GB" },
      { name: "Thomas", lang: "fr-FR" },
      { name: "Daniel (Enhanced)", lang: "en-GB" },
    ]);
    expect(v.name).toBe("Daniel (Enhanced)");
    expect(pickFallbackVoice([])).toBeNull();
  });
});
