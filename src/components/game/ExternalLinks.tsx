import { ShoppingCart } from "lucide-react";

/** Modern X (Twitter) logo as an inline SVG icon. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const linkBase =
  "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/70 text-slate-50 shadow backdrop-blur transition-colors hover:bg-slate-800/80";

/** External Buy + X social links docked next to settings/docs. */
export function ExternalLinks() {
  return (
    <>
      <a
        href="https://www.ponsfamily.com/launchpad/........"
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Buy on Pons Family Launchpad"
        title="Buy on Pons Family Launchpad"
        className={linkBase}
      >
        <ShoppingCart className="h-4 w-4" />
      </a>
      <a
        href="https://x.com/gofish_rh"
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Follow on X"
        title="Follow on X"
        className={linkBase}
      >
        <XIcon className="h-4 w-4" />
      </a>
    </>
  );
}
