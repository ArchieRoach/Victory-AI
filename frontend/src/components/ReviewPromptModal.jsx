import { Trophy, Star, X } from "lucide-react";
import { useTranslation } from "react-i18next";

// Only ever fires after a real, verified win (see CompetitionDetailPage.jsx) — never on
// a generic app-open or session count, per the standing rule that engagement prompts must
// be tied to genuine user achievement, not a fabricated or convenient moment.
const APP_STORE_URL = process.env.REACT_APP_APP_STORE_URL || "";
const PLAY_STORE_URL = process.env.REACT_APP_PLAY_STORE_URL || "";

export const REVIEW_PROMPT_STORAGE_KEY = "victory_review_prompt_status";
const DECLINE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 1 month

// Neither store URL configured yet (app not live on a store) — nothing to send someone
// to, so the caller should not show this at all rather than dead-ending a real fan.
export const reviewPromptAvailable = () => !!(APP_STORE_URL || PLAY_STORE_URL);

// Once actually rated: never ask again — that's a settled, permanent answer. Once
// declined: respected for a month, then eligible again on the next real win, rather than
// silenced forever over one "not now" that might've just been bad timing.
export const canShowReviewPrompt = () => {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(REVIEW_PROMPT_STORAGE_KEY) || "null");
  } catch {
    return true;
  }
  if (!stored) return true;
  if (stored.status === "rated") return false;
  if (stored.status === "declined") return Date.now() - stored.at >= DECLINE_COOLDOWN_MS;
  return true;
};

export function ReviewPromptModal({ onClose }) {
  const { t } = useTranslation();

  const handleRate = () => {
    window.open(APP_STORE_URL || PLAY_STORE_URL, "_blank", "noopener,noreferrer");
    localStorage.setItem(REVIEW_PROMPT_STORAGE_KEY, JSON.stringify({ status: "rated", at: Date.now() }));
    onClose();
  };

  const handleDecline = () => {
    // Not a permanent no — just "not this win". Eligible again in a month if another
    // real win comes in; see canShowReviewPrompt().
    localStorage.setItem(REVIEW_PROMPT_STORAGE_KEY, JSON.stringify({ status: "declined", at: Date.now() }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={handleDecline}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative mt-auto bg-victory-bg rounded-t-2xl pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-victory-border mx-auto mt-3 mb-1" />

        <div className="flex items-center justify-end px-4 pt-2">
          <button onClick={handleDecline} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-8 pt-2 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-victory-lime/10 flex items-center justify-center mb-4">
            <Trophy className="w-8 h-8 text-victory-lime" />
          </div>
          <p className="text-victory-text font-heading font-extrabold text-lg mb-2">{t("review.title")}</p>
          <p className="text-victory-muted text-sm mb-6">{t("review.body")}</p>

          <button onClick={handleRate} className="victory-btn-primary w-full flex items-center justify-center gap-2 mb-3">
            <Star className="w-4 h-4 fill-current" />
            {t("review.rateBtn")}
          </button>
          <button onClick={handleDecline} className="w-full touch-target flex items-center justify-center text-victory-muted text-sm">
            {t("review.notNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
