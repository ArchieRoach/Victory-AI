// Training settings that stick between sessions. Each one is on (or portrait) by default and only
// changes when the fighter changes it themselves.
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

// Creator Mode: the recording looks like a demo, not a dashboard (no guard/head stats on screen,
// big camera, combo in the bottom third). Off only after the fighter switches it off.
export const CREATOR_KEY = "victory_creator_mode";
export const creatorMode = () => read(CREATOR_KEY) !== "0";
export const setCreatorMode = (on) => write(CREATOR_KEY, on ? "1" : "0");

// Recording shape: portrait 9:16 for Reels and TikTok. Landscape only when chosen.
export const SHAPE_KEY = "victory_video_shape";
export const videoShape = () => (read(SHAPE_KEY) === "landscape" ? "landscape" : "portrait");
export const setVideoShape = (shape) => write(SHAPE_KEY, shape === "landscape" ? "landscape" : "portrait");

// Coach voice boost: the bell and other app sounds drop back so the calls stand out.
export const BOOST_KEY = "victory_voice_boost";
export const voiceBoost = () => read(BOOST_KEY) === "1";
export const setVoiceBoost = (on) => write(BOOST_KEY, on ? "1" : "0");

// The one-line earbuds tip before a round, until "Don't show again".
export const EARBUDS_TIP_KEY = "victory_earbuds_tip_hidden";
export const earbudsTipHidden = () => read(EARBUDS_TIP_KEY) === "1";
export const hideEarbudsTip = () => write(EARBUDS_TIP_KEY, "1");
