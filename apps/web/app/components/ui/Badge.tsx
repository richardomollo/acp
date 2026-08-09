import * as React from "react";

type Variant = "accent" | "neutral" | "success" | "danger" | "ink" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  accent:  "bg-blue-50 text-blue-500",
  neutral: "bg-[--hairline] text-[--gray-450]",
  success: "bg-success-50 text-success",
  danger:  "bg-danger text-white",
  ink:     "bg-ink-900 text-white",
  outline: "bg-transparent text-[--text-secondary] shadow-[inset_0_0_0_1px_var(--border)]",
};

export function Badge({ variant = "accent", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={
        `inline-flex items-center gap-1 font-bold text-xs leading-tight ` +
        `px-2.5 py-1 rounded-lg whitespace-nowrap ${variants[variant]} ${className}`
      }
      {...props}
    />
  );
}
