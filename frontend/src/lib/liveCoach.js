// Turns a stream of pose landmarks (MediaPipe Pose: 33 points, image coords 0–1 plus
// hip-centred world coords in metres) into the live round stats. Only things a phone
// camera can see reliably are counted — punches thrown, combos, guard drops, head
// movement — and none of it becomes a technique score.

const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14, L_WRIST = 15, R_WRIST = 16, NOSE = 0;

const EXTENDED_DEG = 150;   // elbow this straight = a punch landing
const RETRACTED_DEG = 115;  // and back to this bent = hand returned
const COMBO_GAP_MS = 800;
const GUARD_DROP_MS = 400;
const HEAD_OUT = 0.35;      // nose off the shoulder midline, in shoulder widths
const HEAD_BACK = 0.15;
const MIN_VISIBILITY = 0.5;

const sub = (a, b) => [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const len = (u) => Math.sqrt(dot(u, u));

export function elbowAngle(shoulder, elbow, wrist) {
  const a = sub(shoulder, elbow), b = sub(wrist, elbow);
  const d = len(a) * len(b);
  if (!d) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / d))) * 180) / Math.PI;
}

const visible = (p) => p && (p.visibility == null || p.visibility >= MIN_VISIBILITY);

export function createTracker() {
  const hands = { left: { extended: false }, right: { extended: false } };
  const guard = { downSince: null, counted: false };
  const head = { out: false };
  let lastPunchAt = -Infinity;
  let combo = 0;
  let framesSeen = 0, framesGuardUp = 0;
  let cameraHead = true;

  const stats = { punches: 0, left: 0, right: 0, bestCombo: 0, guardDrops: 0, headMoves: 0, guardPct: null, inFrame: false, timeline: [] };

  // image: normalised landmarks; world: metres. t: ms since round start. Returns events
  // ("punch", "combo", "guard_drop", "head_move") for cues.
  function update(image, world, t) {
    const events = [];
    if (!image || !world || !visible(image[L_SHOULDER]) || !visible(image[R_SHOULDER])) {
      stats.inFrame = false;
      return events;
    }
    stats.inFrame = true;
    framesSeen += 1;

    const shoulderW = Math.abs(image[L_SHOULDER].x - image[R_SHOULDER].x) || 0.0001;
    const shoulderY = (image[L_SHOULDER].y + image[R_SHOULDER].y) / 2;
    let anyExtended = false;

    for (const [side, s, e, w] of [["left", L_SHOULDER, L_ELBOW, L_WRIST], ["right", R_SHOULDER, R_ELBOW, R_WRIST]]) {
      if (!visible(image[w]) || !visible(image[e])) continue;
      const angle = elbowAngle(world[s], world[e], world[w]);
      const hand = hands[side];
      if (!hand.extended && angle >= EXTENDED_DEG) {
        hand.extended = true;
        stats.punches += 1;
        stats[side] += 1;
        if (stats.timeline.length < 2000) stats.timeline.push(Math.round(t / 100) / 10);
        combo = t - lastPunchAt <= COMBO_GAP_MS ? combo + 1 : 1;
        lastPunchAt = t;
        if (combo > stats.bestCombo) stats.bestCombo = combo;
        events.push("punch");
        if (combo === 4) events.push("combo");
      } else if (hand.extended && angle <= RETRACTED_DEG) {
        hand.extended = false;
      }
      if (hand.extended) anyExtended = true;
    }

    // Guard: both wrists at or above shoulder height while not punching.
    const wristsSeen = visible(image[L_WRIST]) && visible(image[R_WRIST]);
    const guardUp = wristsSeen && image[L_WRIST].y <= shoulderY + 0.1 * shoulderW && image[R_WRIST].y <= shoulderY + 0.1 * shoulderW;
    if (!anyExtended && wristsSeen) {
      if (guardUp) {
        framesGuardUp += 1;
        guard.downSince = null;
        guard.counted = false;
      } else if (guard.downSince == null) {
        guard.downSince = t;
      } else if (!guard.counted && t - guard.downSince >= GUARD_DROP_MS) {
        guard.counted = true;
        stats.guardDrops += 1;
        events.push("guard_drop");
      }
    }
    if (framesSeen) stats.guardPct = Math.round((framesGuardUp / framesSeen) * 100);

    if (cameraHead && visible(image[NOSE])) {
      const mid = (image[L_SHOULDER].x + image[R_SHOULDER].x) / 2;
      const off = Math.abs(image[NOSE].x - mid) / shoulderW;
      if (!head.out && off >= HEAD_OUT) {
        head.out = true;
        stats.headMoves += 1;
        events.push("head_move");
      } else if (head.out && off <= HEAD_BACK) {
        head.out = false;
      }
    }
    return events;
  }

  // AirPods measure head movement directly; once they're connected the camera stops
  // counting it so nothing is counted twice.
  function addHeadMove() {
    cameraHead = false;
    stats.headMoves += 1;
  }

  const snapshot = () => ({ ...stats, timeline: [...stats.timeline] });
  return { update, addHeadMove, snapshot };
}

// Punches the ghost (your best round) had thrown by `seconds` into the round.
export function ghostCount(timeline, seconds) {
  if (!timeline?.length) return null;
  let lo = 0, hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid] <= seconds) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Spoken cues are rate-limited so the coach nags at most once per window per kind.
export function createCueGate(windowMs = 8000) {
  const last = {};
  return (kind, t) => {
    if (last[kind] != null && t - last[kind] < windowMs) return false;
    last[kind] = t;
    return true;
  };
}
