import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, FlipHorizontal, Pause, Play, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { tx } from "@/i18n/tx";

// Your round next to a clip of a fighter you look up to. Why it works, and why the fighter's clip
// is only ever embedded (never downloaded or re-hosted), is in backend/fighter_compare.py.
const SPEEDS = [0.25, 0.5, 1];
const PROVIDER_NAME = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };
const err = (e, fallback) => (typeof e?.response?.data?.detail === "string" ? e.response.data.detail : fallback);
const ownVideoOk = (url) => /^https:\/\/res\.cloudinary\.com\//.test(url || "");

// The platforms' own players accept a few commands by message. Instagram's doesn't, so its
// clip is played by tapping it.
function command(iframe, provider, action, value) {
  const win = iframe?.contentWindow;
  if (!win) return;
  if (provider === "youtube") {
    const func = { play: "playVideo", pause: "pauseVideo", seek: "seekTo", speed: "setPlaybackRate" }[action];
    win.postMessage(JSON.stringify({ event: "command", func, args: action === "seek" ? [value, true] : value != null ? [value] : [] }), "*");
  } else if (provider === "tiktok") {
    const type = { play: "play", pause: "pause", seek: "seekTo" }[action];
    if (type) win.postMessage({ type, value, "x-tiktok-player": true }, "*");
  }
}

