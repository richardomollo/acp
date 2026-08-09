import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-bold tracking-[-0.01em] " +
  "rounded-[--radius-pill] border-[1.5px] cursor-pointer select-none " +
  "transition-[transform,background,color] duration-200 ease-[cubic-bezier(.4,0,.2,1)] " +
  "active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:   "bg-ink-900 text-white border-ink-900 hover:bg-ink-600 hover:border-ink-600",
  secondary: "bg-transparent text-ink-900 border-2 border-ink-900 hover:bg-surface-muted",
  ghost:     "bg-transparent text-blue-500 border-transparent hover:bg-blue-50",
  subtle:    "bg-surface-muted text-ink-600 border-border hover:bg-[--hairline]",
  danger:    "bg-transparent text-danger border-danger-50 hover:bg-danger-50",
};

const sizes: Record<Size, string> = {
  sm: "text-[13px] px-[18px] py-[9px]",
  md: "text-[15px] px-6 py-[13px]",
  lg: "text-base px-[30px] py-4",
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${block ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
