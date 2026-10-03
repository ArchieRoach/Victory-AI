// Pro is priced and charged in GBP (it must match the Stripe catalogue).
export const money = (amount, currency = "gbp", alwaysPence = false) => {
  try {
    const cents = alwaysPence || Math.round(amount * 100) % 100 !== 0;
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `£${amount}`;
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
