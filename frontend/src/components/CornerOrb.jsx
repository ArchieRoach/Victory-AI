import { useEffect, useState } from "react";
import { onSpeaking } from "@/lib/speech";
import { MOOD_TONE, orbMood } from "@/lib/cornerOrb";

// Your partner in the corner during a session. States and reasoning: lib/cornerOrb.js.
const C = (token, a = 1) => `rgb(var(--victory-${token}) / ${a})`;
const DOTS = Array.from({ length: 8 }, (_, i) => i * 45);

export function useCoachSpeaking() {
  const [on, setOn] = useState(false);
  useEffect(() => onSpeaking(setOn), []);
  return on;
}

export function CornerOrb({ thinking, paused, resting, watching, complete, size = 56, label, compact = false }) {
  const speaking = useCoachSpeaking();
  const mood = orbMood({ thinking, speaking, paused, resting, watching, complete });
  const tone = MOOD_TONE[mood];
  return (
    <div className={`relative flex items-center justify-center ${compact ? "" : "mb-3"}`} style={{ width: size * 1.8, height: size * 1.8 }}
      data-testid="corner-orb" data-mood={mood} role="img" aria-label={label}>
      {mood === "talk" && [0, 0.5].map((d) => (
        <span key={d} className="absolute rounded-full orb-wave" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${C(tone, 0.55)}`, animationDelay: `${d}s` }} />
      ))}
      {mood === "think" && (
        <span className="absolute inset-0 orb-orbit" aria-hidden="true">
          {DOTS.map((a, i) => (
            <span key={a} className="absolute left-1/2 top-1/2 rounded-full" style={{ width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5,
              background: C(i % 2 ? "teal" : tone), transform: `rotate(${a}deg) translateY(${-size * 0.78}px)`, opacity: 0.4 + (i / 12) }} />
          ))}
        </span>
      )}
      <span className={`absolute rounded-full orb-halo orb-${mood}`}
        style={{ width: size * 1.5, height: size * 1.5, background: `radial-gradient(circle, ${C(tone, mood === "paused" ? 0.12 : 0.35)}, transparent 70%)` }} />
      <span className={`relative rounded-full orb-core orb-${mood}`}
        style={{ width: size, height: size, opacity: mood === "paused" ? 0.55 : 1,
          background: `radial-gradient(circle at 35% 30%, ${C("text", 0.95)} 0%, ${C(tone)} 32%, ${C(mood === "think" ? "danger" : "teal", 0.9)} 75%, ${C("bg", 0.9)} 100%)`,
          boxShadow: `0 0 ${mood === "talk" ? 42 : 24}px ${C(tone, 0.55)}`, transition: "box-shadow 0.25s ease, opacity 0.3s ease" }} />
    </div>
  );
}
