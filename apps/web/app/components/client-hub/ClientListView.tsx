"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

export function ClientListView<T extends { id: string }>({
  clients, loading, error, addHref, emptyTitle = "No clients yet", emptyHint, renderRow,
}: {
  clients: T[];
  loading: boolean;
  error: string | null;
  addHref: string;
  emptyTitle?: string;
  emptyHint: string;
  renderRow: (client: T) => ReactNode;
}) {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Clients</h1>
          <p className="text-sm text-[--text-secondary] mt-0.5">{clients.length} total</p>
        </div>
        <Link href={addHref}>
          <Button size="sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Client
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-[--text-muted] py-12 text-center">Loading…</p>
      ) : error ? (
        <div className="bg-danger-50 border border-danger-50 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <svg className="w-12 h-12 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 5v-2a4 4 0 00-3-3.87m-9.6 0A4 4 0 006 15.13V17" />
          </svg>
          <p className="text-ink-600 font-medium">{emptyTitle}</p>
          <EmptyState className="max-w-xs">{emptyHint}</EmptyState>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(renderRow)}
        </div>
      )}
    </div>
  );
}
