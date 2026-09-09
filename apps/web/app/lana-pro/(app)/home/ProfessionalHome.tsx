import type { ProfessionalHomeModel } from "@/lib/lana-pro-workspace/home-model";
import type { HomeAttentionItem } from "@/lib/lana-pro-home-attention/types";
import {
  PageWrap,
  Greeting,
  VerificationStrip,
  Section,
  MetricRow,
  NextCard,
  DayList,
  EmptyBlock,
  ClientsNeedingAttention,
  SetupChecklist,
  GrowPractice,
} from "./_ui";

export function ProfessionalHome({
  model,
  marketplaceGated,
  attention = [],
}: {
  model: ProfessionalHomeModel;
  marketplaceGated: boolean;
  attention?: HomeAttentionItem[];
}) {
  const { schedule, counts, emptyState } = model;
  const hasToday = schedule.today.length > 0;

  return (
    <PageWrap>
      <Greeting
        line1={model.firstName ? `${model.greeting}, ${model.firstName}` : model.greeting}
        line2="Here's what needs your attention today."
      />

      {marketplaceGated && <VerificationStrip notice={model.verification} />}

      <Section title="Today">
        <MetricRow
          items={[
            { value: counts.appointmentsToday, label: counts.appointmentsToday === 1 ? "appointment" : "appointments" },
            { value: counts.activeClients, label: counts.activeClients === 1 ? "active client" : "active clients" },
            {
              value: counts.invitationsPending,
              label: counts.invitationsPending === 1 ? "invitation pending" : "invitations pending",
            },
          ]}
        />
      </Section>

      <Section title="Next">
        {schedule.next ? (
          <NextCard
            item={schedule.next}
            primaryAction={
              schedule.next.clientName ? { label: "View client", href: "/lana-pro/clients" } : undefined
            }
            secondaryAction={{ label: "View booking", href: "/lana-pro/bookings" }}
          />
        ) : (
          <EmptyBlock headline={emptyState.headline} subcopy={emptyState.subcopy} actions={emptyState.actions} />
        )}
      </Section>

      <ClientsNeedingAttention items={attention} />


      {hasToday && (
        <Section title="Your day" action={{ label: "View schedule", href: "/lana-pro/schedule" }}>
          <DayList items={schedule.today} />
        </Section>
      )}

      {model.showGrowPractice && <GrowPractice />}

      <SetupChecklist items={model.checklist.items} />
    </PageWrap>
  );
}
