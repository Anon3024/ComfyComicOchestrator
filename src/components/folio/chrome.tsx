import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useDesk } from "@/lib/folio/store";

export function useDeskReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(useDesk.persist.rehydrate()).finally(() => {
      if (!live) return;
      useDesk.getState().ensureSeed();
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

export function Shell({ children }: { children: ReactNode }) {
  useDeskReady();
  return <div className="mx-auto min-h-screen w-full max-w-3xl px-4 pt-6 pb-20">{children}</div>;
}

export function Masthead({ href, label }: { href: "/" | "/bench"; label: string }) {
  return (
    <header className="mb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-accent uppercase">Night press</p>
          <Link to="/" className="font-display text-5xl leading-none text-fg">
            Folio
          </Link>
        </div>
        <Link
          to={href}
          className="inline-flex min-h-11 items-center border border-fg/20 px-4 text-sm text-fg"
        >
          {label}
        </Link>
      </div>
      <div className="mt-4 h-px bg-accent" />
    </header>
  );
}
