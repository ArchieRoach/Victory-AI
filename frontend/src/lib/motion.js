// Fluid motion, the Apple way (WWDC 2018 "Designing Fluid Interfaces", translated for the web).
// Springs instead of fixed-duration animations: they start from the value on screen, carry the
// finger's velocity, and can be grabbed and redirected at any moment.
//
// Springs are tuned with Apple's two numbers, not mass/stiffness:
// - damping ratio: 1 = no overshoot (default UI), ~0.8 = a little bounce (only after a flick)
// - response: roughly how fast it gets there, in seconds (not a fixed duration)

export const SPRING = {
  default: { damping: 1, response: 0.35 },
  sheet: { damping: 0.8, response: 0.3 },
  move: { damping: 1, response: 0.4 },
};

const STEP = 1 / 240; // seconds per integration step: stable for any frame rate

export function stepSpring(x, v, target, dt, { damping = 1, response = 0.35 } = {}) {
  const w0 = (2 * Math.PI) / Math.max(0.01, response);
  const k = w0 * w0;
  const c = 2 * damping * w0;
  let t = dt;
  while (t > 0) {
    const h = Math.min(STEP, t);
    const a = -k * (x - target) - c * v;
    v += a * h;
    x += v * h;
    t -= h;
  }
  return [x, v];
}

const settled = (x, v, target) => Math.abs(x - target) < 0.5 && Math.abs(v) < 5;

// One animated number. `to()` re-targets from wherever it is now, keeping its velocity, so a
// grab or a reversal never jumps or hits a "brick wall".
export function createSpring({ from = 0, onUpdate, onRest, config = SPRING.default,
                               raf = (f) => requestAnimationFrame(f), caf = (id) => cancelAnimationFrame(id),
                               now = () => performance.now() } = {}) {
  let x = from, v = 0, target = from, cfg = config, frame = null, last = null;

  const tick = () => {
    const t = now();
    const dt = Math.min(0.064, (t - last) / 1000);
    last = t;
    [x, v] = stepSpring(x, v, target, dt, cfg);
    if (settled(x, v, target)) {
      x = target; v = 0; frame = null;
      onUpdate?.(x);
      onRest?.(x);
      return;
    }
    onUpdate?.(x);
    frame = raf(tick);
  };

  return {
    to(next, { velocity, config: c } = {}) {
      target = next;
      if (velocity !== undefined) v = velocity;
      if (c) cfg = c;
      if (frame == null) { last = now(); frame = raf(tick); }
    },
    // Follow the finger exactly (stops any animation in flight).
    set(next) { this.stop(); x = next; v = 0; target = next; onUpdate?.(x); },
    stop() { if (frame != null) caf(frame); frame = null; },
    get: () => x,
    velocity: () => v,
    running: () => frame != null,
  };
}

// Where a flick would come to rest, like scroll deceleration (Apple's projection).
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Soft edges: the further past a boundary, the less it follows.
export function rubberband(overshoot, dimension, constant = 0.55) {
  if (!dimension) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// Velocity from the last ~100ms of pointer samples (px/s).
export function createVelocityTracker(windowMs = 100) {
  let samples = [];
  return {
    add(t, pos) {
      samples.push([t, pos]);
      samples = samples.filter(([s]) => t - s <= windowMs);
    },
    velocity() {
      if (samples.length < 2) return 0;
      const [t0, p0] = samples[0];
      const [t1, p1] = samples[samples.length - 1];
      return t1 > t0 ? ((p1 - p0) / (t1 - t0)) * 1000 : 0;
    },
    reset() { samples = []; },
  };
}

export const prefersReducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};
