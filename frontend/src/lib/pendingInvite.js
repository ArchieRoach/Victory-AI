// A /join link opened while signed out has to survive the trip through sign-up.
const KEY = "victory_pending_invite";

export function savePendingInvite(inviteId) {
  try { localStorage.setItem(KEY, inviteId); } catch {}
}

export function takePendingInvite() {
  try {
    const id = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return id && /^[a-f0-9]{1,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
