// Quick-pick times for "Book your next round". All land between 7am and 10pm local,
// matching the server's quiet-hours rule.
const at = (base, daysAhead, hour) => {
  const d = new Date(base);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const daysUntilSaturday = (now) => {
  const diff = (6 - now.getDay() + 7) % 7;
  return diff === 0 ? 7 : diff;
};

export function bookingChips(now = new Date()) {
  const chips = [
    { key: "tomorrow-am", label: "Tomorrow 7am", date: at(now, 1, 7) },
    { key: "tomorrow-pm", label: "Tomorrow 6pm", date: at(now, 1, 18) },
    { key: "in-2-days",   label: "In 2 days, 6pm", date: at(now, 2, 18) },
  ];
  const sat = daysUntilSaturday(now);
  if (sat > 2) chips.push({ key: "saturday", label: "Saturday 10am", date: at(now, sat, 10) });
  return chips;
}

export const isQuietHour = (date) => date.getHours() >= 22 || date.getHours() < 7;

export function formatBooking(iso, now = new Date()) {
  const d = new Date(iso);
  const day = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
  const when = day === 0 ? "Today" : day === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long" });
  return `${when} ${time}`;
}
