import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

const STORAGE_KEY = 'victory_push_prompt_dismissed';

// Show the prompt once, at least 60s after first login, never if already denied/granted.
export function PushPrompt() {
  const { supported, permission, subscribed, loading, subscribe } = usePushNotifications();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!supported) return;
    if (permission === 'granted' || permission === 'denied') return;
    if (subscribed) return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const timer = setTimeout(() => setVisible(true), 60_000);
    return () => clearTimeout(timer);
  }, [supported, permission, subscribed]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  };

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      toast.success('Notifications enabled — we\'ll keep you in the fight.');
      dismiss();
    } else if (Notification.permission === 'denied') {
      toast.error('Notifications blocked — enable them in your browser settings.');
      dismiss();
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-victory-card border border-victory-lime/30 rounded-2xl p-4 shadow-2xl flex gap-3 items-start">
        <div className="w-10 h-10 rounded-xl bg-victory-lime/10 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-victory-lime" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-victory-text text-sm font-bold">Stay in the fight</p>
          <p className="text-victory-muted text-xs mt-0.5">
            Get notified when someone tips you, goes live, or reacts to your posts.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleEnable}
              disabled={loading}
              className="flex-1 py-2 rounded-xl bg-victory-lime text-victory-bg text-xs font-bold disabled:opacity-50"
            >
              {loading ? 'Enabling…' : 'Enable notifications'}
            </button>
            <button
              onClick={dismiss}
              className="py-2 px-3 rounded-xl border border-victory-border text-victory-muted text-xs hover:text-victory-text transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="w-11 h-11 -m-2.5 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
