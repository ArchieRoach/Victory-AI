import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { API } from '@/App';
import { currentPushMode } from '@/lib/pushPlatform';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// The App Store build answers these with { permission, subscribed } (ios/.../PushBridge.swift).
const nativePush = (action) => window.webkit.messageHandlers.victoryPush.postMessage({ action });

export function usePushNotifications() {
  const [mode] = useState(currentPushMode);
  const supported = mode === 'web' || mode === 'native';

  const [permission, setPermission] = useState(() =>
    mode === 'web' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);

  const applyNative = (state) => {
    setPermission(state?.permission || 'default');
    setSubscribed(!!state?.subscribed);
    return !!state?.subscribed;
  };

  useEffect(() => {
    if (mode === 'native') {
      nativePush('status').then(applyNative).catch(() => {});
      return;
    }
    if (mode !== 'web') return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [mode]);

  // Resolves to 'subscribed', 'denied' (the user said no — only Settings can undo it) or 'failed'.
  const subscribe = useCallback(async () => {
    if (!supported) return 'failed';
    setLoading(true);
    try {
      if (mode === 'native') {
        const state = await nativePush('enable');
        setLoading(false);
        return applyNative(state) ? 'subscribed' : state?.permission === 'denied' ? 'denied' : 'failed';
      }

      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setLoading(false); return perm === 'denied' ? 'denied' : 'failed'; }

      const { data: keyData } = await axios.get(`${API}/push/vapid-key`);
      const appServerKey = urlBase64ToUint8Array(keyData.public_key);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: appServerKey,
      });

      await axios.post(`${API}/push/subscribe`, sub.toJSON());
      setSubscribed(true);
      setLoading(false);
      return 'subscribed';
    } catch (err) {
      console.error('[push] subscribe failed:', err);
      toast.error("Couldn't enable notifications — try again.");
      setLoading(false);
      return 'failed';
    }
  }, [supported, mode]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'native') {
        applyNative(await nativePush('disable'));
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await axios.delete(`${API}/push/subscribe`, { data: { endpoint: sub.endpoint } });
        }
        setSubscribed(false);
      }
    } catch (err) {
      console.error('[push] unsubscribe failed:', err);
      toast.error("Couldn't disable notifications — try again.");
    }
    setLoading(false);
  }, [mode]);

  return { mode, supported, permission, subscribed, loading, subscribe, unsubscribe };
}
