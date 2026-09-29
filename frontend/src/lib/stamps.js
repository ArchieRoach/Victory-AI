import { Hammer, Sparkles, Zap, Shield, Flame } from "lucide-react";

// Mirrors SQUAD_STAMPS in backend/server.py. Deliberately all encouraging: squad
// verdicts on a teen's round should push them, never pile on.
export const STAMPS = [
  { key: "heavy_hands",   label: "Heavy hands",   icon: Hammer },
  { key: "clean",         label: "Clean",         icon: Sparkles },
  { key: "sharp_jab",     label: "Sharp jab",     icon: Zap },
  { key: "slick_defence", label: "Slick D",       icon: Shield },
  { key: "keep_grinding", label: "Keep grinding", icon: Flame },
];

export const stampByKey = (key) => STAMPS.find((s) => s.key === key);
