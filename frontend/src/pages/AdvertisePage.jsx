import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Zap, Users, Radio, TrendingUp, CheckCircle2 } from "lucide-react";

const PACKAGES = [
  {
    id: "starter",
    label: "Starter",
    price: 49,
    days: 7,
    description: "7-day campaign",
    reach: "Up to 2,000 viewers",
    highlight: false,
    perks: ["Banner on all live streams", "Brand name + tagline", "Clickable link to your site"],
  },
  {
    id: "pro",
    label: "Pro",
    price: 149,
    days: 30,
    description: "30-day campaign",
    reach: "Up to 10,000 viewers",
    highlight: true,
    badge: "Most Popular",
    perks: ["Everything in Starter", "Priority banner placement", "Monthly reach report"],
  },
  {
    id: "champion",
    label: "Champion",
    price: 349,
    days: 90,
    description: "90-day campaign",
    reach: "Maximum exposure",
    highlight: false,
    badge: "Best Value",
    perks: ["Everything in Pro", "Exclusive 90-day lock-in", "Dedicated account support"],
  },
];

const STATS = [
  { icon: Radio,      value: "50+",    label: "Live streams/week"  },
  { icon: Users,      value: "5,000+", label: "Active boxers"      },
  { icon: TrendingUp, value: "94%",    label: "Engagement rate"    },
  { icon: Zap,        value: "3 min",  label: "Avg session time"   },
];

