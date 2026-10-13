import { useEffect, useState } from "react";
import axios from "axios";
import { Lock, Lightbulb, ThumbsUp, Flag, HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { nextUnlockLine } from "@/lib/unlocks";

// One line about what's coming next: a reason to come back, without showing it all at once.
export function NextUnlock({ next }) {
  const line = nextUnlockLine(next);
  if (!line) return null;
  return (
    <p className="text-[12px] text-victory-muted flex items-center gap-1.5 px-1" data-testid="next-unlock">
      <Lock className="w-3.5 h-3.5 flex-shrink-0" /> {line}
    </p>
  );
}

// Pass it on (HEXAD Philanthropists): a tip from a real fighter, anonymous and one-way.
export function TipForNewcomer() {
  const [tip, setTip] = useState(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    axios.get(`${API}/tips/for-me`).then((r) => setTip(r.data.tip)).catch(() => {});
  }, []);
  if (!tip) return null;
  const send = (kind) => {
    setDone(true);
    axios.post(`${API}/tips/${tip.tip_id}/${kind}`).catch(() => {});
    toast(kind === "helpful" ? "Thanks. They'll know it helped." : "Thanks for telling us. We'll check it.");
  };
  return (
    <section className="victory-card p-4 space-y-2" data-testid="newcomer-tip">
      <p className="section-label flex items-center gap-1.5"><Lightbulb className="w-3 h-3" /> A tip for you</p>
      <p className="text-victory-text text-sm">“{tip.text}”</p>
      <p className="text-[11px] text-victory-muted">{tip.from}</p>
      {!done && (
        <div className="flex gap-2">
          <button className="filter-pill filter-pill-inactive min-h-[44px] flex items-center gap-1.5" onClick={() => send("helpful")}><ThumbsUp className="w-3.5 h-3.5" /> Helpful</button>
          <button className="filter-pill filter-pill-inactive min-h-[44px] flex items-center gap-1.5" onClick={() => send("report")} aria-label="Report this tip"><Flag className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </section>
  );
}

export function PassItOn() {
  const [mine, setMine] = useState(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    axios.get(`${API}/tips/mine`).then((r) => setMine(r.data)).catch(() => {});
  }, []);
  if (!mine?.can_give) return null;
  const save = async () => {
    try {
      await axios.post(`${API}/tips`, { text });
      toast.success("Tip saved. A newcomer will see it soon.");
      setText("");
      setOpen(false);
      const r = await axios.get(`${API}/tips/mine`);
      setMine(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save that tip");
    }
  };
  return (
    <section className="victory-card p-4 space-y-2" data-testid="pass-it-on">
      <p className="section-label flex items-center gap-1.5"><HeartHandshake className="w-3 h-3" /> Pass it on</p>
      <p className="text-victory-text text-sm">
        {mine.helped > 0 ? `Your tips have helped ${mine.helped} newcomer${mine.helped === 1 ? "" : "s"}.` : "What do you wish someone told you in your first week?"}
      </p>
      {open ? (
        <>
          <textarea className="victory-input" rows={3} maxLength={140} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="One short training tip. No names, links or contact details." aria-label="Your tip" />
          <button className="victory-btn-primary" disabled={text.trim().length < 10} onClick={save}>Share anonymously</button>
        </>
      ) : (
        <button className="victory-btn-ghost" onClick={() => setOpen(true)}>Leave a tip for a newcomer</button>
      )}
    </section>
  );
}
