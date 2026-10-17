
import { Clock3, Menu, RefreshCw } from "lucide-react";

type HeaderProps = {
  onOpenMenu: () => void;
};

function Header({ onOpenMenu }: HeaderProps) {
  return (
    <header className="flex h-[72px] items-center justify-between border-b border-[#e4e8ef] bg-white px-5 md:px-8">
      <div className="flex items-center gap-3">
        {/* Mobile navigation button and Smaller Window */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="text-[#596579] lg:hidden"
        >
          <Menu size={22} />
        </button>

        <div>
          <h1 className="text-base font-bold text-[#202a44]">
            Dashboard
          </h1>

          <p className="hidden text-[11px] text-[#9299aa] sm:block">
            Monitor and protect your inbox
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Scan status placeholder */}
        <div className="hidden items-center gap-2 rounded-lg border border-[#e0e5ed] px-3 py-2 text-xs text-[#626d82] md:flex">
          <Clock3 size={14} />
          <span>No scans yet</span>
        </div>

        {/* Scanning will be implemented in a later phase */}
        <button
          type="button"
          disabled
          title="Scanning will work with the backend"
          className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-[#3157d5] px-4 py-2.5 text-xs font-semibold text-white opacity-60"
        >
          <RefreshCw size={14} />
          <span>Scan emails</span>
        </button>
      </div>
    </header>
  );
}

export default Header;
