
import {
  ShieldCheck,
  LayoutDashboard,
  Mail,
  Settings,
  CircleHelp,
  ChevronRight,
  X,
} from "lucide-react";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

function Sidebar({ isOpen, onClose }: SidebarProps) {
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-[#e4e8ef] bg-white px-4 py-6 transition-transform lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Application logo */}
        <div className="mb-9 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3157d5] text-white">
              <ShieldCheck size={20} />
            </div>

            <span className="text-[17px] font-bold text-[#17213c]">
              Project Name
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
        <nav className="space-y-1">
          <a
            href="/"
            aria-current="page"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg bg-[#eef2ff] px-3 py-2.5 text-xs font-semibold text-[#3157d5]"
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </a>

          <button
            type="button"
            disabled
            title="Temp"
            className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold text-[#687288] opacity-60"
          >
            <Mail size={18} />
            <span>Scan results</span>
          </button>
        </nav>

        {/* Workspace navigation */}
        <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a1a8b8]">
          Workspace
        </p>

        <nav className="space-y-1">
          <button
            type="button"
            disabled
            title="Temp"
            className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold text-[#687288] opacity-60"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <button
            type="button"
            disabled
            title="Temp"
            className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold text-[#687288] opacity-60"
          >
            <CircleHelp size={18} />
            <span>Help center</span>
          </button>
        </nav>

        {/* Connection status placeholder */}
        <div className="mt-auto rounded-xl border border-[#e5e9f0] bg-[#f8f9fc] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#28334f]">
            <span className="h-2 w-2 rounded-full bg-[#a1a8b8]" />
            <span>Gmail not connected</span>
          </div>

          <p className="mt-2 text-[11px] text-[#788197]">
            johndoe@gmail.com
          </p>
        </div>

        {/* Temporary user profile */}
        <div className="mt-4 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dce5ff] text-xs font-bold text-[#3157d5]">
            JD
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#26314c]">
              John Doe
            </p>

            <p className="text-[11px] text-[#8a92a4]">
              Temp
            </p>
          </div>

          <ChevronRight
            size={16}
            className="text-[#949bad]"
          />
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
