import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { API } from "@/App";
import { DIVISIONS } from "@/lib/proShop";

// Verification first: anyone could type "The Reaper", so a person checks every pro before
// their Fighter Card goes public. That protects the fighter's name and fans' money.
export default function ProApplyPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ alias: "", ring_name: "", division: "Lightweight", record: "", titles: "", boxrec_url: "", instagram: "", proof: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await axios.post(`${API}/pro/apply`, { ...f, titles: f.titles.split(",").map((t) => t.trim()).filter(Boolean) });
      toast.success("Sent! We'll check it and let you know.");
      navigate("/pro/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't send that. Try again.");
    }
    setBusy(false);
  };

  const field = (k, label, props = {}) => (
    <div>
      <label htmlFor={`pro-${k}`} className="victory-label">{label}</label>
      <input id={`pro-${k}`} className="victory-input" value={f[k]} onChange={set(k)} {...props} />
    </div>
  );

  return (
    <div className="min-h-screen bg-victory-bg" data-testid="pro-apply">
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-victory-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-heading font-extrabold text-victory-text text-lg flex items-center gap-2"><BadgeCheck className="w-5 h-5 text-victory-teal" /> Get your Fighter Card</h1>
      </header>
      <form onSubmit={submit} className="px-4 pb-10 space-y-4 max-w-lg">
        <p className="text-victory-muted text-sm">For professional boxers. Once we've checked it's really you, you get a verified Fighter Card with your alias, record and belts, your own merch shop, and fans can train with your alias.</p>
        {field("alias", "Your alias", { placeholder: "The Reaper", maxLength: 30, required: true })}
        {field("ring_name", "Your name as it appears on BoxRec", { placeholder: "Lamont Roche Jr", maxLength: 60, required: true })}
        <div>
          <label htmlFor="pro-division" className="victory-label">Division</label>
          <select id="pro-division" className="victory-input" value={f.division} onChange={set("division")}>
            {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        {field("record", "Pro record (wins-losses-draws)", { placeholder: "25-4-1", maxLength: 11, required: true, inputMode: "numeric" })}
        {field("titles", "Titles, separated by commas (optional)", { placeholder: "Former Super Featherweight Champion" })}
        {field("boxrec_url", "BoxRec link", { placeholder: "https://boxrec.com/en/box-pro/…", type: "url" })}
        {field("instagram", "Instagram (optional)", { placeholder: "@thereaper" })}
        <div>
          <label htmlFor="pro-proof" className="victory-label">How can we check it's you?</label>
          <textarea id="pro-proof" className="victory-input min-h-[88px]" value={f.proof} onChange={set("proof")} maxLength={500}
            placeholder="e.g. DM us from your verified Instagram, or your promoter's email" />
        </div>
        <button className="victory-btn-primary" disabled={busy}>{busy ? "Sending…" : "Send for verification"}</button>
      </form>
    </div>
  );
}
