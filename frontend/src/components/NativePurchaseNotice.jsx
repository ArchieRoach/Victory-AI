import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, X } from "lucide-react";

// Deliberately neutral: Guideline 3.1.3(b) lets the iOS app unlock purchases made
// elsewhere, but it may not link to, price, or tell users where to buy them.
const COPY = {
  title: "Not available in the app",
  body: "This isn't available in the Victory AI iOS app. Anything already on your account works here as normal.",
};

function NoticeBody() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-victory-lime/10 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-victory-lime" />
      </div>
      <h2 className="font-heading font-extrabold text-victory-text text-xl mb-2">{COPY.title}</h2>
      <p className="text-victory-muted text-sm max-w-xs leading-relaxed">{COPY.body}</p>
    </div>
  );
}

export function NativePurchaseNoticePage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-victory-bg flex flex-col">
      <div className="px-4 py-3">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 pb-24">
        <NoticeBody />
      </div>
    </div>
  );
}

export function NativePurchaseNoticeModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-victory-bg border border-victory-border rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-end px-2 pt-2">
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target">
            <X className="w-5 h-5 text-victory-muted hover:text-victory-text" />
          </button>
        </div>
        <div className="px-6 pb-8">
          <NoticeBody />
        </div>
      </div>
    </div>
  );
}
