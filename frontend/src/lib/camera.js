// Camera setup for training rounds.
// Portrait 9:16 by default, so a round is ready for Reels and TikTok. The widest lens the phone
// has is used (the 0.5x ultra-wide on the back, the widest zoom on the front), so the whole body
// fits at 1.5-2 m instead of 3-4 m: a closer phone is louder and frames better.

export function cameraConstraints(facingMode, shape = "portrait", deviceId = null) {
  const portrait = shape !== "landscape";
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode }),
    width: { ideal: portrait ? 1080 : 1920 },
    height: { ideal: portrait ? 1920 : 1080 },
    aspectRatio: { ideal: portrait ? 9 / 16 : 16 / 9 },
    frameRate: { ideal: 30, max: 30 },
  };
}

// iPhones list each back lens separately once the camera is allowed ("Back Ultra Wide Camera").
export function ultraWideId(devices) {
  const cam = (devices || []).find((d) => d.kind === "videoinput" && /ultra[\s-]?wide|0[.,]5x/i.test(d.label || ""));
  return cam ? cam.deviceId : null;
}

// Zooms out as far as the lens allows, where the browser supports zoom (Android Chrome, newer iOS).
export async function widestZoom(stream) {
  const track = stream?.getVideoTracks?.()[0];
  const caps = track?.getCapabilities?.();
  if (!caps?.zoom || caps.zoom.min == null) return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
    return true;
  } catch {
    return false;
  }
}

export async function openTrainingCamera(facingMode, shape = "portrait") {
  const gum = (c) => navigator.mediaDevices.getUserMedia({ video: c, audio: false });
  let stream = await gum(cameraConstraints(facingMode, shape));
  if (facingMode === "environment") {
    try {
      const id = ultraWideId(await navigator.mediaDevices.enumerateDevices());
      if (id && stream.getVideoTracks()[0]?.getSettings?.().deviceId !== id) {
        const wide = await gum(cameraConstraints(facingMode, shape, id));
        stream.getTracks().forEach((t) => t.stop());
        stream = wide;
      }
    } catch {}
  }
  await widestZoom(stream);
  return stream;
}
