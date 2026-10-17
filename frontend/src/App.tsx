
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";

function App() {
  // Controls whether the sidebar is visible on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#17213c]">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="lg:ml-[248px]">
        <Header
          onOpenMenu={() => setSidebarOpen(true)}
        />

        <div className="mx-auto max-w-[1280px] px-5 py-7 md:px-8 md:py-9">
          {/* Dashboard welcome section */}
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[26px] font-bold tracking-[-0.035em] text-[#17213c]">
                Good Afternoon John Doe,
              </h2>

              <p className="mt-1 text-sm text-[#747e93]">
                Testing.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-[#687288]">
              <span className="h-2 w-2 rounded-full bg-[#94a3b8]" />
              Protecting
            </div>
          </div>

          {/* Dashboard placeholder for Phase 3 */}
          <section className="rounded-2xl border border-[#e2e6ed] bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-[#202a44]">
              Dashboard overview
            </h3>

            <p className="mt-2 text-sm text-[#747e93]">
              The email statistics and recent scan results.
            </p>

            <span className="mt-5 inline-block rounded-lg bg-[#eef2ff] px-3 py-1.5 text-xs font-semibold text-[#3157d5]">
              Module
            </span>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
