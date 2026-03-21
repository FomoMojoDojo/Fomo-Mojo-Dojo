import Image from "next/image";
import { MojoMapVisual } from "@/components/MojoMapVisual";
import { ProblemSequence } from "@/components/ProblemSequence";
import { Reveal } from "@/components/Reveal";
import { siteConfig } from "@/config/site";

const cards = [
  {
    title: "Diagnose",
    body: "See what's actually going on\nusing real customer and market evidence",
  },
  {
    title: "Focus",
    body: "Decide what matters (and what doesn't)\nso effort goes to the right place",
  },
  {
    title: "Flow",
    body: "Turn clarity into momentum\nwith consistent, aligned action",
  },
];

const outcomes = [
  "Decisions get faster",
  "Teams stop re-litigating",
  "Work connects to outcomes",
  "Progress becomes visible",
];

const mapDetailCards = [
  {
    title: "Current Position",
    body: "See where you are now based on evidence, not assumptions.",
  },
  {
    title: "Biggest Constraint",
    body: "Surface the one thing creating drag across strategy and execution.",
  },
  {
    title: "Next Move",
    body: "Get a clear next action: fix, improve, or create.",
  },
  {
    title: "What to Ignore",
    body: "Remove noise so your team can commit with confidence.",
  },
];

function SectionShell({
  id,
  children,
  compact = false,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={`section-shell ${compact ? "section-compact" : ""} ${className}`.trim()}>
      <div className="mx-auto w-full max-w-narrative px-5 sm:px-8">{children}</div>
    </section>
  );
}

function CTAButtons({ centered = false }: { centered?: boolean }) {
  return (
    <div className={centered ? "cta-wrap cta-center" : "cta-wrap"}>
      <a href={siteConfig.cta.primaryUrl} className="btn btn-primary">
        {siteConfig.cta.primaryLabel}
      </a>
      <a href={siteConfig.cta.secondaryUrl} className="btn btn-secondary">
        {siteConfig.cta.secondaryLabel}
      </a>
    </div>
  );
}

