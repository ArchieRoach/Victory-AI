import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const PLACEHOLDER_DIMENSIONS = [
  { name: "Jab", value: 7 },
  { name: "Cross", value: 6 },
  { name: "Head Movement", value: 5 },
  { name: "Footwork", value: 8 },
  { name: "Guard", value: 6 },
  { name: "Combinations", value: 7 },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6" data-testid="welcome-page">
      <div className="w-full max-w-md text-center animate-fade-in">
        {/* Logo */}
        <div className="mb-8">
          <img
            src="/victory-logo.png"
            alt="Victory AI"
            className="w-48 h-48 mx-auto object-contain"
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

        {/* Placeholder Radar Preview */}
        <div className="victory-card p-6 mb-8">
          <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto" data-testid="radar-preview">
            {[0.33, 0.66, 1].map((scale, i) => (
              <polygon
                key={i}
                points={PLACEHOLDER_DIMENSIONS.map((_, idx) => {
                  const angle = (idx * 60 - 90) * (Math.PI / 180);
                  const r = 80 * scale;
                  return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                }).join(" ")}
                fill="none"
                stroke="#2A2A3A"
                strokeWidth="1"
              />
            ))}
            <polygon
              points={PLACEHOLDER_DIMENSIONS.map((d, idx) => {
                const angle = (idx * 60 - 90) * (Math.PI / 180);
                const r = (d.value / 10) * 80;
                return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
              }).join(" ")}
              fill="#E8FF47"
              fillOpacity="0.3"
              stroke="#E8FF47"
              strokeWidth="2"
            />
            <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" className="fill-victory-lime font-heading text-2xl font-extrabold">
              6.5
            </text>
          </svg>
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
          <button onClick={() => navigate("/login")} className="text-victory-lime hover:underline" data-testid="login-link">
            {t("common.login")}
          </button>
        </p>

        <button onClick={() => navigate("/privacy")} className="mt-3 text-victory-muted text-xs hover:underline" data-testid="welcome-privacy-link">
          {t("profile.privacyPolicy")}
        </button>
      </div>
    </div>
  );
}
