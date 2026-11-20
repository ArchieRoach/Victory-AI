import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { X, Flag } from "lucide-react";
import { tx } from "@/i18n/tx";

const REASONS = [
  { value: "spam", get label() { return tx("ui.reportModal.spamOrScam", "Spam or scam"); } },
  { value: "harassment", get label() { return tx("ui.reportModal.harassmentOrBullying", "Harassment or bullying"); } },
  { value: "nudity", get label() { return tx("ui.reportModal.nudityOrSexualContent", "Nudity or sexual content"); } },
  { value: "violence", get label() { return tx("ui.reportModal.violenceOrDangerousContent", "Violence or dangerous content"); } },
  { value: "hate", get label() { return tx("ui.reportModal.hateSpeech", "Hate speech"); } },
  { value: "other", get label() { return tx("ui.reportModal.somethingElse", "Something else"); } },
];

// contentType: "post" | "comment" | "stream" | "user"
export function ReportModal({ contentType, contentId, onClose }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!reason) { toast.error(tx("ui.reportModal.pickAReason", "Pick a reason")); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/reports`, {
        content_type: contentType,
        content_id: contentId,
        reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason,
      });
      setDone(true);
    } catch {
      toast.error(tx("ui.reportModal.couldNotSubmitReport", "Could not submit report"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet onClose={onClose} label={tx("ui.reportModal.report", "Report")} className="w-full max-w-lg mx-auto">
      {({ close }) => (
      <div className="overflow-y-auto min-h-0 flex-1">

        <div className="flex items-center justify-between px-4 py-3 border-b border-victory-border">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-victory-danger" />
            <p className="text-victory-text font-bold text-sm">{tx("ui.reportModal.report", "Report")}</p>
          </div>
          <button onClick={() => close()} aria-label={tx("ui.reportModal.close", "Close")} className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 gap-2 text-center">
            <p className="text-victory-text font-bold">{tx("ui.reportModal.thanksWeLlReview", "Thanks — we'll review this.")}</p>
            <p className="text-victory-muted text-sm">{tx("ui.reportModal.reportsHelpKeepVictory", "Reports help keep Victory AI safe for everyone.")}</p>
            <button onClick={() => close()} className="victory-btn-primary mt-4 px-8">{tx("ui.reportModal.done", "Done")}</button>
          </div>
        ) : (
          <div className="p-4 space-y-2 pb-8">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  reason === r.value
                    ? "bg-victory-lime/10 border-victory-lime text-victory-lime"
                    : "bg-victory-card border-victory-border text-victory-text"
                }`}
              >
                {r.label}
              </button>
            ))}
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={tx("ui.reportModal.additionalDetailsOptional", "Additional details (optional)")}
              className="victory-input resize-none"
              rows={2}
              maxLength={280}
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason}
              className="victory-btn-primary w-full disabled:opacity-40"
            >
              {submitting ? tx("ui.reportModal.submitting", "Submitting…") : tx("ui.reportModal.submitReport", "Submit report")}
            </button>
          </div>
        )}
      </div>
      )}
    </BottomSheet>
  );
}
