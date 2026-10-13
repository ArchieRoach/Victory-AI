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
