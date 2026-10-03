import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs tracking-widest text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

const control =
  "min-h-11 w-full border border-fg/15 bg-bg px-3 text-base text-fg outline-none placeholder:text-muted";

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />;
}

export function Area(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, "min-h-32 py-3 leading-relaxed", props.className)} />;
}

export function Button({
  tone = "solid",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "solid" | "line" | "quiet" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40",
        tone === "solid" && "bg-accent text-fg",
        tone === "line" && "border border-fg/20 text-fg",
        tone === "quiet" && "text-muted",
        className,
      )}
    />
  );
}
