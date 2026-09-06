"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Settings, ChevronRight } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Portfolio",
      href: "/",
      icon: BarChart3,
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 flex flex-col border-r border-stone-200 bg-white">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-stone-800 flex items-center justify-center">
              <ChevronRight className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-stone-800 leading-tight">
              Stock Playbook
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive(href)
                  ? "bg-stone-100 text-stone-900 font-medium"
                  : "text-stone-500 hover:text-stone-800 hover:bg-stone-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-stone-100">
          <Link
            href="/settings"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive("/settings")
                ? "bg-stone-100 text-stone-900 font-medium"
                : "text-stone-500 hover:text-stone-800 hover:bg-stone-50"
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-[1240px] mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
