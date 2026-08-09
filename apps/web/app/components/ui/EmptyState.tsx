import * as React from "react";

export function EmptyState({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-[--text-muted] ${className}`}>{children}</p>;
}
