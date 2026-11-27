import { useRef, useState } from "react";
import { Share2, Download } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { Progress } from "@/components/ui/progress";
import { tx } from "@/i18n/tx";
import { analytics } from "@/lib/analytics";
import { bestRoundClip } from "@/lib/roundClips";
import { renderShareClip } from "@/lib/shareClip";
import { clipFor } from "@/lib/speech";
import { useAuth } from "@/App";

// Goal: every good round can become a post (permission to show off), which brings new fighters.
// Psychology: sharing is a brag first; the less work between "that was good" and "posted", the
//   more people do it (friction kills sharing).
// Design: one tap makes a vertical 9:16 highlight with the calls, punch count and score on it,
//   then the phone's share sheet sends it straight to Reels, TikTok or a chat. No editing.
const canRender = () => typeof window !== "undefined" && !!window.MediaRecorder
  && typeof HTMLCanvasElement !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;

export function ShareRound({ sessionId, score }) {
  const { user } = useAuth();
  const stance = user?.stance;
  const clip = bestRoundClip(sessionId);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  if (!clip || !canRender()) return null;

  const start = async () => {
    setOpen(true);
    if (busy.current || result) return;
    busy.current = true;
    setFailed(false);
    // Made inside the tap, so iPhone lets the coach's voice into the clip.
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    ac.resume?.().catch(() => {});
    try {
      const out = await renderShareClip({ clip, score, stance, clipFor, audioContext: ac, onProgress: setProgress });
      const ext = out.type.includes("mp4") ? "mp4" : "webm";
      setResult({ ...out, file: new File([out.blob], `victory-round.${ext}`, { type: out.type }), url: URL.createObjectURL(out.blob) });
      analytics.capture("round_clip_made", { seconds: out.seconds, type: out.type });
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      ac.close?.().catch(() => {});
    }
  };

  const share = async () => {
    const data = { files: [result.file], title: "Victory AI" };
    if (navigator.canShare?.(data)) {
      try { await navigator.share(data); analytics.capture("round_clip_shared", { how: "share_sheet" }); } catch {}
    } else {
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.file.name;
      a.click();
      analytics.capture("round_clip_shared", { how: "download" });
    }
  };

  return (
    <>
      <button type="button" onClick={start} className="victory-btn-primary w-full flex items-center justify-center gap-2" data-testid="share-round">
        <Share2 className="w-5 h-5" /> {tx("ui.shareRound.button", "Share your round")}
      </button>
      {open && (
        <BottomSheet onClose={() => setOpen(false)} label={tx("ui.shareRound.button", "Share your round")} testId="share-round-sheet">
          <div className="space-y-4 text-center">
            <p className="text-victory-text font-heading font-bold text-lg">{tx("ui.shareRound.title", "Your round, ready for Reels and TikTok")}</p>
            {!result && !failed && (
              <>
                <p className="text-victory-muted text-sm">{tx("ui.shareRound.making", "Cutting your best 20 seconds…")}</p>
                <Progress value={Math.round(progress * 100)} className="h-1.5" />
              </>
            )}
            {failed && (
              <>
                <p className="text-victory-muted text-sm">{tx("ui.shareRound.failed", "Couldn't make the clip on this phone. Try again?")}</p>
                <button type="button" onClick={start} className="victory-btn-secondary w-full">{tx("ui.shareRound.retry", "Try again")}</button>
              </>
            )}
            {result && (
              <>
                <video src={result.url} className="mx-auto h-[52vh] rounded-2xl bg-black" style={{ aspectRatio: "9 / 16" }}
                  autoPlay loop playsInline controls data-testid="share-round-preview" />
                <button type="button" onClick={share} className="victory-btn-primary w-full flex items-center justify-center gap-2">
                  {navigator.canShare?.({ files: [result.file] }) ? <Share2 className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                  {navigator.canShare?.({ files: [result.file] }) ? tx("ui.shareRound.share", "Share") : tx("ui.shareRound.save", "Save video")}
                </button>
                <p className="text-victory-muted text-xs">{tx("ui.shareRound.note", "Vertical 9:16 with the coach's calls. Gym noise isn't in it.")}</p>
              </>
            )}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
