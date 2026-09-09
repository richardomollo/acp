import { redirect } from "next/navigation";
import { resolveWorkspaceIdentity } from "../../../_shared/identity";
import { proContextFor } from "../../../_shared/pro-context";
import { TemplateBuilder } from "../_lib/TemplateBuilder";
import { emptyDraft, type TemplateDraft } from "../_lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "New workout" };

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");
  const pro = proContextFor(identity);
  if (!pro || pro.workspace === "business") redirect("/lana-pro/workouts");

  const { g } = await searchParams;
  let initial: TemplateDraft = emptyDraft();
  if (g) {
    try {
      const parsed = JSON.parse(decodeURIComponent(atob(g))) as TemplateDraft;
      if (parsed && Array.isArray(parsed.exercises)) initial = { ...emptyDraft(), ...parsed, id: null };
    } catch {
      /* ignore a malformed draft param — fall back to an empty builder */
    }
  }

  return (
    <TemplateBuilder
      initial={initial}
      workspace={pro.workspace === "employed" ? "employed" : "independent"}
      mode="create"
    />
  );
}
