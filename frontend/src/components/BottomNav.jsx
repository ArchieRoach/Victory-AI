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
      <div className="flex justify-around items-center h-20 max-w-lg mx-auto">
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
              className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[64px] px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "text-victory-lime"
                  : "text-victory-muted hover:text-victory-text"
              }`}
              data-testid={`nav-${key}`}
            >
              <Icon className="w-6 h-6" strokeWidth={2} />
              <span className="text-xs font-medium">{t(`nav.${key}`)}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
