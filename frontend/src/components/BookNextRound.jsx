import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { CalendarClock, Check, X } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { bookingChips, isQuietHour, formatBooking } from "@/lib/booking";

const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Loads the next trigger at the moment of highest motivation: straight after the reward,
// the fighter picks when they'll be back and what they'll work on. The push arrives at
// the time they chose, in their words.
export function BookNextRound({ focusOptions = [] }) {
  const chips = useMemo(() => bookingChips(), []);
  const [existing, setExisting] = useState(undefined);
  const [chip,     setChip]     = useState(null);
  const [custom,   setCustom]   = useState("");
  const [focus,    setFocus]    = useState(focusOptions[0] || null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    axios.get(`${API}/bookings/next`).then((r) => setExisting(r.data || null)).catch(() => setExisting(null));
  }, []);

  useEffect(() => { if (!focus && focusOptions[0]) setFocus(focusOptions[0]); }, [focusOptions, focus]);

  const chosenDate = chip === "custom" ? (custom ? new Date(custom) : null) : chips.find((c) => c.key === chip)?.date;

  const book = async () => {
    if (!chosenDate) return;
    if (isQuietHour(chosenDate)) {
      toast.error("Pick a time between 7am and 10pm");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`${API}/bookings`, {
        at: chosenDate.toISOString(),
        tz_offset_minutes: new Date().getTimezoneOffset(),
        focus,
      });
      setExisting(res.data);
      analytics.capture("next_round_booked", { chip, focus: !!focus });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't book it — try again");
    }
    setSaving(false);
  };

  const cancel = async () => {
    try {
      await axios.delete(`${API}/bookings/${existing.booking_id}`);
      setExisting(null);
      setChip(null);
    } catch {
      toast.error("Couldn't cancel — try again");
    }
  };

  if (existing === undefined) return <div className="skeleton-shimmer h-28 rounded-lg" />;

  if (existing) {
    return (
      <section className="victory-card p-4 flex items-center gap-3 border-victory-lime/30 bg-victory-lime/5" data-testid="booking-confirmed">
        <div className="w-11 h-11 rounded-2xl bg-victory-lime flex items-center justify-center flex-shrink-0">
          <Check className="w-5 h-5 text-victory-bg" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-victory-text font-heading font-bold text-sm">Booked: {formatBooking(existing.at)}</p>
          <p className="text-victory-muted text-xs truncate">
            {existing.focus ? `${existing.focus}${existing.focus_pb != null ? ` · PB to beat ${existing.focus_pb}` : ""}` : "Full session"} · we'll remind you
          </p>
        </div>
        <button onClick={cancel} aria-label="Cancel booking" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-danger">
          <X className="w-4 h-4" />
        </button>
      </section>
    );
  }

  return (
    <section className="victory-card p-4 space-y-3" data-testid="book-next-round">
      <p className="section-label flex items-center gap-1.5"><CalendarClock className="w-3 h-3" /> Book your next round</p>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            className={`filter-pill ${chip === c.key ? "filter-pill-active" : "filter-pill-inactive"}`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => { setChip("custom"); if (!custom) setCustom(toLocalInput(chips[0].date)); }}
          className={`filter-pill ${chip === "custom" ? "filter-pill-active" : "filter-pill-inactive"}`}
        >
          Pick a time
        </button>
      </div>

      {chip === "custom" && (
        <input
          type="datetime-local"
          className="victory-input w-full"
          value={custom}
          min={toLocalInput(new Date())}
          onChange={(e) => setCustom(e.target.value)}
          aria-label="Choose date and time"
        />
      )}

      {focusOptions.length > 0 && (
        <div>
          <p className="text-victory-muted text-xs mb-1.5">Work on</p>
          <div className="flex flex-wrap gap-2">
            {focusOptions.map((f) => (
              <button
                key={f}
                onClick={() => setFocus(focus === f ? null : f)}
                className={`filter-pill ${focus === f ? "filter-pill-active" : "filter-pill-inactive"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={book} disabled={!chosenDate || saving} className="victory-btn-secondary w-full disabled:opacity-50">
        {saving ? "Booking…" : chosenDate ? `Book ${formatBooking(chosenDate.toISOString())}` : "Pick a time"}
      </button>
    </section>
  );
}
