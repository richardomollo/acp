// LANA PRO — Phase 4.1: Home presentational primitives (server-rendered).
// Restrained SaaS surfaces: compact metric cards, sections, strong empty
// states. No charts, no fake analytics.

import Link from "next/link";
import type { TodayItem } from "@/lib/lana-pro-workspace/today";
import type { VerificationNotice, IntelligenceModel } from "@/lib/lana-pro-workspace/home-model";
import type { ChecklistItem } from "@/lib/lana-pro-workspace/activation";
import type { LanaClientBrief } from "@/lib/lana-pro-intelligence/client-brief";
import { primaryAction, topObservation, topTalkingPoint } from "@/lib/lana-pro-intelligence/client-brief";
import type { LanaBusinessBrief, BusinessBriefItem } from "@/lib/lana-pro-intelligence/business-brief";

export function PageWrap({ children }: { children: React.ReactNode }) {
  return <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">{children}</div>;
}

export function Greeting({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <header>
      <h1 className="text-2xl md:text-[28px] font-bold text-gray-900 tracking-tight">{line1}</h1>
      <p className="text-gray-500 text-[15px] mt-1">{line2}</p>
    </header>
  );
}

export function VerificationStrip({ notice }: { notice: VerificationNotice }) {
  if (!notice.showNotice) return null;
  const tone =
    notice.tone === "warning"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : notice.tone === "pending"
        ? "bg-blue-50 border-blue-200 text-blue-900"
        : "bg-gray-50 border-gray-200 text-gray-700";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`} role="status">
      <span className="font-semibold">{notice.headline}</span>{" "}
      <span className="opacity-90">{notice.detail}</span>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="text-xs font-semibold text-[#050040] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] rounded"
          >
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function MetricRow({ items }: { items: { value: number | string; label: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {items.map((m) => (
        <div key={m.label} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 leading-none">{m.value}</p>
          <p className="text-xs text-gray-500 mt-1.5 leading-tight">{m.label}</p>
        </div>
      ))}
    </div>
  );
}

function timeLabel(iso: string): string {
  const hhmm = iso.slice(11, 16);
  if (!/^\d\d:\d\d$/.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const disp = h % 12 || 12;
  return `${disp}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function NextCard({
  item,
  primaryAction,
  secondaryAction,
}: {
  item: TodayItem;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
}) {
  const meta =
    item.kind === "class"
      ? `${item.bookedCount ?? 0} / ${item.capacity ?? "–"} booked${item.providerName ? ` · ${item.providerName}` : ""}`
      : [item.clientName, item.status].filter(Boolean).join(" · ");
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="text-center flex-shrink-0 w-16">
          <p className="text-lg font-bold text-gray-900 leading-none">{timeLabel(item.startAt) || "--"}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{item.title}</p>
          {meta && <p className="text-sm text-gray-500 mt-0.5 truncate">{meta}</p>}
        </div>
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap gap-2 mt-4">
          {primaryAction && (
            <Link
              href={primaryAction.href}
              className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0a0866] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
            >
              {primaryAction.label}
            </Link>
          )}
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
            >
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function DayList({ items }: { items: TodayItem[] }) {
  return (
    <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-4 px-5 py-3.5">
          <span className="text-sm font-semibold text-gray-900 w-16 flex-shrink-0">
            {timeLabel(i.startAt) || "--"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900 truncate">{i.title}</span>
            <span className="block text-xs text-gray-500 truncate">
              {i.kind === "class"
                ? `${i.bookedCount ?? 0} / ${i.capacity ?? "–"} booked`
                : i.clientName ?? "Client"}
            </span>
          </span>
          {i.kind === "class" && (i.capacity ?? 0) > 0 && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {Math.round(((i.bookedCount ?? 0) / (i.capacity ?? 1)) * 100)}%
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function EmptyBlock({
  headline,
  subcopy,
  actions,
}: {
  headline: string;
  subcopy: string;
  actions: { label: string; href: string }[];
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center">
      <p className="text-sm font-semibold text-gray-900">{headline}</p>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{subcopy}</p>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {actions.map((a, idx) => (
            <Link
              key={a.href}
              href={a.href}
              className={`rounded-xl text-sm font-semibold px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] ${
                idx === 0
                  ? "bg-[#050040] text-white hover:bg-[#0a0866]"
                  : "border border-gray-200 text-gray-700 hover:border-gray-400"
              }`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function IntelligenceCard({ model }: { model: IntelligenceModel }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-center gap-2 mb-1.5">
        <svg className="w-4 h-4 text-[#050040]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">Lana Intelligence</h2>
      </div>
      <p className="text-sm font-semibold text-gray-900">{model.headline}</p>
      <p className="text-sm text-gray-500 mt-1">{model.detail}</p>
    </div>
  );
}

/**
 * Phase 6 (Step 4) — Lana Intelligence on Home: a small number of grounded,
 * per-client briefs. Answers "what deserves my attention?", not "show me
 * everything". Falls back to the honest `IntelligenceCard` when empty.
 */
export function IntelligenceBriefs({
  briefs,
  emptyModel,
}: {
  briefs: LanaClientBrief[];
  emptyModel: IntelligenceModel;
}) {
  if (briefs.length === 0) return <IntelligenceCard model={emptyModel} />;

  const n = briefs.length;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-[#050040]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">Lana Intelligence</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {n} {n === 1 ? "thing" : "things"} worth your attention today.
      </p>
      <div className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
        {briefs.map((b) => (
          <BriefRow key={b.clientId} brief={b} />
        ))}
      </div>
    </section>
  );
}

function BriefRow({ brief }: { brief: LanaClientBrief }) {
  const first = brief.clientContext.name.split(" ")[0];
  const next = brief.clientContext.nextSession;
  const when = next ? nextLine(next) : null;
  const goal = brief.clientContext.goalLabel;
  const pattern = topObservation(brief);
  const suggest = topTalkingPoint(brief);
  const action = primaryAction(brief.suggestedActions);
  const withheld = brief.state === "no_shared_progress";

  return (
    <div className="px-5 py-4">
      <p className="text-sm font-semibold text-gray-900">{brief.clientContext.name}</p>
      {when && <p className="text-xs text-gray-500 mt-0.5">{when}</p>}

      <dl className="mt-2.5 space-y-2">
        {goal && <BriefField k="Goal" v={goal} />}
        {pattern && <BriefField k="Recent pattern" v={pattern} />}
        {withheld && !pattern && (
          <BriefField k="Progress" v={`${first} hasn't shared their Lana progress with you.`} />
        )}
        {suggest && <BriefField k="Lana suggests" v={suggest} />}
      </dl>

      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-block text-xs font-semibold text-[#050040] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] rounded"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

function BriefField({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{k}</dt>
      <dd className="text-sm text-gray-700 mt-0.5">{v}</dd>
    </div>
  );
}

function nextLine(next: { atIso: string; serviceName: string }): string {
  const time = next.atIso.slice(11, 16);
  const t = time && time !== "00:00" ? time : null;
  return [t, next.serviceName].filter(Boolean).join(" · ");
}

/**
 * Phase 6 (Step 8) — BUSINESS INTELLIGENCE on Home. Deterministic, operations
 * only: capacity, upcoming load, setup gaps, and (once history exists) a
 * conservative demand pattern. Answers "what deserves my attention?" — not
 * "show me analytics". Same restrained visual language as the client briefs.
 */
export function BusinessIntelligence({ brief }: { brief: LanaBusinessBrief }) {
  const items: BusinessBriefItem[] = brief.items;

  const header = (
    <div className="flex items-center gap-2 mb-3">
      <svg className="w-4 h-4 text-[#050040]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">Lana Intelligence</h2>
    </div>
  );

  if (brief.state === "setup") {
    return (
      <section>
        {header}
        <p className="text-sm text-gray-500 mb-4">Let’s get your business ready.</p>
        <div className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
          {items.length > 0 ? (
            items.map((it, i) => <BusinessRow key={i} item={it} />)
          ) : (
            <p className="px-5 py-4 text-sm text-gray-500">
              Add a service and set your schedule to start taking bookings.
            </p>
          )}
        </div>
      </section>
    );
  }

  if (brief.state === "low_data") {
    return (
      <section>
        {header}
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-900">Lana is learning how your business operates.</p>
          <p className="text-sm text-gray-500 mt-1">
            As bookings build, Lana will surface useful patterns in capacity and demand — never guesses.
          </p>
        </div>
        {items.length > 0 && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {items.map((it, i) => (
              <BusinessRow key={i} item={it} />
            ))}
          </div>
        )}
      </section>
    );
  }

  // operational
  const n = items.length;
  return (
    <section>
      {header}
      <p className="text-sm text-gray-500 mb-4">
        {n} {n === 1 ? "thing" : "things"} worth your attention.
      </p>
      <div className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
        {items.map((it, i) => (
          <BusinessRow key={i} item={it} />
        ))}
      </div>
      {brief.dataFreshness.stale && (
        <p className="text-xs text-gray-400 mt-2">
          Based on activity from more than four weeks ago.
        </p>
      )}
    </section>
  );
}

function BusinessRow({ item }: { item: BusinessBriefItem }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-gray-800">{item.text}</p>
      {item.detail && <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>}
      {item.action && (
        <Link
          href={item.action.href}
          className="mt-2 inline-block text-xs font-semibold text-[#050040] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] rounded"
        >
          {item.action.label} →
        </Link>
      )}
    </div>
  );
}

export function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return null;
  return (
    <Section title="Setup">
      <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
        {items.map((i) => (
          <li key={i.id}>
            <Link
              href={i.href}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
            >
              <span className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-800 flex-1">{i.label}</span>
              <span className="text-gray-300" aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function GrowPractice() {
  return (
    <Section title="Grow your practice">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Bring the clients you already work with onto Lana.</p>
          <p className="text-sm text-gray-500 mt-0.5">
            They follow your plan and stay connected between sessions. They choose to accept — nothing is shared until they do.
          </p>
        </div>
        <Link
          href="/lana-pro/clients/invite"
          className="flex-shrink-0 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0a0866] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
        >
          Invite clients
        </Link>
      </div>
    </Section>
  );
}
