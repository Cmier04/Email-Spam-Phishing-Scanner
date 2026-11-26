
import {
  ShieldCheck,
  LayoutDashboard,
  Mail,
  History,
  Settings,
  CircleHelp,
  ChevronRight,
  X,
} from "lucide-react";

export type AppPage = "dashboard" | "results" | "history" | "settings" | "help";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  collapsed: boolean;
  accountName?: string | null;
  accountEmail?: string | null;
  accountAvatar?: boolean;
};

function Sidebar({
  isOpen,
  onClose,
  activePage,
  onNavigate,
  collapsed,
  accountName, accountEmail, accountAvatar,
}: SidebarProps) {
  const activeStyle =
    "bg-[#eef2ff] text-[#3157d5]";

  const inactiveStyle =
    "text-[#687288] hover:bg-[#f5f7fb] hover:text-[#3157d5]";

  return (
    <>
      {isOpen && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-[#192034]/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col overflow-y-auto border-r border-[#e4e8ef] bg-white px-4 py-6 transition-[transform,width,padding] duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          collapsed
            ? "lg:w-[72px] lg:px-2"
            : "lg:w-[248px] lg:px-4"
        }`}
      >
        {/* Application logo */}
        <div
          className={`mb-9 flex items-center justify-between px-2 ${
            collapsed
              ? "lg:justify-center lg:px-0"
              : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3157d5] text-white">
              <ShieldCheck size={20} />
            </div>

            <span
              className={`text-[17px] font-bold text-[#17213c] ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
              PhishLab
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-[#69728a] lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main navigation */}
        <nav
          aria-label="Main navigation"
          className="space-y-1"
        >
          {/* Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate("dashboard")}
            aria-current={
              activePage === "dashboard"
                ? "page"
                : undefined
            }
            aria-label="Dashboard"
            title={
              collapsed
                ? "Dashboard"
                : undefined
            }
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${
              activePage === "dashboard"
                ? activeStyle
                : inactiveStyle
            } ${
              collapsed
                ? "lg:justify-center lg:px-2"
                : ""
            }`}
          >
            <LayoutDashboard size={18} className="shrink-0" />

            <span className={collapsed ? "lg:hidden" : ""}>
              Dashboard
            </span>
          </button>

          {/* Scan results */}
          <button
            type="button"
            onClick={() => onNavigate("results")}
            aria-current={
              activePage === "results"
                ? "page"
                : undefined
            }
            aria-label="Scan results"
            title={
              collapsed
                ? "Scan results"
                : undefined
            }
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${
              activePage === "results"
                ? activeStyle
                : inactiveStyle
            } ${
              collapsed
                ? "lg:justify-center lg:px-2"
                : ""
            }`}
          >
            <Mail size={18} className="shrink-0" />

            <span className={collapsed ? "lg:hidden" : ""}>
              Scan results
            </span>
          </button>
          <button type="button" onClick={() => onNavigate("history")}
            aria-current={activePage === "history" ? "page" : undefined}
            aria-label="Lab history" title={collapsed ? "Lab history" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${activePage === "history" ? activeStyle : inactiveStyle} ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
            <History size={18} className="shrink-0" />
            <span className={collapsed ? "lg:hidden" : ""}>Lab history</span>
          </button>
        </nav>

        {/* Workspace navigation */}
        <p
          className={`mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a1a8b8] ${
            collapsed ? "lg:hidden" : ""
          }`}
        >
          Workspace
        </p>

        <nav
          aria-label="Workspace navigation"
          className={`space-y-1 ${
            collapsed
              ? "lg:mt-6 lg:border-t lg:border-[#e4e8ef] lg:pt-4"
              : ""
          }`}
        >
          {/* Settings */}
          <button
            type="button"
            onClick={() => onNavigate("settings")}
            aria-current={
              activePage === "settings"
                ? "page"
                : undefined
            }
            aria-label="Settings"
            title={
              collapsed
                ? "Settings"
                : undefined
            }
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${
              activePage === "settings"
                ? activeStyle
                : inactiveStyle
            } ${
              collapsed
                ? "lg:justify-center lg:px-2"
                : ""
            }`}
          >
            <Settings size={18} className="shrink-0" />

            <span className={collapsed ? "lg:hidden" : ""}>
              Settings
            </span>
          </button>

          {/* Help center */}
          <button
            type="button"
            onClick={() => onNavigate("help")}
            aria-current={
              activePage === "help"
                ? "page"
                : undefined
            }
            aria-label="Help center"
            title={
              collapsed
                ? "Help center"
                : undefined
            }
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${
              activePage === "help"
                ? activeStyle
                : inactiveStyle
            } ${
              collapsed
                ? "lg:justify-center lg:px-2"
                : ""
            }`}
          >
            <CircleHelp size={18} className="shrink-0" />

            <span className={collapsed ? "lg:hidden" : ""}>
              Help center
            </span>
          </button>
        </nav>

        {/* Signed-in Google identity, with safe fallback while disconnected. */}
        <div className={`mt-auto flex items-center gap-3 px-2 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
          <div title={collapsed ? accountName || "Connect Gmail in Settings" : undefined}
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#dce5ff] text-xs font-bold text-[#3157d5]">
            {accountAvatar ? (
              <img src="/api/gmail/avatar" alt="Google account profile" referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.classList.remove("sr-only"); }} />
            ) : null}
            <span className={accountAvatar ? "sr-only" : ""}>{accountName?.trim().slice(0, 1).toUpperCase() || "?"}</span>
          </div>
          <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
            <p className="truncate text-xs font-semibold text-[#26314c]">{accountName || "No Google account"}</p>
            <p className="truncate text-[11px] text-[#8a92a4]">{accountEmail || "Connect Gmail in Settings"}</p>
          </div>
          <ChevronRight size={16} className={`text-[#949bad] ${collapsed ? "lg:hidden" : ""}`} />
        </div>

      </aside>
    </>
  );
}

export default Sidebar;
