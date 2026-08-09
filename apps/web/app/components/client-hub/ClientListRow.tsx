"use client";

import type { ReactNode } from "react";
import { Avatar } from "../ui/Avatar";
import { Card } from "../ui/Card";

export function ClientListRow({
  name, subtitle, trailing,
}: {
  name: string;
  subtitle: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <Card radius="2xl" className="flex items-center gap-3 p-4 hover:shadow-md transition">
      <Avatar name={name} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink-900 truncate">{name}</p>
        <div className="text-xs text-[--text-muted] mt-0.5">{subtitle}</div>
      </div>
      {trailing}
    </Card>
  );
}
