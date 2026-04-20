export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-center">
      <h1 className="font-sans text-4xl font-semibold tracking-tight">
        Substrate project initialized
      </h1>
      <p className="mt-4 max-w-xl text-neutral-600">
        Kernel is green. Domain layer + tests are wired. Clerk, Convex, and
        TanStack Router are installed but not yet mounted — run{" "}
        <code className="font-mono text-sm">/substrate-migrate</code> to bring
        your Gemini AI Studio prototype into{" "}
        <code className="font-mono text-sm">src/</code>, or run{" "}
        <code className="font-mono text-sm">/quick-spec</code> to start a feature now.
      </p>
    </main>
  );
}
