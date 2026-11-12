import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { API, useAuth } from "@/App";

// For accounts with no date of birth saved: an unknown age gets the under-18 defaults, so this
// asks once (it can't be changed afterwards) instead of telling an adult a feature isn't for them.
export function BirthDateCard({ why, onSaved }) {
  const { user, refreshUser } = useAuth();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user || user.birth_date) return null;

  const save = async (e) => {
    e.preventDefault();
    if (!value) return toast.error("Enter your date of birth");
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/users/me/birth-date`, { birth_date: value });
      await refreshUser?.();
      onSaved?.(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't save that. Try again.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="victory-card p-4 space-y-3" data-testid="birth-date-card">
      <p className="section-label flex items-center gap-1.5"><CalendarDays className="w-3 h-3" /> Your date of birth</p>
      <p className="text-victory-text text-sm">{why}</p>
      <input type="date" className="victory-input w-full min-w-0 max-w-full appearance-none block" value={value} onChange={(e) => setValue(e.target.value)}
        max={new Date().toISOString().slice(0, 10)} aria-label="Date of birth" required />
      <p className="text-victory-muted text-xs">You can only set this once.</p>
      <button type="submit" disabled={busy} className="victory-btn-primary w-full disabled:opacity-50">Save</button>
    </form>
  );
}
