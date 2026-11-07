import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Send, Sparkles, Mail } from "lucide-react";
import { API } from "@/App";
import { BottomSheet } from "@/components/BottomSheet";

// Ask Victory: quick answers about the app, from a guide of real facts (backend/help_assistant.py).
// Anything it can't answer goes to the team by email with one tap, so nobody is left waiting.
const STARTERS = ["How do I cancel Pro?", "Why can't I hear my coach?", "How do weekly streaks work?"];

export function HelpChat({ onClose }) {
  const location = useLocation();
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I'm Ask Victory. Ask me anything about the app." },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [canHandOff, setCanHandOff] = useState(false);
  const [sent, setSent] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);

  const ask = async (text) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user", text: q }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/help/ask`, { messages: next.slice(1), page: location.pathname });
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
      if (data.handoff) setCanHandOff(true);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I can't answer right now. Tap \"Send to the team\" and someone will email you back." }]);
      setCanHandOff(true);
    }
    setBusy(false);
  };

  const handOff = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/help/handoff`, { messages: messages.slice(1), page: location.pathname });
      setSent(true);
      setMessages((m) => [...m, { role: "assistant", text: `Sent to the team. They'll email you${data.reply_to ? ` at ${data.reply_to}` : ""}.` }]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't send that. Try again.");
    }
    setBusy(false);
  };

  return (
    <BottomSheet onClose={onClose} label="Ask Victory" className="w-full max-w-lg mx-auto" testId="help-chat">
      <div className="p-4 flex flex-col gap-3 max-h-[78vh]">
        <h2 className="font-heading font-bold text-victory-text flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-victory-lime" /> Ask Victory
        </h2>
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[160px]" aria-live="polite">
          {messages.map((m, i) => (
            <p key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              m.role === "user" ? "ml-auto bg-victory-lime text-victory-bg" : "bg-victory-card-highlight text-victory-text"}`}>
              {m.text}
            </p>
          ))}
          {busy && <p className="bg-victory-card-highlight text-victory-muted text-sm rounded-2xl px-3 py-2 w-16 animate-pulse">...</p>}
          <div ref={endRef} />
        </div>

        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="text-xs rounded-full border border-victory-border text-victory-muted px-3 min-h-[36px] hover:border-victory-lime">
                {s}
              </button>
            ))}
          </div>
        )}

        {canHandOff && !sent && (
          <button onClick={handOff} disabled={busy} className="victory-btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-60" data-testid="help-handoff">
            <Mail className="w-4 h-4" /> Send to the team
          </button>
        )}

        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Ask a question"
            aria-label="Your question" className="victory-input flex-1" />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send"
            className="w-12 h-12 rounded-full bg-victory-lime text-victory-bg flex items-center justify-center disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </BottomSheet>
  );
}
