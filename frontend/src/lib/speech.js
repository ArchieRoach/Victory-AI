// Spoken coaching (combo calls, Live Coach cues).
// iPhone Safari stays silent unless speech is started inside a tap, and the Web Speech
// voice follows the silent switch. unlockSpeech() runs on the Start tap: it asks for the
// "playback" audio session (so calls play like music, not like a ringtone) and speaks an
// empty line so every later call is allowed.

let unlocked = false;

export function unlockSpeech() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  try {
    const synth = window.speechSynthesis;
    if (!synth || unlocked) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
    unlocked = true;
  } catch {}
}

export function say(text, { rate = 1.1, interrupt = false } = {}) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    if (interrupt) synth.cancel();
    if (synth.paused) synth.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.volume = 1;
    synth.speak(u);
  } catch {}
}

export const _resetSpeech = () => { unlocked = false; };
