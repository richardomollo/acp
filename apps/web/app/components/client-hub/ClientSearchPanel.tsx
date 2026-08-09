"use client";

import { Card } from "../ui/Card";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Input";

export type ClientMatch = { id: string; name: string | null; email: string | null; phone: string | null };

export function ClientSearchPanel({
  query, onQueryChange, onSearch, searching, match, notFoundHint,
  submitLabel, submitting, onSubmit,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
  match: ClientMatch | null | undefined;
  notFoundHint: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <>
      <Field label="Client's phone or email">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="e.g. 07XX XXX XXX or name@email.com"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
          />
          <button
            onClick={onSearch}
            disabled={searching}
            className="w-12 h-12 rounded-xl bg-ink-900 text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0"
          >
            {searching ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            )}
          </button>
        </div>
      </Field>

      {match === null && (
        <Card radius="xl" className="flex items-center gap-3 p-4 mt-4 text-sm text-[--text-muted]">
          {notFoundHint}
        </Card>
      )}

      {match && (
        <Card radius="xl" className="flex items-center gap-3 p-4 mt-4">
          <Avatar name={match.name ?? match.email ?? "?"} size="sm" />
          <div>
            <p className="font-semibold text-ink-900">{match.name ?? "Unnamed user"}</p>
            <p className="text-xs text-[--text-muted]">{match.email ?? match.phone}</p>
          </div>
        </Card>
      )}

      {match && (
        <Button block onClick={onSubmit} disabled={submitting} className="mt-4">
          {submitting ? "Working…" : submitLabel}
        </Button>
      )}
    </>
  );
}
