import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Trash2, Coins, RefreshCw, Palette, X, RotateCcw } from "lucide-react";
import { API, useAuth } from "@/App";
import { tx } from "@/i18n/tx";

const REACTIONS = [
  { key: "hype",     emoji: "🔥", get label() { return tx("ui.emoteStudioPage.hype", "Hype"); }     },
  { key: "ko",       emoji: "😵", get label() { return tx("ui.emoteStudioPage.koD", "KO'd"); }     },
  { key: "dodge",    emoji: "😏", get label() { return tx("ui.emoteStudioPage.slip", "Slip"); }     },
  { key: "uppercut", emoji: "💥", get label() { return tx("ui.emoteStudioPage.uppercut", "Uppercut"); } },
  { key: "combo",    emoji: "👊", get label() { return tx("ui.emoteStudioPage.combo", "Combo"); }    },
  { key: "gassed",   emoji: "😮‍💨", get label() { return tx("ui.emoteStudioPage.gassed", "Gassed"); }  },
  { key: "love",     emoji: "❤️",  get label() { return tx("ui.emoteStudioPage.love", "Love"); }    },
  { key: "dead",     emoji: "💀", get label() { return tx("ui.emoteStudioPage.dead", "Dead"); }     },
  { key: "respect",  emoji: "🫡", get label() { return tx("ui.emoteStudioPage.respect", "Respect"); }  },
  { key: "goat",     emoji: "🐐", get label() { return tx("ui.emoteStudioPage.goat", "GOAT"); }     },
  { key: "shocked",  emoji: "😱", get label() { return tx("ui.emoteStudioPage.noWay", "No Way"); }   },
  { key: "clinch",   emoji: "🤝", get label() { return tx("ui.emoteStudioPage.clinch", "Clinch"); }   },
];

const PRICES = [
  { value: 0,   get label() { return tx("ui.emoteStudioPage.freeSubscribers", "Free (subscribers)"); } },
  { value: 50,  get label() { return tx("ui.emoteStudioPage.s50Tokens", "50 tokens"); } },
  { value: 100, get label() { return tx("ui.emoteStudioPage.s100Tokens", "100 tokens"); } },
  { value: 200, get label() { return tx("ui.emoteStudioPage.s200Tokens", "200 tokens"); } },
];

function EmoteImage({ src, emoji, alt, className }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className={`${className} flex items-center justify-center bg-victory-border/20 rounded-lg text-4xl`}>
        {emoji}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`${className} object-contain`}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ background: "transparent" }}
    />
  );
}

