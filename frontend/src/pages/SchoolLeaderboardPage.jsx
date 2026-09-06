import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ArrowLeft, GraduationCap, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function SchoolLeaderboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/schools/leaderboard`)
      .then((res) => setSchools(res.data))
      .catch(() => toast.error(t("common.error")))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="school-leaderboard-page">
      <header className="p-4 flex items-center gap-3 border-b border-victory-border">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-heading font-bold text-victory-text flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-victory-lime" />
            {t("schools.title")}
          </h1>
          <p className="text-victory-muted text-xs">{t("schools.subtitle")}</p>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {!user?.school_name && (
          <button
            onClick={() => navigate("/profile")}
            className="victory-card w-full p-4 flex items-center gap-3 text-left border border-victory-lime/30 bg-victory-lime/5"
          >
            <GraduationCap className="w-5 h-5 text-victory-lime flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-victory-text text-sm font-semibold">{t("schools.setYourSchool")}</p>
              <p className="text-victory-muted text-xs">{t("schools.privacyHint")}</p>
            </div>
          </button>
        )}

        {loading ? (
          [1, 2, 3, 4].map((i) => <div key={i} className="skeleton-shimmer h-16 rounded-xl" />)
        ) : schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <GraduationCap className="w-12 h-12 text-victory-muted mb-4" />
            <p className="text-victory-muted">{t("schools.noSchools")}</p>
          </div>
        ) : (
          <div className="victory-card divide-y divide-victory-border">
            {schools.map((s, idx) => (
              <div key={s.school_name} className="p-4 flex items-center gap-3">
                <span className="font-mono text-sm text-victory-muted w-6">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${s.is_my_school ? "text-victory-lime" : "text-victory-text"}`}>
                    {s.school_name}
                    {s.is_my_school && <span className="text-victory-muted font-normal"> {t("schools.yours")}</span>}
                  </p>
                  <p className="text-victory-muted text-xs">
                    <Users className="w-3 h-3 inline mr-0.5" />{s.member_count}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono font-bold text-victory-lime">{s.sessions_this_week}</p>
                  <p className="text-victory-muted text-xs">{t("schools.thisWeek")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