export default function Home() {
  return (
    <main className="launch-page">
      <div className="ambient-grid" aria-hidden="true" />

      <header className="brand-reveal-shell">
        <div className="brand-reveal-panel">
          <article className="brand-column">
            <h3 className="brand-column-title">FOMO: The Focus Killer</h3>
            <p>
              Feeling pulled in a million directions? That's FOMO. It's the nagging anxiety that you're not working
              on the <em>right</em> thing, a direct symptom of an unclear strategy. It kills your focus and momentum.
            </p>
            <p>
              <strong>
                We diagnose the chaos and simplify it down to what actually matters, making the complex feel simple.
              </strong>
            </p>
          </article>

          <article className="brand-column">
            <h3 className="brand-column-title">MOJO: Your Unfair Advantage</h3>
            <p>
              MOJO is that feeling of flow your team gets from having absolute clarity and confidence in your
              strategy. It's the powerful, persuasive energy that comes from knowing exactly where you're going and
              why.
            </p>
            <p>
              <strong>
                We guide you to this state of clarity, creating the path for your MOJO to emerge.
              </strong>
            </p>
          </article>

          <article className="brand-column">
            <h3 className="brand-column-title">DOJO: Your Path to Mastery</h3>
            <p>
              The DOJO isn't a place; it's our method for helping you achieve strategic independence. We provide the
              framework, tools, and guided practice you need to build the internal muscle for lasting clarity.
            </p>
            <p>
              <strong>
                Our goal is to empower you to find the answers yourselves, so you can keep your MOJO long after our
                work together is done.
              </strong>
            </p>
          </article>
        </div>

        <a href="#hero" className="brand-logo-link" aria-label="FomoMojoDojo">
          <Image
            src="/fomomojodojo-logo.png"
            alt="FomoMojoDojo"
            className="brand-logo"
            width={406}
            height={118}
            priority
          />
        </a>
      </header>

      <SectionShell id="hero">
        <div className="hero-grid">
          <div className="space-y-6">
            <Reveal delay={20} className="space-y-4">
              <h1 className="display-xl">
                <span className="headline-line headline-primary">Stop guessing.</span>
                <span className="headline-line headline-accent">
                  <span className="accent-chunk">Start making</span>{" "}
                  <span className="accent-chunk">better decisions.</span>
                </span>
              </h1>
            </Reveal>

            <Reveal delay={180} className="space-y-3">
              <p className="lede">
                MojoMap™ is a Strategic Decision System that shows you where you are,
                what's holding you back, and what to do next.
              </p>
              <p className="lede">Your team moves with clarity and momentum.</p>
            </Reveal>

            <Reveal delay={320}>
              <CTAButtons />
            </Reveal>

            <Reveal delay={420}>
              <p className="support-line">We'll come to the first call with your initial MojoMap.</p>
            </Reveal>
          </div>

          <Reveal delay={220} className="visual-wrap hero-visual-lower">
            <MojoMapVisual variant="hero" />
          </Reveal>
        </div>
      </SectionShell>

      <SectionShell id="problem" className="problem-shell">
        <div className="mx-auto max-w-4xl space-y-8 text-center">
          <Reveal delay={0} className="space-y-3">
            <h2 className="display-lg">You're working hard. But something isn't clicking.</h2>
          </Reveal>

          <ProblemSequence />
        </div>
      </SectionShell>

      <SectionShell id="mojomap">
        <div className="space-y-12">
          <div className="hero-grid mojomap-hero-grid">
            <div className="space-y-6">
              <Reveal delay={0} className="space-y-3">
                <p className="kicker">The MojoMap™</p>
                <h2 className="display-lg">
                  <span className="mojomap-title-primary">See where you are.</span>
                  <span className="mojomap-title-secondary">Know what's holding you back.</span>
                </h2>
                <p className="copy">Move forward with confidence.</p>
              </Reveal>

              <Reveal delay={140} className="space-y-3">
                <p className="copy">Most companies track what happened.</p>
                <p className="copy">Dashboards. Reports. Metrics.</p>
                <p className="copy emphasis">A map shows you where to go.</p>
              </Reveal>
            </div>

            <Reveal delay={240} className="visual-wrap">
              <MojoMapVisual variant="core" />
            </Reveal>
          </div>

          <Reveal delay={320}>
            <div className="mojomap-detail-grid">
              {mapDetailCards.map((detail, index) => (
                <article key={detail.title} className="mojomap-detail-card" data-variant={index + 1}>
                  <div className="mojomap-preview" aria-hidden="true">
                    <span className="preview-path" />
                    <span className="preview-node preview-node-a" />
                    <span className="preview-node preview-node-b" />
                    <span className="preview-node preview-node-c" />
                  </div>
                  <h3 className="mojomap-detail-title">{detail.title}</h3>
                  <p className="mojomap-detail-body">{detail.body}</p>
                </article>
              ))}
            </div>
          </Reveal>

          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <Reveal delay={460} className="space-y-2">
              <p className="copy">This isn't a static plan.</p>
              <p className="copy">New insights update the map. Decisions reshape priorities.</p>
            </Reveal>

            <Reveal delay={560} className="space-y-1">
              <p className="quote-line">"Oh... that's why we're stuck."</p>
              <p className="quote-line">"Now we know what to do."</p>
            </Reveal>

            <Reveal delay={660} className="space-y-3">
              <a href={siteConfig.cta.primaryUrl} className="btn btn-primary btn-mojomap-cta">
                See what your MojoMap could look like
              </a>
              <p className="support-line">We'll build your initial map before we talk.</p>
            </Reveal>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="how-it-works" compact>
        <div className="space-y-10">
          <Reveal delay={0} className="space-y-3 text-center">
            <h2 className="display-lg">A simple path to clarity</h2>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card, index) => (
              <Reveal key={card.title} delay={140 + index * 120}>
                <article className="panel">
                  <h3 className="panel-title">{card.title}</h3>
                  <p className="panel-copy">{card.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell id="outcomes" compact>
        <div className="space-y-10">
          <Reveal delay={0} className="space-y-3">
            <h2 className="display-lg text-center">What changes</h2>
          </Reveal>

          <ul className="outcomes-checklist">
            {outcomes.map((item, index) => (
              <Reveal key={item} as="li" delay={120 + index * 100} className="outcome-item">
                <span className="outcome-check" aria-hidden="true">✓</span>
                <strong>{item}</strong>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={520} className="space-y-2">
            <p className="copy text-center">Alignment stops requiring effort.</p>
            <p className="copy text-center">Momentum becomes the default.</p>
          </Reveal>
        </div>
      </SectionShell>

      <SectionShell id="differentiation" compact>
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <Reveal delay={0} className="space-y-3">
            <h2 className="display-lg">This isn't consulting</h2>
          </Reveal>

          <Reveal delay={130} className="space-y-3">
            <p className="copy">We don't hand you a deck and disappear.</p>
            <p className="copy">We build a system your team actually uses.</p>
          </Reveal>

          <Reveal delay={260} className="space-y-1 text-[1.02rem] text-fm-text/94">
            <p>Not presentations.</p>
            <p>Not theory.</p>
            <p>Not one-off workshops.</p>
          </Reveal>

          <Reveal delay={380}>
            <p className="copy">A shared map for making better decisions, every week.</p>
          </Reveal>
        </div>
      </SectionShell>

      <SectionShell id="final-cta" compact>
        <Reveal delay={0} className="final-cta">
          <h2 className="display-lg">Start with clarity</h2>
          <p className="copy">See what's actually blocking your momentum</p>

          <Reveal delay={220}>
            <CTAButtons centered />
          </Reveal>

          <Reveal delay={320} className="space-y-1">
            <p className="support-line">No prep. No pressure.</p>
            <p className="support-line">You'll leave the first conversation with a clearer view of what matters.</p>
          </Reveal>
        </Reveal>
      </SectionShell>

      <footer className="footer-shell">
        <div className="mx-auto flex w-full max-w-narrative flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
          <Reveal delay={0}>
            <div>
              <p className="font-display text-2xl tracking-tight text-fm-text">{siteConfig.companyName}</p>
              <p className="mt-2 text-sm text-fm-muted">Build clarity. Create momentum. Win.</p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="flex flex-wrap items-center gap-4 text-sm text-fm-text/90">
              <a href={siteConfig.social.linkedIn} className="footer-link">
                LinkedIn
              </a>
              <a href={siteConfig.social.substack} className="footer-link">
                Substack
              </a>
              <a href={siteConfig.social.youtube} className="footer-link">
                YouTube
              </a>
            </div>
          </Reveal>

          <Reveal delay={220}>
            <div className="space-y-1 text-xs text-fm-muted">
              <p>{siteConfig.legal.copyright}</p>
              <p>{siteConfig.legal.trademarks}</p>
            </div>
          </Reveal>
        </div>
      </footer>
    </main>
  );
}
