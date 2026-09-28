// Sharing the actual MP4 (not a link) is what lets it land natively in TikTok / Reels /
// Snap / Shorts from the OS share sheet. The file must be fetched BEFORE the tap: iOS
// drops the user-gesture activation if navigator.share runs after a slow await.

export async function fetchVideoFile(url, filename = "victory-highlight.mp4") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`video fetch ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: "video/mp4" });
}

export const canShareFile = (file) =>
  !!file && typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] });

// Resolves to "shared", "downloaded" or "cancelled".
export async function shareVideoFile(file, { title, text } = {}) {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title, text });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      throw err;
    }
  }
  downloadFile(file);
  return "downloaded";
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function highlightCaption(highlight) {
  const n = highlight?.peak_reactions || 0;
  const hook = n ? `${n} reactions at once` : "Caught this live";
  return `${hook} on Victory AI #boxing #VictoryAI`;
}
