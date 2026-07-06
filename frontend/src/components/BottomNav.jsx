import { NavLink, useLocation } from "react-router-dom";
import { Home, Search, Dumbbell, User, Tv } from "lucide-react";
import { useTranslation } from "react-i18next";

const NAV_ITEMS = [
  { path: "/live",     icon: Tv,       key: "live"     },
  { path: "/discover", icon: Search,   key: "discover" },
  { path: "/home",     icon: Home,     key: "home"     },
  { path: "/train",    icon: Dumbbell, key: "train"    },
  { path: "/profile",  icon: User,     key: "profile"  },
];

export const BottomNav = () => {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-victory-bg/95 backdrop-blur-sm border-t border-victory-border z-50 bottom-nav"
      data-testid="bottom-nav"
    >
      <div className="flex justify-around items-center h-20 max-w-lg mx-auto px-1">
        {NAV_ITEMS.map(({ path, icon: Icon, key }) => {
          const isActive =
            location.pathname === path ||
            (path === "/train"    && (location.pathname.startsWith("/score") || location.pathname.startsWith("/timer"))) ||
            (path === "/discover" && location.pathname.startsWith("/profile/")) ||
            (path === "/live"     && (location.pathname.startsWith("/stream") || location.pathname === "/go-live"));

          return (
            <NavLink
              key={path}
              to={path}
              className={`relative flex flex-col items-center justify-center gap-1 min-h-[52px] min-w-[56px] px-2 py-2 transition-colors ${
                isActive ? "text-victory-lime" : "text-victory-muted hover:text-victory-text"
              }`}
              data-testid={`nav-${key}`}
            >
              {/* Icon pill — lime tint when active */}
              <div className={`flex items-center justify-center w-10 h-7 rounded-2xl transition-colors ${
                isActive ? "bg-victory-lime/15" : ""
              }`}>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] leading-none transition-all ${isActive ? "font-bold" : "font-medium"}`}>
                {t(`nav.${key}`)}
              </span>
              {/* Active dot */}
              {isActive && (
                <span className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-victory-lime" />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
