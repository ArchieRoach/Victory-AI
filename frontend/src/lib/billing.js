export const money = (amount, currency = "usd") => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `$${amount}`;
  }
};

const per = (interval) => (interval === "year" ? "year" : "month");

// The exact, honest cost of leaving: what they pay now vs what they'd pay coming back.
// Only a lifetime ("forever") founder discount gets the "for life" wording.
export function founderTerms(billing) {
  const f = billing?.founder;
  if (!f || !f.lifetime) return null;
  const unit = per(billing.interval);
  const extraPerYear = Math.round(f.saving * (unit === "year" ? 1 : 12) * 100) / 100;
  return {
    now: `${money(f.price, billing.currency)}/${unit}`,
    regular: `${money(f.regular_price, billing.currency)}/${unit}`,
    extraPerYear: money(extraPerYear, billing.currency),
    percentOff: f.percent_off,
  };
}

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
