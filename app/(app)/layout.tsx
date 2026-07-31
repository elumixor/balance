import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/track", label: "Track" },
  { href: "/stats", label: "Stats" },
  { href: "/config", label: "Config" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold tracking-tight">Balance</span>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">{children}</main>
    </div>
  );
}
