import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/App';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;

  const [permission, setPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);

  // Sync subscription state on mount
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    setLoading(true);
    try {
      // Ensure SW is registered
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;

      // Ask for permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setLoading(false); return false; }

      // Fetch VAPID public key
      const { data: keyData } = await axios.get(`${API}/push/vapid-key`);
      const appServerKey = urlBase64ToUint8Array(keyData.public_key);

      // Subscribe via Push API
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: appServerKey,
      });

      // Register with backend
      await axios.post(`${API}/push/subscribe`, sub.toJSON());
      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('[push] subscribe failed:', err);
      setLoading(false);
      return false;
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await axios.delete(`${API}/push/subscribe`, { data: { endpoint: sub.endpoint } });
      }
      setSubscribed(false);
    } catch (err) {
      console.error('[push] unsubscribe failed:', err);
    }
    setLoading(false);
  }, []);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
