import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { tx } from "@/i18n/tx";

// Goal: more sign-ups from the first screen.
// Psychology: show, don't tell. People believe what they see working (demonstration beats
//   description), and a quiet loop is processed without effort, so it adds no friction.
// Design: a real screen recording of a round (combo calls in numbers, names underneath) and the
//   results it leads to, looping muted in a phone frame. 60 KB, so it plays at once on gym Wi-Fi.
//   Reduced motion shows the still frame instead. The numbers are sample ones, and it says so.
export function DemoPhone({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || prefersReducedMotion()) return;
    v.muted = true;
    v.play?.().catch(() => {});
  }, []);

  return (
    <figure className={`mx-auto ${className}`} data-testid="demo-phone">
      <div className="relative mx-auto w-52 aspect-[390/844] rounded-[2.25rem] border-[6px] border-victory-card-highlight bg-victory-bg overflow-hidden shadow-2xl">
        <video
          ref={ref}
          className="absolute inset-0 w-full h-full object-cover"
          poster="/demo/app-demo-poster.jpg"
          muted
          loop
          playsInline
          autoPlay={!prefersReducedMotion()}
          preload="auto"
          aria-label={tx("ui.demoPhone.label", "A round in Victory AI: the coach calls combos, then your score and breakdown")}
        >
          <source src="/demo/app-demo.webm" type="video/webm" />
          <source src="/demo/app-demo.mp4" type="video/mp4" />
        </video>
      </div>
      <figcaption className="text-victory-muted text-xs mt-2">{tx("ui.demoPhone.caption", "Real app screens. Sample scores.")}</figcaption>
    </figure>
  );
}
