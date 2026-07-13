import { useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { MessageSquarePlus, X, Bug, Lightbulb, MessageCircle, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/App";

const TYPES = [
  { key: "bug",     icon: Bug,          labelKey: "feedback.typeBug" },
  { key: "feature", icon: Lightbulb,    labelKey: "feedback.typeFeature" },
  { key: "general", icon: MessageCircle, labelKey: "feedback.typeGeneral" },
];

const HIDDEN_PATHS = ["/welcome", "/login", "/onboarding", "/paywall", "/payment", "/stream/", "/go-live"];

export default function FeedbackWidget() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [messageError, setMessageError] = useState(false);

  const hidden = HIDDEN_PATHS.some((p) => location.pathname.startsWith(p));
  if (!isAuthenticated || hidden) return null;

  const reset = () => {
    setType("general");
    setMessage("");
    setRating(0);
    setHoverRating(0);
    setDone(false);
    setMessageError(false);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(reset, 300);
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      setMessageError(true);
      return;
    }
    setMessageError(false);
    setSubmitting(true);
    try {
      await axios.post(`${API}/feedback`, {
        type,
        message: message.trim(),
        rating: rating || null,
        page: location.pathname,
      });
      setDone(true);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-victory-lime text-victory-bg flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        aria-label={t("feedback.title")}
      >
        <MessageSquarePlus className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={handleClose}
        />
      )}

      {/* Sheet */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 bg-victory-card border-t border-victory-border rounded-t-2xl p-5 space-y-4 transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"}`}>
        {done ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-14 h-14 rounded-full bg-victory-lime/20 flex items-center justify-center">
              <Star className="w-7 h-7 text-victory-lime" />
            </div>
            <p className="font-heading font-bold text-victory-text text-lg">{t("feedback.thanks")}</p>
            <p className="text-victory-muted text-sm text-center">{t("feedback.thanksDesc")}</p>
            <button onClick={handleClose} className="victory-btn-primary mt-2 px-8">
              {t("common.back")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-victory-text">{t("feedback.title")}</h2>
              <button onClick={handleClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target rounded-full bg-victory-border text-victory-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Type selector */}
            <div className="flex gap-2">
              {TYPES.map(({ key, icon: Icon, labelKey }) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    type === key ? "bg-victory-lime text-victory-bg" : "bg-victory-bg border border-victory-border text-victory-muted"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t(labelKey)}
                </button>
              ))}
            </div>

            {/* Star rating */}
            <div>
              <p className="text-victory-muted text-xs mb-1.5">{t("feedback.ratingLabel")}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star === rating ? 0 : star)}
                    className="text-2xl leading-none transition-colors"
                  >
                    <Star
                      className="w-7 h-7"
                      fill={(hoverRating || rating) >= star ? "#E8FF47" : "transparent"}
                      stroke={(hoverRating || rating) >= star ? "#E8FF47" : "#2A2A3A"}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="victory-label">{t("feedback.messageLabel")}</label>
              <textarea
                value={message}
                onChange={(e) => { setMessage(e.target.value); if (e.target.value.trim()) setMessageError(false); }}
                className={`victory-input resize-none ${messageError ? "border-red-500" : ""}`}
                rows={3}
                placeholder={t("feedback.messagePlaceholder")}
                maxLength={1000}
              />
              {messageError && (
                <p className="text-red-400 text-xs mt-1">{t("feedback.messageRequired")}</p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="victory-btn-primary w-full disabled:opacity-40"
            >
              {submitting ? t("feedback.sending") : t("feedback.send")}
            </button>
          </>
        )}
      </div>
    </>
  );
}
