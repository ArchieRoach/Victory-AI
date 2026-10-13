import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Download, Printer, BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";

// Your boxing on Victory AI, yours to keep. Reasoning: see "Fight Story" in backend/server.py.
export default function FightStoryPage() {
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [form, setForm] = useState({ years_boxing: 0, sessions_per_week: 0 });

  const load = () => axios.get(`${API}/users/me/fight-story`).then((r) => {
    setStory(r.data);
    if (r.data.prior_experience) setForm({ years_boxing: r.data.prior_experience.years_boxing, sessions_per_week: r.data.prior_experience.sessions_per_week });
  }).catch(() => setStory(false));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    const blob = new Blob([JSON.stringify(story, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fight-story-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveHistory = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/users/me/history`, { years_boxing: Number(form.years_boxing) || 0, sessions_per_week: Number(form.sessions_per_week) || 0 });
      toast.success("Your history is on your Fight Story");
      load();
    } catch {
      toast.error("Couldn't save that, check the numbers");
    }
  };

  if (story === false) {
    return <div className="min-h-screen bg-victory-bg p-6 text-victory-muted">Couldn't load your Fight Story. Check your connection.</div>;
  }

  return (
    <div className="min-h-screen bg-victory-bg pb-16" data-testid="fight-story">
      <header className="p-4 flex items-center gap-2 border-b border-victory-border print:hidden">
        <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div>
          <h1 className="text-xl font-heading font-extrabold text-victory-text">Your Fight Story</h1>
          <p className="text-victory-muted text-sm">Everything you've built here. Yours to keep.</p>
        </div>
        <button className="ml-auto text-[12px] text-victory-lime font-semibold flex items-center gap-1 min-h-[44px]" onClick={() => navigate("/wrapped")}>
          <Sparkles className="w-3.5 h-3.5" /> Season Wrapped
        </button>
      </header>

      {!story ? <div className="max-w-lg mx-auto p-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-24 rounded-lg" />)}</div> : (
        <main className="max-w-lg mx-auto p-4 space-y-4">
          <section className="victory-card p-5 text-center">
            <BookOpen className="w-6 h-6 text-victory-lime mx-auto mb-2" />
            <p className="text-victory-text font-heading font-extrabold text-2xl">{story.name}</p>
            {story.style && <p className="text-victory-teal text-sm font-semibold">{story.style}</p>}
            <p className="text-victory-muted text-[12px] mt-1">{story.since ? `Training on Victory AI since ${story.since}` : "Your story starts with your first session"}</p>
          </section>

          <section className="grid grid-cols-3 gap-2">
            {[["Level", story.level], ["Proven hours", story.mastery.verified_hours], ["Sessions", story.sessions.total],
              ["AI-scored", story.sessions.scored], ["Best streak", `${story.sessions.longest_streak}d`], ["Belts", story.belts.length]].map(([label, value]) => (
              <div key={label} className="stat-pill">
                <span className="font-mono font-bold text-xl text-victory-lime">{value}</span>
                <span className="text-victory-muted text-xs mt-1">{label}</span>
              </div>
            ))}
          </section>

          {story.mastery.tier && (
            <p className="text-sm text-victory-text"><span className="text-victory-teal font-semibold">{story.mastery.tier}</span> on the road to 10,000 proven hours.</p>
          )}

          {Object.keys(story.personal_bests).length > 0 && (
            <section className="victory-card p-4">
              <p className="section-label mb-2">Personal bests</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(story.personal_bests).map(([k, v]) => (
                  <li key={k} className="flex justify-between text-[12px]"><span className="text-victory-muted">{k}</span><span className="font-mono text-victory-text">{v}</span></li>
                ))}
              </ul>
            </section>
          )}

          {(story.gloves.length > 0 || story.crowns.length > 0 || story.belts.length > 0) && (
            <section className="victory-card p-4">
              <p className="section-label mb-2">Honours</p>
              <p className="text-[12px] text-victory-text">{[...story.gloves.map((g) => g.name), ...story.crowns.map((c) => `${c.name} (${c.week_id})`), ...story.belts.map((b) => b.name)].join(" · ")}</p>
            </section>
          )}

          <section className="victory-card p-4 space-y-2 print:hidden">
            <p className="section-label">Boxing before Victory AI</p>
            <p className="text-[11px] text-victory-muted">Shown on your Fight Story as self-reported. It never counts as proven hours or levels.</p>
            <form onSubmit={saveHistory} className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-victory-muted">Years boxing
                <input type="number" min={0} max={60} className="victory-input mt-1" value={form.years_boxing}
                  onChange={(e) => setForm({ ...form, years_boxing: e.target.value })} />
              </label>
              <label className="text-[11px] text-victory-muted">Sessions a week
                <input type="number" min={0} max={21} className="victory-input mt-1" value={form.sessions_per_week}
                  onChange={(e) => setForm({ ...form, sessions_per_week: e.target.value })} />
              </label>
              <button type="submit" className="victory-btn-secondary col-span-2">Save my history</button>
            </form>
          </section>
          {story.prior_experience?.years_boxing > 0 && (
            <p className="text-[12px] text-victory-muted">Boxing for {story.prior_experience.years_boxing} years before joining, about {story.prior_experience.sessions_per_week} sessions a week (self-reported).</p>
          )}

          <div className="grid grid-cols-2 gap-2 print:hidden">
            <button className="victory-btn-ghost flex items-center justify-center gap-2" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print or PDF</button>
            <button className="victory-btn-ghost flex items-center justify-center gap-2" onClick={download}><Download className="w-4 h-4" /> Download</button>
          </div>
          <p className="text-[11px] text-victory-muted print:hidden">Want everything, including every post and message? Use "Download my data" on your Profile.</p>
        </main>
      )}
    </div>
  );
}
