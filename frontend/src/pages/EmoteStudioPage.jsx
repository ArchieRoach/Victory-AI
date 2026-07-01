import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Trash2, Coins, RefreshCw } from "lucide-react";
import { API, useAuth } from "@/App";

const REACTIONS = [
  { key: "hype",     emoji: "🔥", label: "Hype"     },
  { key: "ko",       emoji: "😵", label: "KO'd"     },
  { key: "dodge",    emoji: "😏", label: "Slip"     },
  { key: "uppercut", emoji: "💥", label: "Uppercut" },
  { key: "combo",    emoji: "👊", label: "Combo"    },
  { key: "gassed",   emoji: "😮‍💨", label: "Gassed"  },
  { key: "love",     emoji: "❤️",  label: "Love"    },
  { key: "dead",     emoji: "💀", label: "Dead"     },
  { key: "respect",  emoji: "🫡", label: "Respect"  },
  { key: "goat",     emoji: "🐐", label: "GOAT"     },
  { key: "shocked",  emoji: "😱", label: "No Way"   },
  { key: "clinch",   emoji: "🤝", label: "Clinch"   },
];

const PRICES = [
  { value: 0,   label: "Free (subscribers)" },
  { value: 50,  label: "50 tokens" },
  { value: 100, label: "100 tokens" },
  { value: 200, label: "200 tokens" },
];

