// Fire-and-forget messages to the App Store app's native layer
// (ios/VictoryAI/App/NativeBridges.swift). Outside the app these do nothing.
const post = (name, body) => {
  try {
    const handler = typeof window !== "undefined" && window.webkit?.messageHandlers?.[name];
    return handler ? Promise.resolve(handler.postMessage(body)).catch(() => null) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
};

export const nativeRound = (action, payload = {}) => post("victoryRound", { action, ...payload });
