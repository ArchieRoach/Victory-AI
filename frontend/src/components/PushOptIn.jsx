import { useState } from "react";
import { Bell, Share, SquarePlus, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { analytics } from "@/lib/analytics";

const DISMISS_KEY = "victory_install_steps_dismissed";

const readDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
};

export function InstallSteps({ onDismiss }) {
  return (
    <div className="space-y-2" data-testid="ios-install-steps">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-victory-lime flex-shrink-0" />
          <p className="text-victory-text text-sm font-semibold">Get reminders on your iPhone</p>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" className="w-11 h-11 -m-3 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-victory-muted text-xs">iPhone only sends notifications to apps on your Home Screen. Takes 10 seconds:</p>
      <ol className="space-y-1.5 text-xs text-victory-text">
        <li className="flex items-center gap-2">
          <span className="font-mono text-victory-lime">1</span> Tap <Share className="w-3.5 h-3.5 text-victory-teal" aria-label="Share" /> in Safari's toolbar
        </li>
        <li className="flex items-center gap-2">
          <span className="font-mono text-victory-lime">2</span> Choose <SquarePlus className="w-3.5 h-3.5 text-victory-teal" aria-hidden="true" /> Add to Home Screen
        </li>
        <li className="flex items-center gap-2">
          <span className="font-mono text-victory-lime">3</span> Open Victory AI from your Home Screen and turn reminders on
        </li>
      </ol>
    </div>
  );
}

// Asked at the moment push is worth something to the fighter (they just booked a round
// and want the reminder), never as a cold prompt — iOS only lets us ask once.
export function PushOptIn({ reason = "booking" }) {
  const { mode, permission, subscribed, loading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (mode === "install-ios") {
    if (dismissed) return null;
    const dismiss = () => {
      setDismissed(true);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    };
    return (
      <section className="victory-card p-4" data-testid="push-opt-in">
        <InstallSteps onDismiss={dismiss} />
      </section>
    );
  }

  if ((mode !== "web" && mode !== "native") || subscribed || permission === "denied") return null;

  const enable = async () => {
    const result = await subscribe();
    analytics.capture("push_opt_in", { reason, mode, result });
    if (result === "subscribed") toast.success("Reminders on — we'll ping you when it's time.");
    else if (result === "denied") toast.error("Notifications are off — turn them on in Settings.");
  };

  return (
    <section className="victory-card p-4 flex items-center gap-3" data-testid="push-opt-in">
      <div className="w-10 h-10 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
        <Bell className="w-5 h-5 text-victory-lime" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-victory-text text-sm font-semibold">Want the reminder?</p>
        <p className="text-victory-muted text-xs">Notifications are off on this device.</p>
      </div>
      <button onClick={enable} disabled={loading} className="victory-btn-secondary w-auto px-4 min-h-[44px] text-sm disabled:opacity-50">
        {loading ? "…" : "Turn on"}
      </button>
    </section>
  );
}
