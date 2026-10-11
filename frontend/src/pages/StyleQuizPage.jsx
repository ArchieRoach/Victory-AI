import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Share2, Swords, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "@/App";
import { QUESTIONS, STYLES, STYLE_STORAGE_KEY, scoreStyle, styleShareText } from "@/lib/fighterStyle";

// Public, no sign-up. See lib/fighterStyle.js for the Goal / Psychology / Design.
export default function StyleQuizPage() {
  const navigate = useNavigate();
  const { user } = useAuth() || {};
  const [answers, setAnswers] = useState([]);
  const done = answers.length === QUESTIONS.length;
  const key = done ? scoreStyle(answers) : null;
  const style = key ? STYLES[key] : null;
  const q = QUESTIONS[answers.length];

  const share = async () => {
    const text = styleShareText(key);
    const url = `${window.location.origin}/style`;
    try {
      if (navigator.share) await navigator.share({ title: "Victory AI", text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast.success("Copied. Paste it anywhere."); }
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Couldn't share that one");
    }
  };

  const trainIt = async () => {
    if (user) {
      try {
        await axios.put(`${API}/users/me/style`, { style: key, train_it: true });
        toast.success(`Your partner will coach you as a ${style.name}.`);
      } catch { /* the quiz result still stands; training works without it */ }
      navigate("/train");
      return;
    }
    try { localStorage.setItem(STYLE_STORAGE_KEY, key); } catch { /* private mode */ }
    navigate("/welcome");
  };

  return (
    <div className="min-h-screen bg-victory-bg" data-testid="style-quiz">
      <header className="p-4 flex items-center gap-2 border-b border-victory-border">
        <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label="Back"
          onClick={() => (answers.length && !done ? setAnswers(answers.slice(0, -1)) : navigate(-1))}>
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div>
          <h1 className="text-xl font-heading font-extrabold text-victory-text">What kind of fighter are you?</h1>
          <p className="text-victory-muted text-sm">{done ? "Your style" : `Question ${answers.length + 1} of ${QUESTIONS.length}`}</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {!done && (
          <>
            <div className="h-1.5 rounded-full bg-victory-card-highlight overflow-hidden" aria-hidden="true">
              <div className="h-full bg-victory-lime rounded-full transition-all" style={{ width: `${(100 * answers.length) / QUESTIONS.length}%` }} />
            </div>
            <p className="text-victory-text font-heading font-extrabold text-2xl pt-2">{q.q}</p>
            <div className="space-y-2">
              {q.a.map(([label], i) => (
                <button key={label} onClick={() => setAnswers([...answers, i])}
                  className="victory-card p-4 w-full text-left text-victory-text font-semibold active:scale-[0.99] transition-transform min-h-[56px]">
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {done && (
          <>
            <section className="victory-card p-6 text-center border-victory-lime/30 bg-victory-lime/5" data-testid="style-result">
              <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mx-auto mb-4">
                <Swords className="w-8 h-8 text-victory-lime" />
              </div>
              <p className="section-label">You fight like {style.legend}</p>
              <p className="text-gradient font-heading font-extrabold text-4xl mt-1">{style.name}</p>
              <p className="text-victory-text text-sm mt-3">{style.blurb}</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {style.focus.map((f) => (
                  <span key={f} className="text-[11px] font-heading font-bold px-2.5 py-1 rounded-full bg-victory-lime/10 text-victory-lime">{f}</span>
                ))}
              </div>
            </section>

            <section className="victory-card p-4">
              <p className="section-label mb-1">What would make you dangerous</p>
              <p className="text-victory-text text-sm">{style.gap}</p>
            </section>

            <button className="victory-btn-primary" onClick={trainIt}>Train like a {style.name}</button>
            <p className="text-victory-muted text-[11px] text-center -mt-2">Your AI partner builds every session around your style and scores your rounds from video.</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="victory-btn-secondary flex items-center justify-center gap-2" onClick={share}><Share2 className="w-4 h-4" /> Share</button>
              <button className="victory-btn-ghost flex items-center justify-center gap-2" onClick={() => setAnswers([])}><RotateCcw className="w-4 h-4" /> Retake</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
