import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Building2, Plus, Trophy, Users, Star, Lock, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";

function CreateGymModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("mixed");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error(t("gyms.nameRequired"));
    setLoading(true);
    try {
      const res = await axios.post(`${API}/gyms`, { name: name.trim(), description, style, is_public: isPublic });
      toast.success(t("gyms.created"));
      onCreated(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4">
      <div className="victory-card w-full max-w-md p-6 space-y-4 rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-victory-text">{t("gyms.createTitle")}</h2>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label className="victory-label">{t("gyms.gymName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="victory-input" placeholder={t("gyms.gymNamePlaceholder")} maxLength={50} />
        </div>
        <div>
          <label className="victory-label">{t("gyms.description")}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="victory-input resize-none" rows={2} placeholder={t("gyms.descriptionPlaceholder")} maxLength={200} />
        </div>
        <div>
          <label className="victory-label">{t("gyms.style")}</label>
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="victory-input">
            <option value="mixed">{t("gyms.styleMixed")}</option>
            <option value="orthodox">{t("gyms.styleOrthodox")}</option>
            <option value="southpaw">{t("gyms.styleSouthpaw")}</option>
            <option value="fitness">{t("gyms.styleFitness")}</option>
          </select>
        </div>
        <div className="flex items-center justify-between victory-card p-3">
          <span className="text-victory-text text-sm">{t("gyms.publicGym")}</span>
          <button
            onClick={() => setIsPublic((v) => !v)}
            className={`w-12 h-6 rounded-full transition-colors ${isPublic ? "bg-victory-lime" : "bg-victory-border"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${isPublic ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>
        <button onClick={submit} disabled={loading} className="victory-btn-primary w-full">
          {loading ? t("common.saving") : t("gyms.createBtn")}
        </button>
      </div>
    </div>
  );
}

function JoinByCodeModal({ onClose, onJoined }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/gyms/join-by-code`, { invite_code: code.trim() });
      toast.success(t("gyms.joined", { name: res.data.gym_name }));
      onJoined(res.data.gym_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4">
      <div className="victory-card w-full max-w-md p-6 space-y-4 rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-heading font-bold text-victory-text">{t("gyms.joinByCode")}</h2>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="victory-input font-mono text-center tracking-widest text-xl uppercase"
          placeholder="XXXXXXXX"
          maxLength={8}
        />
        <button onClick={submit} disabled={loading || !code.trim()} className="victory-btn-primary w-full">
          {loading ? t("common.saving") : t("gyms.joinBtn")}
        </button>
      </div>
    </div>
  );
}

export default function GymsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [gyms, setGyms] = useState([]);
  const [myGym, setMyGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [activeTab, setActiveTab] = useState("browse"); // browse | leaderboard

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [browseRes, myRes] = await Promise.all([
        axios.get(`${API}/gyms`),
        axios.get(`${API}/gyms/my`).catch(() => ({ data: null })),
      ]);
      setGyms(browseRes.data);
      setMyGym(myRes.data);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (gymId) => {
    try {
      await axios.post(`${API}/gyms/${gymId}/join`);
      toast.success(t("gyms.joinedGym"));
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
    }
  };

  const hasSubscription = user?.has_subscription;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="gyms-page">
      <header className="p-4 border-b border-victory-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text flex items-center gap-2">
              <Building2 className="w-5 h-5 text-victory-lime" />
              {t("gyms.title")}
            </h1>
            <p className="text-victory-muted text-sm">{t("gyms.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowJoinCode(true)} className="victory-btn-ghost px-3 py-1.5 text-sm">
              {t("gyms.joinCode")}
            </button>
            {hasSubscription ? (
              <button
                onClick={() => setShowCreate(true)}
                aria-label={t("gyms.createBtn")}
                className="w-11 h-11 rounded-full bg-victory-lime flex items-center justify-center touch-target"
              >
                <Plus className="w-5 h-5 text-victory-bg" />
              </button>
            ) : (
              <button
                onClick={() => navigate("/paywall")}
                className="flex items-center gap-1 text-xs text-victory-muted border border-victory-border rounded-full px-3 py-1.5"
              >
                <Lock className="w-3 h-3" />
                {t("gyms.proCreate")}
              </button>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          {["browse", "leaderboard"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-victory-lime text-victory-bg" : "bg-victory-card border border-victory-border text-victory-muted"
              }`}
            >
              {t(`gyms.tab_${tab}`)}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* My gym card */}
        {myGym && (
          <section>
            <p className="text-victory-muted text-xs uppercase tracking-wider mb-2">{t("gyms.myGym")}</p>
            <button
              onClick={() => navigate(`/gyms/${myGym.gym_id}`)}
              className="victory-card w-full p-4 flex items-center gap-4 text-left border border-victory-lime/30 bg-victory-lime/5"
            >
              <div className="w-12 h-12 rounded-xl bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-victory-lime" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-victory-text truncate">{myGym.name}</p>
                <p className="text-victory-muted text-sm">{myGym.member_count} {t("gyms.members")} · {myGym.avg_score?.toFixed(1) || "—"} {t("gyms.avgScore")}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-victory-muted flex-shrink-0" />
            </button>
          </section>
        )}

        {loading ? (
          [1, 2, 3, 4].map((i) => <div key={i} className="skeleton-shimmer h-20 rounded-xl" />)
        ) : activeTab === "browse" ? (
          <section>
            {!myGym && <p className="text-victory-muted text-xs uppercase tracking-wider mb-2">{t("gyms.findGym")}</p>}
            {gyms.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-victory-muted mx-auto mb-3" />
                <p className="text-victory-muted">{t("gyms.noGyms")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {gyms.map((gym) => (
                  <div key={gym.gym_id} className="victory-card p-4 flex items-center gap-3">
                    <button onClick={() => navigate(`/gyms/${gym.gym_id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className="w-10 h-10 rounded-xl bg-victory-card border border-victory-border flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-victory-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-victory-text truncate">{gym.name}</p>
                        <p className="text-victory-muted text-xs">
                          <Users className="w-3 h-3 inline mr-0.5" />{gym.member_count}
                          {" · "}<Star className="w-3 h-3 inline mr-0.5" />{gym.avg_score?.toFixed(1) || "—"}
                        </p>
                      </div>
                    </button>
                    {!gym.is_member && !myGym && (
                      <button onClick={() => handleJoin(gym.gym_id)} className="text-xs text-victory-lime border border-victory-lime/40 rounded-full px-3 py-1">
                        {t("gyms.joinBtn")}
                      </button>
                    )}
                    {gym.is_member && <span className="text-xs text-victory-lime">{t("gyms.member")}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          /* Leaderboard tab */
          <section>
            <div className="victory-card divide-y divide-victory-border">
              {gyms.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-victory-muted">{t("gyms.noGyms")}</p>
                </div>
              ) : (
                gyms.map((gym, idx) => (
                  <button
                    key={gym.gym_id}
                    onClick={() => navigate(`/gyms/${gym.gym_id}`)}
                    className="w-full p-4 flex items-center gap-3 text-left"
                  >
                    <span className="font-mono text-sm text-victory-muted w-6">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${gym.is_my_gym ? "text-victory-lime" : "text-victory-text"}`}>{gym.name}</p>
                      <p className="text-victory-muted text-xs"><Users className="w-3 h-3 inline mr-0.5" />{gym.member_count} · {gym.total_sessions} {t("gyms.sessions")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-victory-lime">{gym.avg_score?.toFixed(1) || "—"}</p>
                      <p className="text-victory-muted text-xs">{t("gyms.avgScore")}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      {showCreate && (
        <CreateGymModal
          onClose={() => setShowCreate(false)}
          onCreated={(gym) => { setMyGym(gym); setShowCreate(false); fetchAll(); }}
        />
      )}
      {showJoinCode && (
        <JoinByCodeModal
          onClose={() => setShowJoinCode(false)}
          onJoined={() => { setShowJoinCode(false); fetchAll(); }}
        />
      )}

      <BottomNav />
    </div>
  );
}
