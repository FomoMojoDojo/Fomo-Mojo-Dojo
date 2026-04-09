import PageShell from "@/components/layout/PageShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CLIENT_VIEW_VISIBILITY_AUDIT,
  type VisibilityItem,
} from "@/lib/clientViewVisibilityAudit";

function VisibilityList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "client" | "internal";
  items: VisibilityItem[];
}) {
  const badgeClass =
    tone === "client"
      ? "border-forest/35 bg-cream text-forest"
      : "border-rust/35 bg-cream-mid text-rust";

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={badgeClass}>
          {title}
        </Badge>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">
          {items.length} items
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="rounded-md border border-cream-dark bg-white px-3 py-2">
            <p className="font-sans text-[13px] font-semibold text-t-primary">{item.label}</p>
            {item.note ? (
              <p className="mt-0.5 font-sans text-[12px] text-t-secondary">{item.note}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ClientViewVisibilityAuditPage() {
  const totalClient = CLIENT_VIEW_VISIBILITY_AUDIT.reduce((sum, bucket) => sum + bucket.clientView.length, 0);
  const totalInternalOnly = CLIENT_VIEW_VISIBILITY_AUDIT.reduce(
    (sum, bucket) => sum + bucket.internalOnly.length,
    0,
  );

  return (
    <PageShell bare>
      <div className="max-w-content mx-auto w-full space-y-4 px-4 pb-10 pt-6 sm:px-6 md:px-9">
        <Card className="border-cream-dark bg-white/95 shadow-sm">
          <CardHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Visibility Audit</p>
            <CardTitle className="text-[22px] text-t-primary">Client View vs Internal View</CardTitle>
            <CardDescription className="text-[13px] text-t-secondary">
              Quick audit of what is visible in Client View and what stays Internal-only.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-forest/35 bg-cream text-forest">
                Client-visible items: {totalClient}
              </Badge>
              <Badge variant="outline" className="border-rust/35 bg-cream-mid text-rust">
                Internal-only items: {totalInternalOnly}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {CLIENT_VIEW_VISIBILITY_AUDIT.map((bucket) => (
            <Card key={bucket.title} className="border-cream-dark bg-white/95 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-[18px] text-t-primary">{bucket.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VisibilityList title="Client View Includes" tone="client" items={bucket.clientView} />
                <VisibilityList title="Internal View Only" tone="internal" items={bucket.internalOnly} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
