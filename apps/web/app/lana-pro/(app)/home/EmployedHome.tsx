import type { TodayItem } from "@/lib/lana-pro-workspace/today";
import type { LanaClientBrief } from "@/lib/lana-pro-intelligence/client-brief";
import { buildIntelligenceModel } from "@/lib/lana-pro-workspace/home-model";
import {
  PageWrap,
  Greeting,
  Section,
  MetricRow,
  NextCard,
  DayList,
  EmptyBlock,
  IntelligenceBriefs,
} from "./_ui";

export interface EmployedHomeModel {
  greeting: string;
  venueName: string;
  today: TodayItem[];
  next: TodayItem | null;
  activeClients: number;
}

/**
 * §13 — an EMPLOYED professional's Home shows ONLY their operational work at
 * this venue: today's assigned appointments, what's next, and their own client
 * roster count. No venue revenue, no other trainers' clients, no business
 * settings.
 */
export function EmployedHome({
  model,
  briefs = [],
}: {
  model: EmployedHomeModel;
  briefs?: LanaClientBrief[];
}) {
  const hasToday = model.today.length > 0;
  return (
    <PageWrap>
      <Greeting
        line1={`${model.greeting}`}
        line2={`Your work at ${model.venueName} today.`}
      />

      <IntelligenceBriefs briefs={briefs} emptyModel={buildIntelligenceModel({}, {})} />

      <Section title="Today">
        <MetricRow
          items={[
            {
              value: model.today.length,
              label: model.today.length === 1 ? "appointment" : "appointments",
            },
            {
              value: model.activeClients,
              label: model.activeClients === 1 ? "active client" : "active clients",
            },
          ]}
        />
      </Section>

      <Section title="Next">
        {model.next ? (
          <NextCard
            item={model.next}
            primaryAction={
              model.next.href ? { label: "Open booking", href: model.next.href } : undefined
            }
            secondaryAction={{ label: "All bookings", href: "/lana-pro/bookings" }}
          />
        ) : (
          <EmptyBlock
            headline="Nothing booked yet"
            subcopy="Appointments the venue assigns to you will show up here."
            actions={[{ label: "View clients", href: "/lana-pro/clients" }]}
          />
        )}
      </Section>

      {hasToday && (
        <Section title="Your day" action={{ label: "View schedule", href: "/lana-pro/schedule" }}>
          <DayList items={model.today} />
        </Section>
      )}
    </PageWrap>
  );
}