function EmoteCard({ emote, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (!window.confirm(`Delete emote "${emote.name}"?`)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/emotes/${emote.emote_id}`);
      onDelete(emote.emote_id);
    } catch {
      toast.error("Could not delete emote.");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className="bg-victory-card border border-victory-border rounded-xl p-3 flex flex-col items-center gap-2">
      <img
        src={emote.image_url}
        alt={emote.name}
        className="w-16 h-16 rounded-lg object-cover bg-white/5"
        loading="lazy"
      />
      <span className="text-victory-text text-xs font-bold text-center leading-tight">{emote.name}</span>
      <span className="text-victory-muted text-[10px]">{emote.emoji} {emote.label}</span>
      <span className="text-victory-lime text-[10px]">
        {emote.token_price === 0 ? "Free" : `${emote.token_price} tokens`}
      </span>
      <span className="text-victory-muted text-[10px]">{emote.unlock_count} unlocks</span>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="mt-auto w-full flex items-center justify-center gap-1 py-1 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors disabled:opacity-40"
      >
        <Trash2 className="w-3 h-3" /> Delete
      </button>
    </div>
  );
}

export default function EmoteStudioPage() {
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [myEmotes,    setMyEmotes]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [reaction,    setReaction]    = useState("hype");
  const [emoteName,   setEmoteName]   = useState("");
  const [price,       setPrice]       = useState(0);
  const [preview,     setPreview]     = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [saving,      setSaving]      = useState(false);

  const partner = user?.training_partner;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/emotes/my-emotes`);
        setMyEmotes(res.data || []);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleGenerate = async () => {
    if (!emoteName.trim()) { toast.error("Give your emote a name first."); return; }
    setGenerating(true);
    setPreview(null);
    try {
      const res = await axios.post(`${API}/emotes/generate`, {
        reaction_type: reaction,
        name:          emoteName.trim(),
        token_price:   price,
      });
      setPreview(res.data);
      setMyEmotes((prev) => [res.data, ...prev]);
      toast.success("Emote created!");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = (emoteId) => {
    setMyEmotes((prev) => prev.filter((e) => e.emote_id !== emoteId));
    if (preview?.emote_id === emoteId) setPreview(null);
    toast.success("Emote deleted.");
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-victory-text font-bold text-base">Emote Studio</h1>
          <p className="text-victory-muted text-xs">Generate custom emotes from your AI training partner</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">

        {/* Training partner card */}
        {partner ? (
          <div className="bg-victory-card border border-victory-border rounded-2xl p-4 flex items-center gap-4">
            {partner.avatar_url ? (
              <img src={partner.avatar_url} alt={partner.name} className="w-16 h-16 rounded-full object-cover border-2 border-victory-lime" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-victory-lime/20 flex items-center justify-center text-3xl">🥊</div>
            )}
            <div>
              <p className="text-victory-text font-bold">{partner.name}</p>
              <p className="text-victory-muted text-xs capitalize">{partner.style_name || partner.style}</p>
              <p className="text-victory-lime text-xs mt-0.5">Your emote character</p>
            </div>
          </div>
        ) : (
          <div className="bg-victory-card border border-red-500/30 rounded-2xl p-4 text-center">
            <p className="text-red-400 text-sm font-medium">No training partner yet</p>
            <p className="text-victory-muted text-xs mt-1">Create your AI partner in the Train section first.</p>
            <button onClick={() => navigate("/train")} className="mt-3 text-xs text-victory-lime underline">
              Go to Train
            </button>
          </div>
        )}

        {/* Generator form */}
        <div className="bg-victory-card border border-victory-border rounded-2xl p-4 space-y-4">
          <h2 className="text-victory-text font-semibold text-sm">Create New Emote</h2>

          {/* Reaction picker */}
          <div>
            <p className="text-victory-muted text-xs mb-2">Reaction type</p>
            <div className="grid grid-cols-4 gap-2">
              {REACTIONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setReaction(r.key)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border text-xs transition-colors ${
                    reaction === r.key
                      ? "border-victory-lime bg-victory-lime/10 text-victory-lime"
                      : "border-victory-border text-victory-muted hover:border-victory-lime/40"
                  }`}
                >
                  <span className="text-lg">{r.emoji}</span>
                  <span className="text-[10px] leading-tight text-center">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emote name */}
          <div>
            <p className="text-victory-muted text-xs mb-1.5">Emote name</p>
            <input
              value={emoteName}
              onChange={(e) => setEmoteName(e.target.value.toUpperCase().slice(0, 20))}
              placeholder="e.g. GOGOHYPE"
              maxLength={20}
              className="w-full bg-victory-bg border border-victory-border rounded-xl px-3 py-2.5 text-victory-text text-sm placeholder:text-victory-muted focus:outline-none focus:border-victory-lime uppercase tracking-wide"
            />
            <p className="text-victory-muted text-[10px] mt-1">{emoteName.length}/20 · Will appear as :{emoteName || "NAME"}:</p>
          </div>

          {/* Token price */}
          <div>
            <p className="text-victory-muted text-xs mb-1.5">Price for viewers</p>
            <div className="grid grid-cols-2 gap-2">
              {PRICES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPrice(p.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors ${
                    price === p.value
                      ? "border-victory-lime bg-victory-lime/10 text-victory-lime"
                      : "border-victory-border text-victory-muted hover:border-victory-lime/40"
                  }`}
                >
                  <Coins className="w-3 h-3 flex-shrink-0" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="flex items-center gap-4 p-3 bg-victory-bg rounded-xl border border-victory-lime/30">
              <img src={preview.image_url} alt={preview.name} className="w-16 h-16 rounded-lg object-cover bg-white/5" />
              <div>
                <p className="text-victory-text font-bold text-sm">{preview.name}</p>
                <p className="text-victory-muted text-xs">{preview.emoji} {preview.label}</p>
                <p className="text-victory-lime text-xs mt-0.5">Saved to your collection</p>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !partner || !emoteName.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-victory-lime text-victory-bg font-bold text-sm disabled:opacity-40 transition-opacity active:scale-95"
          >
            {generating ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Emote</>
            )}
          </button>
        </div>

        {/* My emotes grid */}
        <div>
          <h2 className="text-victory-text font-semibold text-sm mb-3">
            My Emotes <span className="text-victory-muted font-normal">({myEmotes.length})</span>
          </h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
            </div>
          ) : myEmotes.length === 0 ? (
            <div className="text-center py-8 text-victory-muted text-sm">
              No emotes yet — generate your first one above.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {myEmotes.map((e) => (
                <EmoteCard key={e.emote_id} emote={e} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
