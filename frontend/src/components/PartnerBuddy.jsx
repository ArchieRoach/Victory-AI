import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowUp } from "lucide-react";
import { API, useAuth } from "@/App";
import { createSpring, prefersReducedMotion } from "@/lib/motion";
import { BUBBLE_GAP_MS, SLEEP_AFTER_MS, canDigDeeper, firstName, next, toMessages } from "@/lib/partnerBuddy";
import { tx } from "@/i18n/tx";

// The partner you can talk to. Flow and reasoning: lib/partnerBuddy.js.
const C = (token, a = 1) => `rgb(var(--victory-${token}) / ${a})`;
const ORB = 56;
const STARTERS = [
  ["ui.partnerBuddy.starterWork", "What should I work on?"],
  ["ui.partnerBuddy.starterDrill", "Give me a 10-minute drill"],
  ["ui.partnerBuddy.starterHands", "How do I stop dropping my hands?"],
];

function Orb({ mood, look }) {
  const eyes = mood === "sleep"
    ? <g stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M18 30 h7" /><path d="M31 30 h7" /></g>
    : <g fill="white" className={mood === "think" ? "" : "buddy-blink"} style={{ transform: `translateX(${look * 3}px)` }}>
        <rect x="19" y={mood === "think" ? 22 : 24} width="6" height="11" rx="3" />
        <rect x="31" y={mood === "think" ? 22 : 24} width="6" height="11" rx="3" />
      </g>;
  return (
    <svg viewBox="0 0 56 56" width={ORB} height={ORB} aria-hidden="true" className={mood === "sleep" ? "" : "buddy-float"}
      style={{ filter: `drop-shadow(0 6px 16px ${C("teal", mood === "sleep" ? 0.15 : 0.45)})` }}>
      <defs>
        <radialGradient id="buddy-skin" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" style={{ stopColor: C("lime") }} />
          <stop offset="0.55" style={{ stopColor: C("teal") }} />
          <stop offset="1" style={{ stopColor: C("orange") }} />
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="26" fill="url(#buddy-skin)" opacity={mood === "sleep" ? 0.7 : 1} />
      <ellipse cx="20" cy="15" rx="9" ry="5" fill="white" opacity="0.35" />
      {eyes}
    </svg>
  );
}

function AskBar({ name, onAsk, disabled, autoFocus, onType }) {
  const [draft, setDraft] = useState("");
  const send = (e) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || disabled) return;
    setDraft("");
    onAsk(q);
  };
  return (
    <form onSubmit={send} className="flex items-center gap-2 rounded-full pl-4 pr-1 py-1 bg-victory-card-highlight" data-testid="buddy-ask">
      <input value={draft} onChange={(e) => { setDraft(e.target.value); onType?.(); }} maxLength={400} autoFocus={autoFocus}
        placeholder={tx("ui.partnerBuddy.askPlaceholder", "Ask {{name}} anything", { name })}
        className="flex-1 min-w-0 bg-transparent text-sm text-victory-text placeholder:text-victory-muted outline-none min-h-[40px]" />
      <button type="submit" disabled={!draft.trim() || disabled} aria-label={tx("ui.partnerBuddy.send", "Send")}
        className="w-10 h-10 rounded-full flex items-center justify-center bg-victory-lime text-victory-bg disabled:opacity-40">
        <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </form>
  );
}

