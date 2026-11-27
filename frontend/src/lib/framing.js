// Pre-round framing check from the pose model's points (0-1 across and down the picture).
// In frame = both shoulders and both wrists are seen, clear of the edges, and the body is big
// enough to count punches. Otherwise it says which way to move.
const SHOULDERS = [11, 12];
const WRISTS = [15, 16];
const EDGE = 0.03;
const MIN_SHOULDER_WIDTH = 0.12;

const seen = (p) => p && (p.visibility == null || p.visibility > 0.5);
const inside = (p) => p.x > EDGE && p.x < 1 - EDGE && p.y > EDGE && p.y < 1 - EDGE;

export function framingFrom(landmarks) {
  if (!landmarks?.length) return "searching";
  const shoulders = SHOULDERS.map((i) => landmarks[i]);
  if (!shoulders.every(seen)) return "searching";
  const needed = [...shoulders, ...WRISTS.map((i) => landmarks[i])];
  if (!needed.every((p) => seen(p) && inside(p))) return "back";
  if (Math.abs(shoulders[0].x - shoulders[1].x) < MIN_SHOULDER_WIDTH) return "closer";
  return "ok";
}
