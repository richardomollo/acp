import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "filled";
  invalid?: boolean;
}

export function Input({ variant = "default", invalid, className = "", ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid}
      className={
        "w-full box-border text-[15px] text-ink-900 px-4 py-[13px] rounded-[12px] outline-none " +
        "border-[1.5px] transition-[border-color,box-shadow] duration-150 placeholder:text-[--gray-200] " +
        (variant === "filled" ? "bg-surface-muted " : "bg-surface ") +
        (invalid
          ? "border-danger-500 "
          : "border-border focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,47,255,0.12)] ") +
        className
      }
      {...props}
    />
  );
}

export interface FieldProps {
  label?: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

export function Field({ label, helper, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[--gray-450]">
          {label}
        </label>
      )}
      {children}
      {(error || helper) && (
        <span className={`text-xs ${error ? "text-danger" : "text-[--text-muted]"}`}>
          {error || helper}
        </span>
      )}
    </div>
  );
}
