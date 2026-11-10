import { createFileRoute, notFound } from "@tanstack/react-router";
import { STEPS, type StepSlug } from "@/data/diagnose";
import { Shell } from "@/components/diagnose/Shell";
import { StepView } from "@/components/diagnose/Steps";

export const Route = createFileRoute("/diagnose/$step")({
  loader: ({ params }) => {
    const s = STEPS.find((x) => x.slug === params.step);
    if (!s) throw notFound();
    return { slug: s.slug as StepSlug, label: s.label };
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.label} · Diagnose · MojoMap` : "Diagnose · MojoMap";
    const desc = "Edgewood's Diagnose phase: base, goal and market, checked against the evidence.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: () => <div className="p-10">That step doesn't exist.</div>,
  component: DiagnoseStep,
});

function DiagnoseStep() {
  const { slug } = Route.useLoaderData();
  return (
    <Shell step={slug}>
      <StepView step={slug} />
    </Shell>
  );
}
