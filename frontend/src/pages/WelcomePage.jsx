import { useNavigate } from "react-router-dom";
import { ChevronRight, Swords, Shield, Footprints } from "lucide-react";
import { useTranslation } from "react-i18next";

// Same 3-ring category pattern SessionResultsPage.jsx actually shows after a real
// session — a real user complained the old 16-spoke radar chart here "doesn't really
// mean anything" and was too small to read, so that page was rebuilt around this.
// This preview was still showing the old radar chart, which is both stale UI and a
// dishonest preview: it no longer represents what the product actually looks like.
const PREVIEW_CATEGORIES = [
  { key: "Offense", icon: Swords, color: "#E8FF47", value: 7.5 },
  { key: "Defense", icon: Shield, color: "#47E8C8", value: 6.0 },
  { key: "Movement", icon: Footprints, color: "#FF6B35", value: 8.0 },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6" data-testid="welcome-page">
      <div className="w-full max-w-md text-center animate-fade-in">
        {/* Mascot, wearing the actual belt design baked into the render itself (built
            with Nano Banana from the real victory-logo.png as a reference) — one image,
            not a layered composite. */}
        <div className="mb-8">
          <img
            src="/mascot-render.png"
            alt="Victory AI"
            className="w-64 mx-auto object-contain rounded-2xl"
            data-testid="app-logo"
          />
        </div>

        {/* Headlines */}
        <h1 className="text-4xl sm:text-5xl font-heading font-extrabold text-victory-text mb-4" data-testid="welcome-headline">
          {t("welcome.headline")}
        </h1>
        <p className="text-lg text-victory-muted mb-8">
          {t("welcome.subheadline")}
        </p>

        {/* Category ring preview — matches the real post-session results screen */}
        <div className="victory-card p-6 mb-8">
          <div className="grid grid-cols-3 gap-3" data-testid="radar-preview">
            {PREVIEW_CATEGORIES.map(({ key, icon: Icon, color, value }) => {
              const circumference = 2 * Math.PI * 28;
              return (
                <div key={key} className="flex flex-col items-center text-center">
                  <div className="relative w-16 h-16 mb-2">
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                      <circle
                        cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${(value / 10) * circumference} ${circumference}`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icon className="w-6 h-6" style={{ color }} />
                    </div>
                  </div>
                  <p className="font-mono font-bold text-lg text-victory-text">{value.toFixed(1)}</p>
                  <p className="text-victory-muted text-xs">{key}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bullet Points */}
        <ul className="text-left space-y-3 mb-10">
          <li className="flex items-start gap-3 text-victory-text">
            <span className="text-victory-lime text-lg">🥊</span>
            <span>{t("welcome.feature1")}</span>
          </li>
          <li className="flex items-start gap-3 text-victory-text">
            <span className="text-victory-teal text-lg">📹</span>
            <span>{t("welcome.feature2")}</span>
          </li>
          <li className="flex items-start gap-3 text-victory-text">
            <span className="text-victory-orange text-lg">📈</span>
            <span>{t("welcome.feature3")}</span>
          </li>
        </ul>

        {/* CTA */}
        <button
          onClick={() => navigate("/login")}
          className="victory-btn-primary flex items-center justify-center gap-2"
          data-testid="setup-profile-btn"
        >
          {t("common.getStarted")}
          <ChevronRight className="w-5 h-5" />
        </button>

        <p className="mt-6 text-victory-muted text-sm">
          {t("welcome.alreadyAccount")}{" "}
          <button onClick={() => navigate("/login")} className="text-victory-lime hover:underline inline-block p-2 -m-2" data-testid="login-link">
            {t("common.login")}
          </button>
        </p>

        <button onClick={() => navigate("/privacy")} className="mt-3 text-victory-muted text-xs hover:underline touch-target flex items-center justify-center" data-testid="welcome-privacy-link">
          {t("profile.privacyPolicy")}
        </button>
      </div>
    </div>
  );
}
