
import { useState } from "react";
import {
  Inbox,
  CircleCheck,
  TriangleAlert,
  ShieldCheck,
} from "lucide-react";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import MetricCard from "./components/MetricCard";
import EmailResultsTable from "./components/EmailResultsTable";
import EmailDetail from "./components/EmailDetail";

import { mockEmails } from "./data/mockEmails";
import type { Email } from "./data/mockEmails";

function App() {
  // Controls the visibility of the mobile sidebar.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Stores the email currently open in the analysis view.
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(
    null
  );

  function openEmail(email: Email) {
    setSelectedEmail(email);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#17213c]">
      {/* Sidebar navigation */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main dashboard layout */}
      <main className="lg:ml-[248px]">
        {selectedEmail ? (
          /* Show the selected email analysis. */
          <EmailDetail
            email={selectedEmail}
            onBack={() => setSelectedEmail(null)}
            onOpenMenu={() => setSidebarOpen(true)}
          />
        ) : (
          <>
            <Header
              onOpenMenu={() => setSidebarOpen(true)}
            />

            <div className="mx-auto max-w-[1280px] px-5 py-7 md:px-8 md:py-9">
              {/* Dashboard welcome section */}
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-[26px] font-bold tracking-tight text-[#17213c]">
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

              {/* Dashboard statistics use temporary values for now. */}
              <section
                aria-label="Email statistics"
                className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                <MetricCard
                  label="Emails scanned"
                  value="1,284"
                  note="+48 this week"
                  icon={Inbox}
                  color="blue"
                />

                <MetricCard
                  label="Legitimate"
                  value="1,247"
                  note="97.1% of emails"
                  icon={CircleCheck}
                  color="green"
                />

                <MetricCard
                  label="Potential threats"
                  value="37"
                  note="12 need review"
                  icon={TriangleAlert}
                  color="red"
                />

                <MetricCard
                  label="Protection score"
                  value="96%"
                  note="Excellent"
                  icon={ShieldCheck}
                  color="violet"
                />
              </section>

              {/* Display sample emails and open their analysis pages. */}
              <EmailResultsTable
                emails={mockEmails}
                onSelect={openEmail}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
