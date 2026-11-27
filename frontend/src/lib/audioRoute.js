import { post } from "@/lib/nativeBridge";

const EARBUD_NAMES = /airpods|bluetooth|buds|beats|headphone|headset|earphone|jabra|bose|sony wf|powerbeats/i;

// true: earbuds or a Bluetooth speaker are connected (the phone sends the coach there itself).
// false: playing from the phone. null: can't tell (most browsers keep this private).
export async function earbudsConnected() {
  const native = await post("victoryAudio", { action: "route" });
  if (native && typeof native.bluetooth === "boolean") return native.bluetooth;
  try {
    const outputs = (await navigator.mediaDevices?.enumerateDevices?.() || []).filter((d) => d.kind === "audiooutput" && d.label);
    if (!outputs.length) return null;
    return outputs.some((d) => EARBUD_NAMES.test(d.label));
  } catch {
    return null;
  }
}
