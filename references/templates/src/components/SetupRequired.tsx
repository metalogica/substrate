// Rendered by main.tsx when environment variables required by the app
// (VITE_CLERK_PUBLISHABLE_KEY, VITE_CONVEX_URL) are missing.
// Stateless — no hooks, no localStorage, no router. Status comes from
// env-var presence; non-detectable services show as manual with a link.

type Item = {
  name: string;
  blurb: string;
  status: "detected" | "manual";
  link: string;
};

export function SetupRequired() {
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const convexUrl = import.meta.env.VITE_CONVEX_URL;

  const items: Item[] = [
    {
      name: "Clerk",
      blurb: "Authentication. Google sign-in, email, sessions.",
      status: clerkKey ? "detected" : "manual",
      link: "https://dashboard.clerk.com/",
    },
    {
      name: "Convex",
      blurb: "Realtime database and server functions.",
      status: convexUrl ? "detected" : "manual",
      link: "https://dashboard.convex.dev/",
    },
    {
      name: "GitHub",
      blurb: "Source control. Vercel auto-deploys on push to main.",
      status: "manual",
      link: "https://github.com/new",
    },
    {
      name: "Vercel",
      blurb: "Hosting. Deploy on git push.",
      status: "manual",
      link: "https://vercel.com/new",
    },
  ];

  const detected = items.filter((i) => i.status === "detected").length;

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 font-sans text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 font-mono text-sm text-neutral-500">
          ● substrate.dev / setup
        </div>

        <h1 className="text-5xl font-semibold tracking-tight">
          Setup<span className="text-accent">.</span>
        </h1>

        <p className="mt-4 text-neutral-400">
          External services to wire up. Run{" "}
          <code className="font-mono text-neutral-200">/substrate:deploy</code>{" "}
          to complete Clerk + Vercel automatically, or click through each
          dashboard manually.
        </p>

        <div className="mt-12 border-t border-neutral-800">
          {items.map((item, i) => (
            <div
              key={item.name}
              className="flex items-start gap-6 border-b border-neutral-800 py-6"
            >
              <div className="w-8 font-mono text-sm text-neutral-600">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-semibold">{item.name}</span>
                  <span
                    className={
                      item.status === "detected"
                        ? "font-mono text-xs text-accent"
                        : "font-mono text-xs text-neutral-500"
                    }
                  >
                    {item.status === "detected" ? "✓ detected" : "☐ manual"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-400">{item.blurb}</p>
              </div>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-neutral-400 underline-offset-4 hover:text-neutral-100 hover:underline"
              >
                dashboard ↗
              </a>
            </div>
          ))}
        </div>

        <div className="mt-8 font-mono text-sm text-neutral-500">
          progress · {detected}/{items.length} auto-detected
        </div>
      </div>
    </main>
  );
}
