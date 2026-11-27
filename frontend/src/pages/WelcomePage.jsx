import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tx } from "@/i18n/tx";
import { MascotIntro } from "@/components/MascotIntro";
import { DemoPhone } from "@/components/DemoPhone";

export default function WelcomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6" data-testid="welcome-page">
      <div className="w-full max-w-md text-center animate-fade-in">
        {/* Mascot (the real render with the belt), animated: lib/mascotMotion.js */}
        <div className="mb-6" data-testid="app-logo">
          <MascotIntro className="h-36" />
        </div>

        {/* Headlines */}
        <h1 className="text-4xl sm:text-5xl font-heading font-extrabold text-victory-text mb-4" data-testid="welcome-headline">
          {t("welcome.headline")}
        </h1>
        <p className="text-lg text-victory-muted mb-8">
          {t("welcome.subheadline")}
        </p>

        {/* The first screen shows the app working, not a description of it. */}
        <DemoPhone className="mb-8" />

        {/* CTA */}
        <button
          onClick={() => navigate("/login")}
          className="victory-btn-primary flex items-center justify-center gap-2"
          data-testid="setup-profile-btn"
        >
          {t("common.getStarted")}
          <ChevronRight className="w-5 h-5" />
        </button>

        <button onClick={() => navigate("/style")} className="victory-btn-secondary mt-3" data-testid="style-quiz-link">
          {tx("ui.welcomePage.whatKindOfFighter", "What kind of fighter are you? Take the quiz")}
        </button>

        {/* Bullet Points */}
        <ul className="text-left space-y-3 mt-8 mb-6">
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

        <p className="mt-6 text-victory-muted text-sm">
          {t("welcome.alreadyAccount")}{" "}
          <button onClick={() => navigate("/login")} className="text-victory-lime hover:underline inline-block p-2 -m-2" data-testid="login-link">
            {t("common.login")}
          </button>
        </p>

        <div className="mt-3 flex items-center justify-center gap-4 text-victory-muted text-xs">
          <button onClick={() => navigate("/terms")} className="hover:underline touch-target flex items-center" data-testid="welcome-terms-link">
            {t("profile.termsOfService")}
          </button>
          <button onClick={() => navigate("/privacy")} className="hover:underline touch-target flex items-center" data-testid="welcome-privacy-link">
            {t("profile.privacyPolicy")}
          </button>
        </div>
      </div>
    </div>
  );
}
