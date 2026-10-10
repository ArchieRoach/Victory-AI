import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { brag } from "@/lib/progression";

// Goal: permission to show off, at the moment it feels earned.
// Psychology: peak-end; the high point right after a win is when sharing feels natural, not needy.
// Design: one tap opens the phone's share sheet with an honest line about the win.
export function BragButton({ win, label = "Brag about it", className = "" }) {
  const [busy, setBusy] = useState(false);
  if (!win) return null;
  const onClick = async () => {
    setBusy(true);
    try {
      const result = await brag(win);
      if (result === "copied") toast.success("Copied. Paste it anywhere.");
      if (result === "unavailable") toast.error("Sharing isn't available on this device");
    } catch {
      toast.error("Couldn't share that one");
    }
    setBusy(false);
  };
  return (
    <button type="button" onClick={onClick} disabled={busy} data-testid="brag-button"
      className={`victory-btn-secondary flex items-center justify-center gap-2 ${className}`}>
      <Share2 className="w-4 h-4" /> {label}
    </button>
  );
}
