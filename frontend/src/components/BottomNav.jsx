import { useLayoutEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Search, Dumbbell, User, Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GlassView } from "expo-glass-effect";
import { createSpring, prefersReducedMotion, SPRING } from "@/lib/motion";
import { lensScale, previousTab, rememberTab, travel } from "@/lib/navLens";

const NAV_ITEMS = [
  { path: "/live",     icon: Tv,       key: "live"     },
  { path: "/discover", icon: Search,   key: "discover" },
  { path: "/home",     icon: Home,     key: "home"     },
  { path: "/train",    icon: Dumbbell, key: "train"    },
  { path: "/profile",  icon: User,     key: "profile"  },
];

function activeIndex(pathname) {
  return NAV_ITEMS.findIndex(({ path }) =>
    pathname === path ||
    (path === "/train"    && (pathname.startsWith("/score") || pathname.startsWith("/timer"))) ||
    (path === "/discover" && pathname.startsWith("/profile/")) ||
    (path === "/live"     && (pathname.startsWith("/stream") || pathname === "/go-live" || pathname.startsWith("/fantasy"))));
}

// The selected tab sits under a glowing lens that glides from the tab you left (lib/navLens.js).
export const BottomNav = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const active = activeIndex(location.pathname);
  const rowRef = useRef(null);
  const lensRef = useRef(null);
  const glowRef = useRef(null);
  const itemRefs = useRef([]);

  useLayoutEffect(() => {
    const lens = lensRef.current;
    if (active < 0 || !lens) { rememberTab(null); return undefined; }
    const centre = (i) => { const el = itemRefs.current[i]; return el ? el.offsetLeft + el.offsetWidth / 2 : 0; };
    const step = Math.abs(centre(1) - centre(0)) || 1;
    const target = centre(active);
    const draw = (x) => {
      const s = lensScale(x, target, step);
      lens.style.transform = `translate3d(${x}px, 0, 0) translateX(-50%) scale(${s}, ${1 + (s - 1) * 0.6})`;
      if (glowRef.current) glowRef.current.style.opacity = String(0.35 + 0.65 * travel(x, target, step));
    };
    const from = previousTab();
    rememberTab(active);
    if (from == null || from === active || from < 0 || prefersReducedMotion()) { draw(target); return undefined; }
    const spring = createSpring({ from: centre(from), onUpdate: draw, config: SPRING.default });
    draw(centre(from));
    spring.to(target);
    const onResize = () => { spring.stop(); draw(centre(active)); };
    window.addEventListener("resize", onResize);
    return () => { spring.stop(); window.removeEventListener("resize", onResize); };
  }, [active]);

  return (
    <GlassView
      as="nav"
      glassEffectStyle="regular"
      className="glass-bar fixed bottom-0 left-0 right-0 z-40 bottom-nav"
      data-testid="bottom-nav"
    >
      <div ref={rowRef} className="relative flex justify-around items-center h-20 max-w-lg mx-auto px-1">
        {active >= 0 && (
          <span ref={lensRef} aria-hidden="true" data-testid="nav-lens"
            className="absolute left-0 top-1/2 -mt-[30px] w-16 h-[60px] rounded-[22px] pointer-events-none will-change-transform"
            style={{ transformOrigin: "50% 50%", background: "rgb(var(--victory-lime) / 0.12)", border: "1px solid rgb(var(--victory-lime) / 0.22)" }}>
            <span ref={glowRef} className="absolute inset-0 rounded-[inherit]"
              style={{ boxShadow: "0 0 18px rgb(var(--victory-lime) / 0.35), inset 0 0 12px rgb(var(--victory-lime) / 0.18)", opacity: 0.35 }} />
          </span>
        )}
        {NAV_ITEMS.map(({ path, icon: Icon, key }, i) => {
          const isActive = i === active;
          return (
            <NavLink
              key={path}
              to={path}
              ref={(el) => { itemRefs.current[i] = el; }}
              className={`relative z-10 flex flex-col items-center justify-center gap-1 min-h-[52px] min-w-[56px] px-2 py-2 transition-colors ${
                isActive ? "text-victory-lime duration-200 delay-150" : "text-victory-muted hover:text-victory-text duration-150"
              }`}
              data-testid={`nav-${key}`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="flex items-center justify-center w-10 h-7">
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} fill={isActive ? "currentColor" : "none"} fillOpacity={isActive ? 0.25 : 0}
                  style={isActive ? { filter: "drop-shadow(0 0 6px rgb(var(--victory-lime) / 0.6))" } : undefined} />
              </div>
              <span className={`text-[10px] leading-none ${isActive ? "font-bold" : "font-medium"}`}>
                {t(`nav.${key}`)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </GlassView>
  );
};
