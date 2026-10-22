import { useState } from "react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { useAuth } from "@/App";
import { analytics } from "@/lib/analytics";
import { streakCardContent } from "@/lib/streakCard";
import { dark } from "@/theme/theme";

const W = 1080, H = 1920;

// Drawn on the phone like the fighter card: story-sized, nothing uploaded until they share it.
// Always the dark palette, so the card looks the same wherever it's posted.
async function drawStreakCard(c) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = dark.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 760, 40, W / 2, 760, 700);
  glow.addColorStop(0, `${dark.orange}55`);
  glow.addColorStop(1, `${dark.orange}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.font = "220px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  ctx.fillText("🔥", W / 2, 600);

  ctx.fillStyle = dark.text;
  ctx.font = "800 360px 'Space Grotesk', sans-serif";
  ctx.fillText(c.number, W / 2, 1000, W - 120);
  ctx.fillStyle = dark.lime;
  ctx.font = "800 84px 'Space Grotesk', sans-serif";
  ctx.fillText(c.label, W / 2, 1110, W - 120);

  ctx.fillStyle = dark.text;
  ctx.font = "500 44px 'Inter', sans-serif";
  ctx.fillText(c.line, W / 2, 1220, W - 140);
  if (c.best) {
    ctx.fillStyle = dark.muted;
    ctx.font = "600 36px 'JetBrains Mono', monospace";
    ctx.fillText(c.best, W / 2, 1290, W - 140);
  }

  ctx.fillStyle = dark.text;
  ctx.font = "800 64px 'Space Grotesk', sans-serif";
  ctx.fillText(c.name.toUpperCase(), W / 2, 1560, W - 120);
  if (c.squad) {
    ctx.fillStyle = dark.teal;
    ctx.font = "700 36px 'Space Grotesk', sans-serif";
    ctx.fillText(c.squad.toUpperCase(), W / 2, 1620, W - 120);
  }
  ctx.fillStyle = dark.text;
  ctx.font = "800 44px 'Space Grotesk', sans-serif";
  ctx.fillText("VICTORY AI", W / 2, 1780);
  ctx.fillStyle = dark.muted;
  ctx.font = "400 28px 'Inter', sans-serif";
  ctx.fillText(new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), W / 2, 1830);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function StreakShareButton({ streak, squadName }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const blob = await drawStreakCard(streakCardContent({ streak, user, squadName }));
      if (!blob) throw new Error("render failed");
      const file = new File([blob], "victory-weekly-streak.png", { type: "image/png" });
      let via = "download";
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `My ${streak.current}-week streak` });
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
      analytics.capture("streak_card_shared", { via, weeks: streak.current });
    } catch {
      toast.error("Couldn't make your card. Try again.");
    }
    setBusy(false);
  };

  return (
    <button onClick={share} disabled={busy} data-testid="streak-share"
      className="text-[12px] text-victory-lime min-h-[44px] px-2 -mr-2 flex items-center gap-1 disabled:opacity-50">
      <Share2 className="w-3.5 h-3.5" /> {busy ? "Making it…" : "Share"}
    </button>
  );
}