export function PartnerBuddy() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const name = user?.training_partner?.name || tx("ui.partnerBuddy.yourPartner", "your partner");
  const still = prefersReducedMotion();
  const [state, setState] = useState("idle");
  const [thread, setThread] = useState([]);
  const [shown, setShown] = useState(0);
  const [deeper, setDeeper] = useState(false);
  const [after, setAfter] = useState(null);
  const [side, setSide] = useState(0);
  const box = useRef(null);
  const spring = useRef(null);
  const [width, setWidth] = useState(0);
  const [poke, setPoke] = useState(0);
  const typing = useCallback(() => setPoke((n) => n + 1), []);

  const go = useCallback((event) => setState((s) => next(s, event)), []);
  const answer = [...thread].reverse().find((m) => m.role === "assistant");
  const atSide = state === "respond" || state === "feedback";

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const target = atSide ? 1 : 0;
    if (still) { setSide(target); return undefined; }
    if (!spring.current) spring.current = createSpring({ from: side, onUpdate: setSide, config: { damping: 0.8, response: 0.45 } });
    spring.current.to(target);
    return undefined;
  }, [atSide, still]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => spring.current?.stop(), []);

  useEffect(() => {
    if (state !== "respond" || !answer) return undefined;
    if (shown >= answer.bubbles.length) { go("shown"); return undefined; }
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 250 : (still ? 0 : BUBBLE_GAP_MS));
    return () => clearTimeout(t);
  }, [state, shown, answer, go, still]);

  useEffect(() => {
    if (state !== "idle" && state !== "feedback") return undefined;
    const t = setTimeout(() => go("doze"), SLEEP_AFTER_MS);
    return () => clearTimeout(t);
  }, [state, thread, after, poke, go]);

  const ask = async (text, { dig = false } = {}) => {
    const sofar = dig ? thread : [...thread, { role: "user", text }];
    setThread(sofar);
    setDeeper(dig);
    setAfter(null);
    setShown(0);
    go("ask");
    let reply;
    try {
      const { data } = await axios.post(`${API}/partner/ask`, { messages: toMessages(sofar).slice(-8), deeper: dig });
      reply = { role: "assistant", bubbles: data.bubbles?.length ? data.bubbles : [tx("ui.partnerBuddy.offline", "I can't answer that right now. Ask me again in a minute.")], deeper: dig };
    } catch {
      reply = { role: "assistant", bubbles: [tx("ui.partnerBuddy.offline", "I can't answer that right now. Ask me again in a minute.")], deeper: dig };
    }
    setThread((t) => [...t, reply]);
    setState("respond");
  };

  const helped = (yes) => {
    axios.post(`${API}/partner/feedback`, { helpful: yes, deeper: !!answer?.deeper }).catch(() => {});
    if (yes) { setAfter("yes"); go("yes"); return; }
    if (canDigDeeper(thread)) { ask(null, { dig: true }); return; }
    setAfter("stillNo");
    go("yes");
  };

  const travel = Math.max(0, width / 2 - ORB / 2);
  const greeting = firstName(user)
    ? tx("ui.partnerBuddy.greetingNamed", "Hey {{first}}. What are we working on?", { first: firstName(user) })
    : tx("ui.partnerBuddy.greeting", "Hey. What are we working on?");

  return (
    <section className="victory-card p-4 overflow-hidden" data-testid="partner-buddy" data-state={state}
      style={{ backgroundImage: `radial-gradient(circle at ${50 - side * 38}% 0%, ${C("teal", 0.14)}, transparent 60%)` }}>
      <div ref={box} className="relative" style={{ minHeight: atSide ? 140 : 132 }}>
        <button type="button" onClick={() => state === "sleep" && go("wake")} data-testid="buddy-orb"
          aria-label={state === "sleep" ? tx("ui.partnerBuddy.wake", "Wake {{name}} up", { name }) : name}
          className={`absolute top-0 rounded-full ${state === "sleep" ? "cursor-pointer" : "cursor-default"}`}
          style={{ left: `calc(50% - ${ORB / 2}px)`, transform: `translateX(${-travel * side}px)` }}>
          {state === "think" && !still && (
            <span className="absolute inset-[-10px] rounded-full buddy-ring" style={{ boxShadow: `0 0 0 2px ${C("teal", 0.5)}` }} aria-hidden="true" />
          )}
          <Orb mood={state === "sleep" ? "sleep" : state === "think" ? "think" : "awake"} look={side} />
          {state === "sleep" && (
            <span className="absolute -top-3 -right-5 font-heading font-bold text-victory-teal buddy-zzz" aria-hidden="true">z<span className="text-lg">Z</span></span>
          )}
        </button>

        {atSide && (
          <span className="absolute pointer-events-none" aria-hidden="true"
            style={{ left: ORB - 6, top: 10, width: 40, height: 60, opacity: side,
              background: `linear-gradient(90deg, ${C("teal", 0.18)}, transparent)`, clipPath: "polygon(0 35%, 100% 0, 100% 100%, 0 65%)" }} />
        )}

        <div style={{ paddingTop: atSide ? 0 : ORB + 14, paddingLeft: atSide ? ORB + 18 : 0 }}>
          {state === "idle" && (
            <div key="idle" className="streak-reveal space-y-3 text-center">
              <p className="font-heading font-bold text-victory-text">
                {after === "yes" ? tx("ui.partnerBuddy.goodUseIt", "Good. Now go and use it.")
                  : after === "stillNo" ? tx("ui.partnerBuddy.askAnotherWay", "Fair enough. Try asking me another way.")
                  : greeting}
              </p>
              {after === "yes" ? (
                <button type="button" onClick={() => navigate("/train")} className="victory-btn-primary w-full" data-testid="buddy-train">
                  {tx("ui.partnerBuddy.trainNow", "Train now")}
                </button>
              ) : !thread.length && (
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTERS.map(([key, english]) => (
                    <button key={key} type="button" onClick={() => ask(tx(key, english))}
                      className="rounded-full px-3 min-h-[36px] text-[12px] text-victory-text bg-victory-card-highlight">
                      {tx(key, english)}
                    </button>
                  ))}
                </div>
              )}
              <AskBar name={name} onAsk={ask} onType={typing} />
            </div>
          )}

          {state === "think" && (
            <p key="think" className="streak-reveal text-center text-sm text-victory-muted" data-testid="buddy-thinking" aria-live="polite">
              {deeper ? tx("ui.partnerBuddy.diggingDeeper", "{{name}} is digging deeper…", { name })
                : tx("ui.partnerBuddy.thinking", "{{name}} is looking at your last rounds…", { name })}
            </p>
          )}

          {atSide && answer && (
            <div className="space-y-2" aria-live="polite" data-testid="buddy-answer">
              {answer.bubbles.slice(0, shown).map((b, i) => (
                <p key={`${thread.length}-${i}`} className="streak-reveal rounded-2xl rounded-tl-md px-3 py-2 text-sm text-victory-text bg-victory-card-highlight"
                  style={{ animationDelay: "0s" }}>
                  {b}
                </p>
              ))}
              {state === "feedback" && (
                <div className="streak-reveal pt-1 space-y-2" style={{ animationDelay: "0s" }}>
                  <p className="text-[12px] text-victory-muted">{tx("ui.partnerBuddy.didThatHelp", "Did that help?")}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => helped(false)} className="flex-1 min-h-[40px] rounded-full text-sm font-semibold"
                      style={{ boxShadow: `inset 0 0 0 1px ${C("danger", 0.5)}`, color: C("danger") }} data-testid="buddy-no">
                      {canDigDeeper(thread) ? tx("ui.partnerBuddy.noDeeper", "No, go deeper") : tx("ui.partnerBuddy.no", "No")}
                    </button>
                    <button type="button" onClick={() => helped(true)} className="flex-1 min-h-[40px] rounded-full text-sm font-semibold"
                      style={{ boxShadow: `inset 0 0 0 1px ${C("lime", 0.6)}`, color: C("lime") }} data-testid="buddy-yes">
                      {tx("ui.partnerBuddy.yes", "Yes")}
                    </button>
                  </div>
                  <AskBar name={name} onAsk={ask} onType={typing} />
                </div>
              )}
            </div>
          )}

          {state === "sleep" && (
            <button type="button" onClick={() => go("wake")} className="streak-reveal w-full text-center">
              <span className="block font-heading font-bold text-victory-text">{tx("ui.partnerBuddy.sleepTitle", "Wake me when you need me")}</span>
              <span className="block text-[12px] text-victory-teal mt-0.5">{tx("ui.partnerBuddy.tapMe", "Tap me")}</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