function AddClip({ onAdded }) {
  const { user } = useAuth() || {};
  const [url, setUrl] = useState("");
  const [name, setName] = useState(user?.favorite_fighter && user.favorite_fighter !== "__other" ? user.favorite_fighter : "");
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/compare/fighter-clips`, { url, fighter_name: name });
      setUrl("");
      onAdded(data);
    } catch (e2) {
      toast.error(err(e2, tx("ui.comparePage.couldntAdd", "Couldn't add that clip. Try again.")));
    }
    setSaving(false);
  };
  return (
    <form onSubmit={save} className="space-y-2" data-testid="add-fighter-clip">
      <input className="victory-input" required value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url"
        placeholder={tx("ui.comparePage.pasteLink", "Paste a YouTube, TikTok or Instagram link")} data-testid="clip-url" />
      <input className="victory-input" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)}
        placeholder={tx("ui.comparePage.fighterName", "Fighter's name, e.g. Lomachenko")} data-testid="clip-fighter" />
      <p className="text-[11px] text-victory-muted">{tx("ui.comparePage.howToLink", "In the app, tap Share, then Copy link. The clip plays from the original post, so the person who posted it keeps the views.")}</p>
      <button type="submit" disabled={saving} className="victory-btn-secondary w-full min-h-[44px]" data-testid="clip-add">
        {saving ? tx("ui.comparePage.adding", "Adding…") : tx("ui.comparePage.addClip", "Add clip")}
      </button>
    </form>
  );
}

export default function ComparePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clips, setClips] = useState(null);
  const [clip, setClip] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [mine, setMine] = useState(ownVideoOk(params.get("video")) ? { url: params.get("video"), label: tx("ui.comparePage.thisRound", "This round") } : null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mirror, setMirror] = useState(false);
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const localUrl = useRef(null);

  useEffect(() => {
    axios.get(`${API}/compare/fighter-clips`).then((r) => { setClips(r.data.clips); setClip((c) => c || r.data.clips[0] || null); }).catch(() => setClips([]));
    axios.get(`${API}/compare/my-rounds`).then((r) => setRounds(r.data.rounds)).catch(() => {});
    return () => { if (localUrl.current) URL.revokeObjectURL(localUrl.current); };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    command(frameRef.current, clip?.provider, "speed", speed);
  }, [speed, clip, mine]);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = URL.createObjectURL(f);
    setMine({ url: localUrl.current, label: f.name, local: true });
  };

  const playBoth = () => {
    const v = videoRef.current;
    if (playing) {
      v?.pause();
      command(frameRef.current, clip?.provider, "pause");
      setPlaying(false);
    } else {
      v?.play().catch(() => {});
      command(frameRef.current, clip?.provider, "play");
      setPlaying(true);
    }
  };
  const restart = () => {
    if (videoRef.current) videoRef.current.currentTime = 0;
    command(frameRef.current, clip?.provider, "seek", clip?.start || 0);
  };
  const remove = async (c) => {
    try {
      await axios.delete(`${API}/compare/fighter-clips/${c.clip_id}`);
      setClips((list) => list.filter((x) => x.clip_id !== c.clip_id));
      if (clip?.clip_id === c.clip_id) setClip(null);
    } catch {
      toast.error(tx("ui.comparePage.couldntDelete", "Couldn't delete that clip"));
    }
  };

  const tall = clip && clip.provider !== "youtube";
  return (
    <div className="min-h-screen bg-victory-bg pb-28">
      <header className="px-4 pt-safe flex items-center gap-3 py-4">
        <button type="button" onClick={() => navigate(-1)} aria-label={tx("ui.comparePage.goBack", "Go back")}
          className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div>
          <h1 className="font-heading font-bold text-xl text-victory-text">{tx("ui.comparePage.title", "Side by side")}</h1>
          <p className="text-[12px] text-victory-muted">{tx("ui.comparePage.subtitle", "Your round next to a fighter you look up to")}</p>
        </div>
      </header>

      <main className="px-4 space-y-4">
        {/* The two clips, together */}
        {(clip || mine) && (
          <section className="space-y-2" data-testid="compare-stage">
            {clip && (
              <>
                <p className="section-label">{clip.fighter_name}</p>
                <div className={`rounded-lg overflow-hidden bg-black mx-auto ${tall ? "aspect-[9/16] max-h-[40vh]" : "aspect-video w-full"}`} data-testid="fighter-frame">
                  <iframe ref={frameRef} key={clip.clip_id} src={clip.embed_url} title={clip.fighter_name} className="w-full h-full border-0"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <a href={clip.watch_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-victory-muted flex items-center gap-1 min-h-[32px]">
                    <ExternalLink className="w-3.5 h-3.5" /> {tx("ui.comparePage.watchOn", "Watch on {{site}}", { site: PROVIDER_NAME[clip.provider] })}
                  </a>
                </div>
                {clip.provider === "instagram" && (
                  <p className="text-[11px] text-victory-muted">{tx("ui.comparePage.instagramNote", "Instagram doesn't let apps start its player, so tap play on their clip yourself.")}</p>
                )}
              </>
            )}
            {mine && (
              <>
                <p className="section-label">{tx("ui.comparePage.you", "You")} · {mine.label}</p>
                <div className="rounded-lg overflow-hidden bg-black aspect-video w-full">
                  <video ref={videoRef} src={mine.url} playsInline muted loop preload="metadata" onEnded={() => setPlaying(false)}
                    className="w-full h-full object-contain" style={mirror ? { transform: "scaleX(-1)" } : undefined} data-testid="my-video" />
                </div>
              </>
            )}
          </section>
        )}

        {/* Controls */}
        {clip && mine && (
          <section className="victory-card p-3 space-y-3" data-testid="compare-controls">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={playBoth} className="victory-btn-primary col-span-2 min-h-[44px] flex items-center justify-center gap-2" data-testid="play-both">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {playing ? tx("ui.comparePage.pauseBoth", "Pause both") : tx("ui.comparePage.playBoth", "Play both")}
              </button>
              <button type="button" onClick={restart} className="victory-btn-ghost min-h-[44px] flex items-center justify-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> {tx("ui.comparePage.restart", "Restart")}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1" role="group" aria-label={tx("ui.comparePage.speed", "Speed")}>
                {SPEEDS.map((sp) => (
                  <button key={sp} type="button" onClick={() => setSpeed(sp)} aria-pressed={speed === sp}
                    className={`px-3 min-h-[40px] rounded-full text-sm font-mono ${speed === sp ? "bg-victory-lime text-victory-bg" : "bg-victory-card-highlight text-victory-text"}`}>
                    {sp}×
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setMirror((m) => !m)} aria-pressed={mirror}
                className={`px-3 min-h-[40px] rounded-full text-sm flex items-center gap-1.5 ${mirror ? "bg-victory-lime text-victory-bg" : "bg-victory-card-highlight text-victory-text"}`} data-testid="mirror">
                <FlipHorizontal className="w-4 h-4" /> {tx("ui.comparePage.flipMe", "Flip me")}
              </button>
            </div>
            <p className="text-[11px] text-victory-muted">{tx("ui.comparePage.flipNote", "Southpaw against orthodox? Flip your video so you're facing the same way.")}</p>
          </section>
        )}

        {/* Pick their clip */}
        <section className="space-y-2">
          <p className="section-label">{tx("ui.comparePage.theirClip", "Their clip")}</p>
          {clips?.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {clips.map((c) => (
                <div key={c.clip_id} className={`shrink-0 flex items-center rounded-full border ${clip?.clip_id === c.clip_id ? "border-victory-lime text-victory-lime" : "border-victory-border text-victory-text"}`}>
                  <button type="button" onClick={() => { setClip(c); setPlaying(false); }} className="pl-3 pr-1 min-h-[40px] text-sm">
                    {c.fighter_name} · {PROVIDER_NAME[c.provider]}
                  </button>
                  <button type="button" onClick={() => remove(c)} aria-label={tx("ui.comparePage.deleteClip", "Delete clip")} className="w-9 h-10 flex items-center justify-center text-victory-muted">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {clips && <AddClip onAdded={(c) => { setClips((list) => [c, ...(list || []).filter((x) => x.clip_id !== c.clip_id)]); setClip(c); setPlaying(false); }} />}
        </section>

        {/* Pick your clip */}
        <section className="space-y-2">
          <p className="section-label">{tx("ui.comparePage.you", "You")}</p>
          {!mine && <p className="victory-card p-4 text-sm text-victory-muted">{tx("ui.comparePage.pickYours", "Pick one of your recorded rounds, or a video from your phone.")}</p>}
          {rounds.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {rounds.map((r) => (
                <button key={r.video_id || r.video_url} type="button" onClick={() => { setMine({ url: r.video_url, label: tx("ui.comparePage.roundOn", "Round {{n}}, {{date}}", { n: r.round_number, date: r.date }) }); setPlaying(false); }}
                  className={`shrink-0 px-3 min-h-[40px] rounded-full border text-sm ${mine?.url === r.video_url ? "border-victory-lime text-victory-lime" : "border-victory-border text-victory-text"}`}>
                  {tx("ui.comparePage.roundOn", "Round {{n}}, {{date}}", { n: r.round_number, date: r.date })}
                </button>
              ))}
            </div>
          )}
          <label className="victory-btn-ghost w-full min-h-[44px] flex items-center justify-center gap-2 cursor-pointer">
            <Smartphone className="w-4 h-4" /> {tx("ui.comparePage.fromPhone", "Use a video from my phone")}
            <input type="file" accept="video/*" className="sr-only" onChange={pickFile} data-testid="my-file" />
          </label>
          <p className="text-[11px] text-victory-muted">{tx("ui.comparePage.staysOnPhone", "A video from your phone stays on your phone. It isn't uploaded.")}</p>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
