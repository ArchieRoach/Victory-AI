// Which requests get the sign-in token. Only our own server: outside services (Cloudinary uploads,
// image hosts) never see it. Cloudinary also refuses uploads that carry an Authorization header,
// which is why filmed rounds failed with "Network Error" and were never scored.
export function sendsToken(url, backendUrl) {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return true;
  if (!backendUrl) return false;
  try {
    return new URL(url).origin === new URL(backendUrl).origin;
  } catch {
    return false;
  }
}
