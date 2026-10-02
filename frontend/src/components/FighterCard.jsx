import { useState } from "react";
import { toast } from "sonner";
import { IdCard } from "lucide-react";
import { useAuth } from "@/App";
import { analytics } from "@/lib/analytics";
import { fighterCardContent } from "@/lib/fighterCard";

const W = 1080, H = 1920;
const BG = "#0A0A0F", LIME = "#E8FF47", TEAL = "#47E8C8", TEXT = "#F0F0F5", MUTED = "#8888A0";

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

// Drawn on the phone — no image service, no cost, and nothing leaves the device until
// the fighter shares it. Story-sized so it drops straight into Instagram/TikTok/Snap.
async function drawCard(c) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#14141F");
  bg.addColorStop(1, BG);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 720, 50, W / 2, 720, 650);
  glow.addColorStop(0, "rgba(232,255,71,0.22)");
  glow.addColorStop(1, "rgba(232,255,71,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const mascot = await loadImage("/mascot-render.png");
  if (mascot) {
    const h = 760, w = (mascot.width / mascot.height) * h;
    ctx.drawImage(mascot, (W - w) / 2, 330, w, h);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = LIME;
  ctx.font = "800 64px 'Space Grotesk', sans-serif";
  ctx.fillText(c.headline, W / 2, 180, W - 120);
  if (c.rank) {
    ctx.fillStyle = TEAL;
    ctx.font = "700 36px 'Space Grotesk', sans-serif";
    ctx.fillText(c.rank, W / 2, 245, W - 120);
  }

  ctx.fillStyle = TEXT;
  ctx.font = "800 104px 'Space Grotesk', sans-serif";
  ctx.fillText(c.name.toUpperCase(), W / 2, 1210, W - 100);
  if (c.tags.length) {
    ctx.fillStyle = MUTED;
    ctx.font = "600 34px 'JetBrains Mono', monospace";
    ctx.fillText(c.tags.join("  ·  "), W / 2, 1270, W - 120);
  }

  const n = c.stats.length;
  if (n) {
    const gap = 24, boxW = (W - 120 - gap * (n - 1)) / n, top = 1340;
    c.stats.forEach((s, i) => {
      const x = 60 + i * (boxW + gap);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = "rgba(232,255,71,0.35)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, top, boxW, 230, 28) : ctx.rect(x, top, boxW, 230);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = LIME;
      ctx.font = "700 96px 'JetBrains Mono', monospace";
      ctx.fillText(s.value, x + boxW / 2, top + 130, boxW - 20);
      ctx.fillStyle = MUTED;
      ctx.font = "700 28px 'Space Grotesk', sans-serif";
      ctx.fillText(s.label, x + boxW / 2, top + 190, boxW - 20);
    });
  }

  if (c.footnote) {
    ctx.fillStyle = MUTED;
    ctx.font = "400 26px 'Inter', sans-serif";
    ctx.fillText(c.footnote, W / 2, 1640, W - 120);
  }
  ctx.fillStyle = TEXT;
  ctx.font = "800 44px 'Space Grotesk', sans-serif";
  ctx.fillText("VICTORY AI", W / 2, 1780);
  ctx.fillStyle = MUTED;
  ctx.font = "400 28px 'Inter', sans-serif";
  ctx.fillText(new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), W / 2, 1830);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function FighterCardButton({ rewards, overall, liveStats }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      const blob = await drawCard(fighterCardContent({ user, rewards, overall, liveStats }));
      if (!blob) throw new Error("render failed");
      const file = new File([blob], "victory-fighter-card.png", { type: "image/png" });
      let via = "download";
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "My Victory AI fighter card" });
          via = "share";
        } catch (err) {
          if (err?.name === "AbortError") { setBusy(false); return; }
          throw err;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      analytics.capture("fighter_card_shared", { via });
    } catch {
      toast.error("Couldn't make your card — try again");
    }
    setBusy(false);
  };

  return (
    <button onClick={make} disabled={busy} className="victory-btn-secondary w-full flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50" data-testid="fighter-card-btn">
      <IdCard className="w-4 h-4" /> {busy ? "Making your card…" : "Share your fighter card"}
    </button>
  );
}
