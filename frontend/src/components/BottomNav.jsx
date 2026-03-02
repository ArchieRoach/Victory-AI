import { NavLink, useLocation } from "react-router-dom";
import { Home, Target, Timer, Play } from "lucide-react";

const NAV_ITEMS = [
  { path: "/home", icon: Home, label: "Home" },
  { path: "/score", icon: Target, label: "Score" },
  { path: "/timer", icon: Timer, label: "Timer" },
  { path: "/library", icon: Play, label: "Library" },
];

export const BottomNav = () => {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-victory-bg/95 backdrop-blur-sm border-t border-victory-border z-50 bottom-nav"
      data-testid="bottom-nav"
    >
      <div className="flex justify-around items-center h-20 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path || 
            (path === "/score" && location.pathname.startsWith("/score"));
          
          return (
            <NavLink
              key={path}
              to={path}
              className={`flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-[64px] px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "text-victory-lime"
                  : "text-victory-muted hover:text-victory-text"
              }`}
              data-testid={`nav-${label.toLowerCase()}`}
            >
              <Icon className="w-6 h-6" strokeWidth={2} />
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
