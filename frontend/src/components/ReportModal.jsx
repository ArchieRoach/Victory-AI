import { useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { X, Flag } from "lucide-react";

const REASONS = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence or dangerous content" },
  { value: "hate", label: "Hate speech" },
  { value: "other", label: "Something else" },
];

// contentType: "post" | "comment" | "stream" | "user"
export function ReportModal({ contentType, contentId, onClose }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!reason) { toast.error("Pick a reason"); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/reports`, {
        content_type: contentType,
        content_id: contentId,
        reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason,
      });
      setDone(true);
    } catch {
      toast.error("Could not submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative mt-auto bg-victory-bg rounded-t-2xl pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-victory-border mx-auto mt-3 mb-1" />

        <div className="flex items-center justify-between px-4 py-3 border-b border-victory-border">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-victory-danger" />
            <p className="text-victory-text font-bold text-sm">Report</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 gap-2 text-center">
            <p className="text-victory-text font-bold">Thanks — we'll review this.</p>
            <p className="text-victory-muted text-sm">Reports help keep Victory AI safe for everyone.</p>
            <button onClick={onClose} className="victory-btn-primary mt-4 px-8">Done</button>
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
              placeholder="Additional details (optional)"
              className="victory-input resize-none"
              rows={2}
              maxLength={280}
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason}
              className="victory-btn-primary w-full disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
