import type { BusinessHomeModel } from "@/lib/lana-pro-workspace/home-model";
import type { LanaBusinessBrief } from "@/lib/lana-pro-intelligence/business-brief";
import {
  PageWrap,
  Greeting,
  VerificationStrip,
  Section,
  MetricRow,
  NextCard,
  DayList,
  EmptyBlock,
  IntelligenceCard,
  BusinessIntelligence,
  SetupChecklist,
} from "./_ui";

export function BusinessHome({
  model,
}: {
  model: BusinessHomeModel & {
    teamToday?: { name: string; count: number }[];
    businessBrief?: LanaBusinessBrief | null;
  };
}) {
  const { schedule, counts, emptyState } = model;
  const hasToday = schedule.today.length > 0;
  const teamToday = model.teamToday ?? [];
  const businessBrief = model.businessBrief ?? null;

  return (
    <PageWrap>
      <Greeting
        line1={`${model.greeting}, ${model.displayName}`}
        line2="Here's what's happening across your venue today."
      />

      <VerificationStrip notice={model.verification} />

      <Section title="Today">
        <MetricRow
          items={[
            { value: counts.classesToday, label: counts.classesToday === 1 ? "class" : "classes" },
            { value: counts.bookingsToday, label: counts.bookingsToday === 1 ? "booking" : "bookings" },
            {
              value: counts.spacesRemaining,
              label: counts.spacesRemaining === 1 ? "space remaining" : "spaces remaining",
            },
          ]}
        />
      </Section>

      <Section title="Next">
        {schedule.next ? (
          <NextCard item={schedule.next} primaryAction={{ label: "View class", href: "/lana-pro/schedule" }} />
        ) : (
          <EmptyBlock headline={emptyState.headline} subcopy={emptyState.subcopy} actions={emptyState.actions} />
        )}
      </Section>

      {teamToday.length > 0 && (
        <Section title="Team today">
          <div className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {teamToday.map((t) => (
              <div key={t.name} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                <p className="text-sm text-gray-500">
                  {t.count} appointment{t.count === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {businessBrief ? (
        <BusinessIntelligence brief={businessBrief} />
      ) : (
        <IntelligenceCard model={model.intelligence} />
      )}

      {hasToday && (
        <Section title="Today's schedule" action={{ label: "View schedule", href: "/lana-pro/schedule" }}>
          <DayList items={schedule.today} />
        </Section>
      )}

      <SetupChecklist items={model.checklist.items} />
    </PageWrap>
  );
}