function EmoteCard({ emote, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (!window.confirm(`Delete emote "${emote.name}"?`)) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/emotes/${emote.emote_id}`);
      onDelete(emote.emote_id);
    } catch {
      toast.error(tx("ui.emoteStudioPage.couldNotDeleteEmote", "Could not delete emote."));
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className="bg-victory-card border border-victory-border rounded-xl p-3 flex flex-col items-center gap-2">
      <EmoteImage
        src={emote.image_url}
        emoji={emote.emoji}
        alt={emote.name}
        className="w-16 h-16"
      />
      <span className="text-victory-text text-xs font-bold text-center leading-tight">{emote.name}</span>
      <span className="text-victory-muted text-[10px]">{emote.emoji} {emote.label}</span>
      <span className="text-victory-lime text-[10px]">
        {emote.token_price === 0 ? tx("ui.emoteStudioPage.free", "Free") : tx("ui.emoteStudioPage.tokens", "{{token_price}} tokens", { token_price: emote.token_price })}
      </span>
      <span className="text-victory-muted text-[10px]">{emote.unlock_count} {tx("ui.emoteStudioPage.unlocks", "unlocks")}</span>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="mt-auto w-full touch-target flex items-center justify-center gap-1 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors disabled:opacity-40"
      >
        <Trash2 className="w-3 h-3" /> {tx("ui.emoteStudioPage.delete", "Delete")}
      </button>
    </div>
  );
}

export default function EmoteStudioPage() {
  const navigate  = useNavigate();
  const { user, setUser } = useAuth();

  const [myEmotes,    setMyEmotes]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [reaction,    setReaction]    = useState("hype");
  const [emoteName,   setEmoteName]   = useState("");
  const [price,       setPrice]       = useState(0);
  const [preview,     setPreview]     = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [apGender,    setApGender]    = useState(null);
  const [apSkinTone,  setApSkinTone]  = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  const partner = user?.training_partner;

  const GENDERS = [
    { value: "male",       get label() { return tx("ui.emoteStudioPage.male", "Male"); },       icon: "♂" },
    { value: "female",     get label() { return tx("ui.emoteStudioPage.female", "Female"); },     icon: "♀" },
    { value: "non-binary", get label() { return tx("ui.emoteStudioPage.nonBinary", "Non-binary"); }, icon: "⚧" },
  ];

  const SKIN_TONES = [
    { value: "light",        get label() { return tx("ui.emoteStudioPage.light", "Light"); },        color: "#FDDBB4" },
    { value: "medium-light", get label() { return tx("ui.emoteStudioPage.mediumLight", "Medium-light"); },  color: "#E8B88A" },
    { value: "medium",       get label() { return tx("ui.emoteStudioPage.medium", "Medium"); },        color: "#C68642" },
    { value: "medium-dark",  get label() { return tx("ui.emoteStudioPage.mediumDark", "Medium-dark"); },   color: "#8D5524" },
    { value: "dark",         get label() { return tx("ui.emoteStudioPage.dark", "Dark"); },          color: "#4A2912" },
  ];

  const openAppearance = () => {
    setApGender(partner?.appearance_gender || "male");
    setApSkinTone(partner?.appearance_skin_tone || "medium");
    setShowAppearance(true);
  };

  const handleRegenerateAvatar = async () => {
    if (!apGender || !apSkinTone) return;
    setRegenerating(true);
    try {
      const res = await axios.post(`${API}/training-partner/regenerate-avatar`, {
        gender: apGender,
        skin_tone: apSkinTone,
      });
      setUser((prev) => ({
        ...prev,
        training_partner: {
          ...prev.training_partner,
          avatar_url: res.data.avatar_url,
          appearance_gender: apGender,
          appearance_skin_tone: apSkinTone,
        },
      }));
      setShowAppearance(false);
      toast.success(tx("ui.emoteStudioPage.characterUpdated", "Character updated!"));
    } catch {
      toast.error(tx("ui.emoteStudioPage.couldNotRegenerateAvatar", "Could not regenerate avatar. Try again."));
    } finally {
      setRegenerating(false);
    }
  };

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
    if (!emoteName.trim()) { toast.error(tx("ui.emoteStudioPage.giveYourEmoteA", "Give your emote a name first.")); return; }
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
      toast.success(tx("ui.emoteStudioPage.emoteCreated", "Emote created!"));
    } catch (err) {
      toast.error(err?.response?.data?.detail || tx("ui.emoteStudioPage.generationFailed", "Generation failed."));
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = (emoteId) => {
    setMyEmotes((prev) => prev.filter((e) => e.emote_id !== emoteId));
    if (preview?.emote_id === emoteId) setPreview(null);
    toast.success(tx("ui.emoteStudioPage.emoteDeleted", "Emote deleted."));
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 material-header px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label={tx("ui.emoteStudioPage.goBack", "Go back")} className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-victory-text font-bold text-base">{tx("ui.emoteStudioPage.emoteStudio", "Emote Studio")}</h1>
          <p className="text-victory-muted text-xs">{tx("ui.emoteStudioPage.generateCustomEmotesFrom", "Generate custom emotes from your AI training partner")}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">

        {/* Training partner card */}
        {partner ? (
          <div className="bg-victory-card border border-victory-border rounded-2xl p-4 flex items-center gap-4">
            {partner.avatar_url ? (
              <img src={partner.avatar_url} alt={partner.name} className="w-16 h-16 rounded-full object-cover border-2 border-victory-lime flex-shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
            ) : (
              <div className="w-16 h-16 rounded-full bg-victory-lime/20 flex items-center justify-center text-3xl flex-shrink-0">🥊</div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-victory-text font-bold">{partner.name}</p>
              <p className="text-victory-muted text-xs capitalize">{partner.style_name || partner.style}</p>
              <p className="text-victory-lime text-xs mt-0.5">{tx("ui.emoteStudioPage.yourEmoteCharacter", "Your emote character")}</p>
            </div>
            <button
              onClick={openAppearance}
              className="flex-shrink-0 flex items-center gap-1.5 touch-target px-3 rounded-xl bg-victory-bg border border-victory-border text-victory-muted text-xs hover:border-victory-lime/40 hover:text-victory-lime transition-colors"
            >
              <Palette className="w-3.5 h-3.5" />
              {tx("ui.emoteStudioPage.customize", "Customize")}
            </button>
          </div>
        ) : (
          <div className="bg-victory-card border border-victory-danger/30 rounded-2xl p-4 text-center">
            <p className="text-victory-danger text-sm font-medium">{tx("ui.emoteStudioPage.noTrainingPartnerYet", "No training partner yet")}</p>
            <p className="text-victory-muted text-xs mt-1">{tx("ui.emoteStudioPage.createYourAiPartner", "Create your AI partner in the Train section first.")}</p>
            <button onClick={() => navigate("/train")} className="mt-3 touch-target flex items-center justify-center mx-auto text-xs text-victory-lime underline">
              {tx("ui.emoteStudioPage.goToTrain", "Go to Train")}
            </button>
          </div>
        )}

        {/* Generator form */}
        <div className="bg-victory-card border border-victory-border rounded-2xl p-4 space-y-4">
          <h2 className="text-victory-text font-semibold text-sm">{tx("ui.emoteStudioPage.createNewEmote", "Create New Emote")}</h2>

          {/* Reaction picker */}
          <div>
            <p className="text-victory-muted text-xs mb-2">{tx("ui.emoteStudioPage.reactionType", "Reaction type")}</p>
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
            <p className="text-victory-muted text-xs mb-1.5">{tx("ui.emoteStudioPage.emoteName", "Emote name")}</p>
            <input
              value={emoteName}
              onChange={(e) => setEmoteName(e.target.value.toUpperCase().slice(0, 20))}
              placeholder={tx("ui.emoteStudioPage.eGGogohype", "e.g. GOGOHYPE")}
              maxLength={20}
              className="w-full bg-victory-bg border border-victory-border rounded-xl px-3 py-2.5 text-victory-text text-sm placeholder:text-victory-muted focus:outline-none focus:border-victory-lime uppercase tracking-wide"
            />
            <p className="text-victory-muted text-[10px] mt-1">{emoteName.length}/20 · Will appear as :{emoteName || tx("ui.emoteStudioPage.name", "NAME")}:</p>
          </div>

          {/* Token price */}
          <div>
            <p className="text-victory-muted text-xs mb-1.5">{tx("ui.emoteStudioPage.priceForViewers", "Price for viewers")}</p>
            <div className="grid grid-cols-2 gap-2">
              {PRICES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPrice(p.value)}
                  className={`flex items-center gap-2 touch-target px-3 rounded-xl border text-xs transition-colors ${
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
              <EmoteImage src={preview.image_url} emoji={preview.emoji} alt={preview.name} className="w-16 h-16 flex-shrink-0" />
              <div>
                <p className="text-victory-text font-bold text-sm">{preview.name}</p>
                <p className="text-victory-muted text-xs">{preview.emoji} {preview.label}</p>
                <p className="text-victory-lime text-xs mt-0.5">{tx("ui.emoteStudioPage.savedToYourCollection", "Saved to your collection")}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !partner || !emoteName.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-victory-lime text-victory-bg font-bold text-sm disabled:opacity-40 transition-opacity active:scale-95"
          >
            {generating ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> {tx("ui.emoteStudioPage.generating", "Generating…")}</>
            ) : (
              <><Sparkles className="w-4 h-4" /> {tx("ui.emoteStudioPage.generateEmote", "Generate Emote")}</>
            )}
          </button>
        </div>

        {/* My emotes grid */}
        <div>
          <h2 className="text-victory-text font-semibold text-sm mb-3">
            {tx("ui.emoteStudioPage.myEmotes", "My Emotes")} <span className="text-victory-muted font-normal">({myEmotes.length})</span>
          </h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
            </div>
          ) : myEmotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Palette className="w-8 h-8 text-victory-muted/60" />
              <p className="text-victory-text text-sm font-semibold">{tx("ui.emoteStudioPage.noEmotesYet", "No emotes yet")}</p>
              <p className="text-victory-muted text-xs">{tx("ui.emoteStudioPage.generateYourFirstOne", "Generate your first one above.")}</p>
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

      {/* Appearance customisation sheet */}
      {showAppearance && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAppearance(false)} />
          <div className="relative bg-victory-card border-t border-victory-border rounded-t-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-victory-text">{tx("ui.emoteStudioPage.customiseCharacter", "Customise Character")}</h2>
              <button onClick={() => setShowAppearance(false)} aria-label={tx("ui.emoteStudioPage.close", "Close")} className="w-11 h-11 flex items-center justify-center touch-target rounded-full bg-victory-bg border border-victory-border text-victory-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gender */}
            <div>
              <p className="text-victory-muted text-xs font-semibold uppercase tracking-wider mb-2">{tx("ui.emoteStudioPage.gender", "Gender")}</p>
              <div className="flex gap-2">
                {GENDERS.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    onClick={() => setApGender(value)}
                    className={`flex-1 touch-target flex items-center justify-center rounded-xl border text-sm font-semibold transition-all ${
                      apGender === value
                        ? "bg-victory-lime text-victory-bg border-victory-lime"
                        : "bg-victory-bg border-victory-border text-victory-muted"
                    }`}
                  >
                    <span className="mr-1">{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Skin tone */}
            <div>
              <p className="text-victory-muted text-xs font-semibold uppercase tracking-wider mb-3">{tx("ui.emoteStudioPage.skinTone", "Skin Tone")}</p>
              <div className="flex gap-3 justify-between">
                {SKIN_TONES.map(({ value, label, color }) => (
                  <button
                    key={value}
                    onClick={() => setApSkinTone(value)}
                    title={label}
                    className={`flex flex-col items-center gap-1.5 ${apSkinTone === value ? "opacity-100" : "opacity-60"}`}
                  >
                    <div
                      className={`w-11 h-11 rounded-full transition-all ${
                        apSkinTone === value ? "ring-2 ring-offset-2 ring-victory-lime ring-offset-victory-card scale-110" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] text-victory-muted leading-tight text-center">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleRegenerateAvatar}
              disabled={regenerating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-victory-lime text-victory-bg font-bold text-sm disabled:opacity-40"
            >
              {regenerating ? (
                <><RotateCcw className="w-4 h-4 animate-spin" /> {tx("ui.emoteStudioPage.generating", "Generating…")}</>
              ) : (
                <><RotateCcw className="w-4 h-4" /> {tx("ui.emoteStudioPage.regenerateAvatar", "Regenerate Avatar")}</>
              )}
            </button>
            <p className="text-victory-muted text-[11px] text-center">{tx("ui.emoteStudioPage.thisReplacesYourCurrent", "This replaces your current character image everywhere in the app")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
