// V2-5 — the Act 3 band wrapper: a signed heading + framing line above public-register
// content. Presentational only; each band's content component owns its own honest-empty.
// No vertical bar, breathing room, plain English.
import type { ReactNode } from "react";
import { outsideBand, type OutsideBandKey } from "@/lib/firstRead/outsideBands";

export default function OutsideBand({ bandKey, children }: { bandKey: OutsideBandKey; children: ReactNode }) {
  const copy = outsideBand(bandKey);
  return (
    <section className="cvs-ob-band" aria-label={`What the outside shows about your ${copy.heading.toLowerCase()}`}>
      <p className="cvs-ob-heading">{copy.heading}</p>
      <p className="cvs-ob-framing">{copy.framing}</p>
      <div className="cvs-ob-body">{children}</div>
    </section>
  );
}