export default function AdvertisePage({ success = false }) {
  const navigate = useNavigate();

  if (success) {
    return (
      <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-victory-lime/20 border-2 border-victory-lime flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-victory-lime" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading font-extrabold text-victory-text text-2xl">Campaign Live</h1>
          <p className="text-victory-muted text-sm max-w-xs">Your banner is now appearing on Victory AI live streams. We've sent a receipt to your email.</p>
        </div>
        <button onClick={() => navigate("/live")} className="victory-btn-primary px-8 py-3 font-bold">
          Watch Live Streams
        </button>
      </div>
    );
  }
  const [selectedPkg, setSelectedPkg] = useState("pro");
  const [form, setForm]               = useState({ brand_name: "", tagline: "", website_url: "", advertiser_email: "" });
  const [loading, setLoading]         = useState(false);
  const [errors, setErrors]           = useState({});

  const pkg = PACKAGES.find((p) => p.id === selectedPkg);

  const validate = () => {
    const e = {};
    if (!form.brand_name.trim())       e.brand_name = "Brand name is required";
    if (!form.tagline.trim())          e.tagline    = "Tagline is required";
    if (!form.website_url.trim())      e.website_url = "Website URL is required";
    else if (!/^https?:\/\/.+/.test(form.website_url)) e.website_url = "Must start with http:// or https://";
    if (!form.advertiser_email.trim()) e.advertiser_email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.advertiser_email)) e.advertiser_email = "Enter a valid email";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/ads/checkout`, {
        ...form,
        package_id: selectedPkg,
        origin_url: window.location.origin,
      });
      window.location.href = res.data.checkout_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not start checkout — please try again.");
      setLoading(false);
    }
  };

  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // Live banner preview
  const previewName = form.brand_name || "Your Brand Here";
  const previewTag  = form.tagline    || "Premium boxing gear for serious fighters";
  const initial     = (form.brand_name || "S")[0].toUpperCase();

  return (
    <div className="min-h-screen bg-victory-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-victory-text font-heading font-extrabold text-base leading-tight">Advertise on Victory AI</h1>
          <p className="text-victory-muted text-xs">Reach serious boxing fans mid-session</p>
        </div>
      </div>

      <div className="px-4 pb-20 max-w-lg mx-auto space-y-8 pt-6">

        {/* Hero */}
        <div className="text-center space-y-3">
          <span className="inline-block text-[11px] font-bold tracking-widest text-victory-lime uppercase bg-victory-lime/10 border border-victory-lime/20 px-3 py-1 rounded-full">
            Sponsor Banner
          </span>
          <h2 className="text-victory-text font-heading font-extrabold text-2xl leading-tight">
            Your brand, live in the ring.
          </h2>
          <p className="text-victory-muted text-sm leading-relaxed">
            Victory AI streams reach dedicated boxers at their most engaged moment — mid-session, gloves on, phone up.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="bg-victory-card border border-victory-border rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-victory-lime/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-victory-lime" />
              </div>
              <div>
                <p className="text-victory-text font-extrabold text-lg font-mono leading-tight">{value}</p>
                <p className="text-victory-muted text-[11px]">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Banner preview */}
        <div>
          <p className="text-victory-muted text-xs font-semibold uppercase tracking-wider mb-2">Live Preview</p>
          <div className="bg-[#0d0d14] border border-victory-border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-victory-lime/20 border border-victory-lime/30 flex items-center justify-center flex-shrink-0">
                <span className="text-victory-lime text-sm font-extrabold">{initial}</span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-semibold truncate">
                  Sponsored by <span className="text-victory-lime">{previewName}</span>
                </p>
                <p className="text-victory-muted text-[10px] truncate">{previewTag}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] font-semibold text-victory-lime border border-victory-lime/40 rounded-lg px-2.5 py-1 whitespace-nowrap">
                Learn More
              </span>
              <span className="text-[9px] text-victory-muted/50">AD</span>
            </div>
          </div>
          <p className="text-victory-muted text-[11px] mt-1.5 text-center">Updates as you type below</p>
        </div>

        {/* Package selector */}
        <div>
          <p className="text-victory-muted text-xs font-semibold uppercase tracking-wider mb-3">Choose a Package</p>
          <div className="space-y-2">
            {PACKAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPkg(p.id)}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                  selectedPkg === p.id
                    ? "border-victory-lime bg-victory-lime/10 ring-1 ring-victory-lime/40"
                    : "border-victory-border bg-victory-card hover:border-victory-lime/30"
                }`}
              >
                {/* Radio */}
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors ${
                  selectedPkg === p.id ? "border-victory-lime bg-victory-lime" : "border-victory-muted"
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-sm ${selectedPkg === p.id ? "text-victory-text" : "text-victory-text/80"}`}>
                      {p.label}
                    </span>
                    {p.badge && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.highlight ? "bg-victory-lime text-victory-bg" : "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                      }`}>
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-victory-muted text-xs mt-0.5">{p.description} · {p.reach}</p>
                  <ul className="mt-2 space-y-1">
                    {p.perks.map((perk) => (
                      <li key={perk} className="flex items-center gap-1.5">
                        <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${selectedPkg === p.id ? "text-victory-lime" : "text-victory-muted"}`} />
                        <span className="text-victory-muted text-[11px]">{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className={`font-mono font-extrabold text-lg ${selectedPkg === p.id ? "text-victory-lime" : "text-victory-text"}`}>
                    ${p.price}
                  </p>
                  <p className="text-victory-muted text-[10px]">{p.days} days</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Campaign details form */}
        <div>
          <p className="text-victory-muted text-xs font-semibold uppercase tracking-wider mb-3">Campaign Details</p>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="victory-label">Brand Name</label>
              <input
                value={form.brand_name}
                onChange={(e) => setField("brand_name", e.target.value)}
                maxLength={80}
                placeholder="e.g. Everlast, Winning, Cleto Reyes"
                className={`victory-input ${errors.brand_name ? "border-red-500" : ""}`}
              />
              {errors.brand_name && <p className="text-red-400 text-xs mt-1">{errors.brand_name}</p>}
            </div>

            <div>
              <label className="victory-label">Tagline <span className="text-victory-muted font-normal">({form.tagline.length}/80)</span></label>
              <input
                value={form.tagline}
                onChange={(e) => setField("tagline", e.target.value)}
                maxLength={80}
                placeholder="e.g. Premium boxing gloves for serious fighters"
                className={`victory-input ${errors.tagline ? "border-red-500" : ""}`}
              />
              {errors.tagline && <p className="text-red-400 text-xs mt-1">{errors.tagline}</p>}
            </div>

            <div>
              <label className="victory-label">Website URL</label>
              <input
                type="url"
                value={form.website_url}
                onChange={(e) => setField("website_url", e.target.value)}
                placeholder="https://yourbrand.com"
                className={`victory-input ${errors.website_url ? "border-red-500" : ""}`}
              />
              {errors.website_url && <p className="text-red-400 text-xs mt-1">{errors.website_url}</p>}
            </div>

            <div>
              <label className="victory-label">Your Email (for receipt + reporting)</label>
              <input
                type="email"
                value={form.advertiser_email}
                onChange={(e) => setField("advertiser_email", e.target.value)}
                placeholder="you@yourbrand.com"
                className={`victory-input ${errors.advertiser_email ? "border-red-500" : ""}`}
              />
              {errors.advertiser_email && <p className="text-red-400 text-xs mt-1">{errors.advertiser_email}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full victory-btn-primary py-4 text-base font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Start {pkg?.label} Campaign — ${pkg?.price}
                </>
              )}
            </button>

            <p className="text-victory-muted text-xs text-center">
              Secured by Stripe · Your campaign goes live within minutes of payment.
            </p>
          </form>
        </div>

      </div>
    </div>
  );
}
