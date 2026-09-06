import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Swords, Plus, Users, ChevronRight, X, Flame } from "lucide-react";
import { useTranslation } from "react-i18next";

function CreateSquadModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error(t("squads.nameRequired"));
    setLoading(true);
    try {
      const res = await axios.post(`${API}/squads`, { name: name.trim() });
      toast.success(t("squads.created"));
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
          <h2 className="text-lg font-heading font-bold text-victory-text">{t("squads.createTitle")}</h2>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label className="victory-label">{t("squads.nameLabel")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="victory-input" placeholder={t("squads.namePlaceholder")} maxLength={40} />
        </div>
        <button onClick={submit} disabled={loading} className="victory-btn-primary w-full">
          {loading ? t("common.saving") : t("squads.createBtn")}
        </button>
      </div>
    </div>
  );
}

function JoinSquadModal({ onClose, onJoined }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/squads/join-by-code`, { invite_code: code.trim() });
      toast.success(t("squads.joined", { name: res.data.name }));
      onJoined(res.data.squad_id);
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
          <h2 className="text-lg font-heading font-bold text-victory-text">{t("squads.joinByCode")}</h2>
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

export default function SquadsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    fetchSquads();
  }, []);

  const fetchSquads = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/squads/mine`);
      setSquads(res.data);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="squads-page">
      <header className="p-4 border-b border-victory-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text flex items-center gap-2">
              <Swords className="w-5 h-5 text-victory-lime" />
              {t("squads.title")}
            </h1>
            <p className="text-victory-muted text-sm">{t("squads.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowJoin(true)} className="victory-btn-ghost px-3 py-1.5 text-sm">
              {t("squads.joinByCode")}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              aria-label={t("squads.createBtn")}
              className="w-11 h-11 rounded-full bg-victory-lime flex items-center justify-center touch-target"
            >
              <Plus className="w-5 h-5 text-victory-bg" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => <div key={i} className="skeleton-shimmer h-20 rounded-xl" />)
        ) : squads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Flame className="w-12 h-12 text-victory-muted mb-4" />
            <p className="text-victory-text font-bold">{t("squads.noSquads")}</p>
            <p className="text-victory-muted text-sm mt-1">{t("squads.noSquadsHint")}</p>
          </div>
        ) : (
          squads.map((squad) => (
            <button
              key={squad.squad_id}
              onClick={() => navigate(`/squads/${squad.squad_id}`)}
              className="victory-card w-full p-4 flex items-center gap-3 text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-victory-lime/10 flex items-center justify-center flex-shrink-0">
                <Swords className="w-5 h-5 text-victory-lime" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-victory-text truncate">{squad.name}</p>
                <p className="text-victory-muted text-xs">
                  <Users className="w-3 h-3 inline mr-0.5" />{squad.member_count}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-victory-muted flex-shrink-0" />
            </button>
          ))
        )}
      </main>

      {showCreate && (
        <CreateSquadModal
          onClose={() => setShowCreate(false)}
          onCreated={(squad) => { setShowCreate(false); navigate(`/squads/${squad.squad_id}`); }}
        />
      )}
      {showJoin && (
        <JoinSquadModal
          onClose={() => setShowJoin(false)}
          onJoined={(squadId) => { setShowJoin(false); navigate(`/squads/${squadId}`); }}
        />
      )}

      <BottomNav />
    </div>
  );
}
