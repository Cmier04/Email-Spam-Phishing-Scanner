
// Temporary welcome page used to verify the initial frontend setup.
// The full dashboard and email scanner will be added in later phases.
function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f8fb] p-6">
      <div className="w-full max-w-xl rounded-2xl border border-[#e2e6ed] bg-white p-8 shadow-sm">
        <div className="mb-5 inline-flex rounded-xl bg-[#3157d5] p-3 text-white">
          <span className="text-xl font-bold">E</span>
        </div>

        <h1 className="text-3xl font-bold text-[#17213c]">
          Project Name
        </h1>

        <p className="mt-3 text-[#747e93]">
          Email Spam and Phishing Scanner
        </p>

        <div className="mt-6 rounded-xl bg-[#eef2ff] p-4">
          <p className="text-sm font-medium text-[#3157d5]">
            Implementation.
          </p>

          <p className="mt-2 text-sm text-[#596579]">
            Testing.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
