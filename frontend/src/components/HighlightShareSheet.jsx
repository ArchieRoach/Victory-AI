import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { X, Share2, Download, Link, Scissors, Flame, RotateCcw, Send, Users, Dumbbell, TrendingUp } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { fetchVideoFile, canShareFile, shareVideoFile, downloadFile, highlightCaption } from "@/lib/shareVideo";
import { SquadVerdict } from "@/components/SquadVerdict";

const POLL_MS = 4000;
const PENDING = ["clipping", "processing"];

export function HighlightShareSheet({ highlightId, initial = null, onClose, onChange }) {
  const { user } = useAuth();
  const [hl,        setHl]        = useState(initial);
  const [file,      setFile]      = useState(null);
  const [fileError, setFileError] = useState(false);
  const [busy,      setBusy]      = useState(null); // "share" | "save" | "post" | "retry"
  const [copied,    setCopied]    = useState(false);
  const [pollKey,   setPollKey]   = useState(0);
  const pollRef = useRef(null);

  const isOwner = hl && user && hl.streamer_id === user.user_id;
  const status  = hl?.status || "clipping";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get(`${API}/highlights/${highlightId}`);
        if (cancelled) return;
        setHl(res.data);
        onChange?.(res.data);
        if (PENDING.includes(res.data.status)) pollRef.current = setTimeout(load, POLL_MS);
      } catch {
        if (!cancelled) pollRef.current = setTimeout(load, POLL_MS * 2);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
    // onChange is a parent callback; re-polling on its identity would restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, pollKey]);

  useEffect(() => {
    if (status !== "ready" || !hl?.share_video_url) return;
    let cancelled = false;
    setFileError(false);
    fetchVideoFile(hl.share_video_url, `victory-${hl.highlight_id}.mp4`)
      .then((f) => { if (!cancelled) setFile(f); })
      .catch(() => { if (!cancelled) setFileError(true); });
    return () => { cancelled = true; };
  }, [status, hl?.share_video_url, hl?.highlight_id]);

  const recordShare = async (target) => {
    analytics.capture("highlight_shared", { target, source: hl?.source });
    try {
      const res = await axios.post(`${API}/highlights/${highlightId}/share`, { target });
      setHl((h) => h && { ...h, share_count: res.data.share_count });
    } catch {}
  };

  const handleShare = async () => {
    if (!file) return;
    setBusy("share");
    try {
      const result = await shareVideoFile(file, { title: hl.stream_title || "Victory AI highlight", text: highlightCaption(hl) });
      if (result === "shared") await recordShare("native");
      if (result === "downloaded") {
        toast.success("Saved — post it from your camera roll");
        await recordShare("download");
      }
    } catch {
      toast.error("Couldn't open the share sheet — try Save video instead");
    }
    setBusy(null);
  };

  const handleSave = async () => {
    if (!file) return;
    setBusy("save");
    downloadFile(file);
    toast.success("Video saved");
    await recordShare("download");
    setBusy(null);
  };

  const handlePost = async () => {
    setBusy("post");
    try {
      const res = await axios.post(`${API}/highlights/${highlightId}/publish`, { caption: "" });
      setHl((h) => ({ ...h, post_id: res.data.post_id }));
      onChange?.({ ...hl, post_id: res.data.post_id });
      analytics.capture("highlight_posted", { source: hl?.source });
      toast.success("Posted to your profile");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't post — try again");
    }
    setBusy(null);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/clip/${hl.post_id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await recordShare("link");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleRetry = async () => {
    setBusy("retry");
    try {
      await axios.post(`${API}/highlights/${highlightId}/retry`);
      setHl((h) => ({ ...h, status: "processing" }));
      setPollKey((k) => k + 1);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Retry failed");
    }
    setBusy(null);
  };

  const shareLabel = file && !canShareFile(file) ? "Download to share" : "Share video";

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative mt-auto w-full max-w-lg mx-auto bg-victory-bg rounded-t-2xl pb-safe max-h-[92vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-victory-border mx-auto mt-3 mb-1" />

        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {hl?.source === "auto" ? (
              <span className="flex items-center gap-1 bg-victory-lime/15 text-victory-lime text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-victory-lime/30">
                <Flame className="w-3 h-3" /> AUTO HIGHLIGHT
              </span>
            ) : hl?.source === "training" ? (
              <span className="flex items-center gap-1 bg-victory-teal/15 text-victory-teal text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-victory-teal/30">
                <Dumbbell className="w-3 h-3" /> YOUR ROUND
              </span>
            ) : (
              <span className="flex items-center gap-1 bg-victory-card-highlight text-victory-muted text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-victory-border">
                <Scissors className="w-3 h-3" /> CLIP
              </span>
            )}
            <p className="text-victory-muted text-xs truncate">{hl?.stream_title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4">
          <div className="relative mx-auto w-full max-w-[240px] aspect-[9/16] rounded-2xl overflow-hidden bg-victory-card border border-victory-border">
            {status === "ready" && hl?.share_video_url ? (
              <video
                src={hl.share_video_url}
                poster={hl.thumbnail_url}
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : status === "failed" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-victory-danger/10 border border-victory-danger/30 flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-victory-danger" />
                </div>
                <p className="text-victory-text text-sm font-bold">This one didn't render</p>
                {isOwner && (
                  <button onClick={handleRetry} disabled={busy === "retry"} className="victory-btn-ghost w-auto px-4 text-sm min-h-[44px]">
                    {busy === "retry" ? "Retrying…" : "Try again"}
                  </button>
                )}
              </div>
            ) : (
              <div className="absolute inset-0">
                <div className="skeleton-shimmer absolute inset-0" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 gap-2">
                  <Scissors className="w-7 h-7 text-victory-lime animate-bounce-slow" />
                  <p className="text-victory-text text-sm font-heading font-bold">
                    {status === "clipping" ? "Capturing the moment…" : "Adding your watermark…"}
                  </p>
                  <p className="text-victory-muted text-xs">Usually under a minute. You can close this — it'll be in Highlights.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {hl?.source === "training" && hl.round_score != null && (
          <div className="flex items-center justify-center gap-4 px-4 pt-4">
            <div className="text-center">
              <p className="font-mono font-bold text-2xl text-victory-lime">{Number(hl.round_score).toFixed(1)}</p>
              <p className="text-victory-muted text-[11px]">AI score</p>
            </div>
            {hl.score_delta > 0 && (
              <>
                <div className="w-px h-8 bg-victory-border" />
                <div className="text-center">
                  <p className="font-mono font-bold text-2xl text-victory-teal flex items-center gap-1 justify-center">
                    <TrendingUp className="w-4 h-4" />+{Number(hl.score_delta).toFixed(1)}
                  </p>
                  <p className="text-victory-muted text-[11px]">since last session</p>
                </div>
              </>
            )}
            <div className="w-px h-8 bg-victory-border" />
            <div className="text-center">
              <p className="font-mono font-bold text-2xl text-victory-text">{hl.share_count || 0}</p>
              <p className="text-victory-muted text-[11px]">shares</p>
            </div>
          </div>
        )}

        {hl?.peak_reactions > 0 && (
          <div className="flex items-center justify-center gap-4 px-4 pt-4">
            <div className="text-center">
              <p className="font-mono font-bold text-2xl text-victory-lime">{hl.peak_reactions}</p>
              <p className="text-victory-muted text-[11px]">reactions at once</p>
            </div>
            <div className="w-px h-8 bg-victory-border" />
            <div className="text-center">
              <p className="font-mono font-bold text-2xl text-victory-text flex items-center gap-1 justify-center">
                <Users className="w-4 h-4 text-victory-muted" />{hl.peak_reactors}
              </p>
              <p className="text-victory-muted text-[11px]">people hyped</p>
            </div>
            <div className="w-px h-8 bg-victory-border" />
            <div className="text-center">
              <p className="font-mono font-bold text-2xl text-victory-text">{hl.share_count || 0}</p>
              <p className="text-victory-muted text-[11px]">shares</p>
            </div>
          </div>
        )}

        <div className="p-4 space-y-3 pb-8">
          <button
            onClick={handleShare}
            disabled={status !== "ready" || !file || busy === "share"}
            className="victory-btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Share2 className="w-5 h-5" />
            {status !== "ready" ? "Rendering…" : !file && !fileError ? "Preparing video…" : shareLabel}
          </button>
          {fileError && (
            <p className="text-victory-muted text-xs text-center">Couldn't load the video file. Check your connection and reopen this sheet.</p>
          )}
          <p className="text-victory-muted text-[11px] text-center">
            Opens your share sheet: TikTok, Instagram, Snapchat, YouTube Shorts and more
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleSave}
              disabled={!file || busy === "save"}
              className="victory-btn-ghost flex items-center justify-center gap-2 min-h-[48px] text-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Save video
            </button>
            {hl?.post_id ? (
              <button onClick={handleCopyLink} className="victory-btn-ghost flex items-center justify-center gap-2 min-h-[48px] text-sm">
                <Link className="w-4 h-4" /> {copied ? "Copied!" : "Copy link"}
              </button>
            ) : isOwner ? (
              <button
                onClick={handlePost}
                disabled={status !== "ready" || busy === "post"}
                className="victory-btn-ghost flex items-center justify-center gap-2 min-h-[48px] text-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {busy === "post" ? "Posting…" : "Post to feed"}
              </button>
            ) : (
              <div />
            )}
          </div>

          {isOwner && status === "ready" && hl.streamer_id === user?.user_id && (
            <SquadVerdict highlightId={highlightId} sentToSquad={hl.sent_to_squad || 0} />
          )}
        </div>
      </div>
    </div>
  );
}
