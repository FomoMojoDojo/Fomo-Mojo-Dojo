import Image from "next/image";
import { BrandReveal } from "@/components/BrandReveal";
import { DifferentiationSequence } from "@/components/DifferentiationSequence";
import { HeroMapVideo } from "@/components/HeroMapVideo";
import { LegalOverlay } from "@/components/LegalOverlay";
import { MapDetailGallery } from "@/components/MapDetailGallery";
import { MojoMapQuiz } from "@/components/MojoMapQuiz";
import { MojoMapSequence } from "@/components/MojoMapSequence";
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
  "Alignment stops requiring effort",
  "Momentum becomes the default",
];

const mapDetailCards = [
  {
    title: "Current Position",
    body: "See where you are now based on evidence, not assumptions.",
    image: {
      src: "/mojomap/current-position.png",
      alt: "MojoMap current position screenshot",
    },
  },
  {
    title: "Biggest Constraint",
    body: "Surface the one thing creating drag across strategy and execution.",
    image: {
      src: "/mojomap/biggest-constraint.png",
      alt: "MojoMap biggest constraint screenshot",
    },
  },
  {
    title: "Next Move",
    body: "Get a clear next action: fix, improve, or create.",
    image: {
      src: "/mojomap/next-move.png",
      alt: "MojoMap next move screenshot",
    },
  },
];

function SectionShell({
  id,
  children,
  compact = false,
  className = "",
  containerClassName = "max-w-narrative",
}: {
  id: string;
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <section id={id} className={`section-shell ${compact ? "section-compact" : ""} ${className}`.trim()}>
      <div className={`mx-auto w-full px-5 sm:px-8 ${containerClassName}`.trim()}>{children}</div>
    </section>
  );
}

function CTAButtons({ centered = false }: { centered?: boolean }) {
  return (
    <div className={centered ? "cta-wrap cta-center" : "cta-wrap"}>
      <MojoMapQuiz
        triggerLabel={siteConfig.cta.primaryLabel}
        triggerClassName="btn btn-primary"
        calendlyBaseUrl={siteConfig.cta.secondaryUrl}
      />
    </div>
  );
}

function HowStepIcon({ title }: { title: string }) {
  if (title === "Diagnose") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.2" />
        <path d="M16 16L21 21" />
      </svg>
    );
  }

  if (title === "Focus") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" />
        <circle cx="12" cy="12" r="3.3" />
      </svg>
    );
  }

  if (title === "Flow") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7c2.4 0 2.4-2 4.8-2s2.4 2 4.8 2 2.4-2 4.8-2 2.4 2 4.8 2" />
        <path d="M3 12c2.4 0 2.4-2 4.8-2s2.4 2 4.8 2 2.4-2 4.8-2 2.4 2 4.8 2" />
        <path d="M3 17c2.4 0 2.4-2 4.8-2s2.4 2 4.8 2 2.4-2 4.8-2 2.4 2 4.8 2" />
      </svg>
    );
  }

  return null;
}

type SocialName = "linkedin" | "medium" | "substack" | "tiktok" | "youtube" | "bluesky";

function SocialIcon({ name }: { name: SocialName }) {
  if (name === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.2" y="8" width="4.2" height="12.8" rx="0.7" />
        <circle cx="5.3" cy="4.9" r="1.9" />
        <path d="M10.6 8h4v1.9c.7-1.2 1.9-2.4 4.1-2.4 3.1 0 4.1 2 4.1 5.2v8.1h-4.1v-7c0-1.7-.5-2.6-1.9-2.6-1.4 0-2.1 1-2.1 2.6v7h-4V8z" />
      </svg>
    );
  }

  if (name === "medium") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7.2" cy="12.1" r="4.2" />
        <ellipse cx="14.7" cy="12.1" rx="3.2" ry="4.2" />
        <ellipse cx="20.3" cy="12.1" rx="1.6" ry="4.2" />
      </svg>
    );
  }

  if (name === "substack") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.2h16" />
        <path d="M4 8.6h16" />
        <path d="M4 12h16" />
        <path d="M6 12v6.8h12V12" />
      </svg>
    );
  }

  if (name === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.4 4.2v8.6a3.7 3.7 0 1 1-3.7-3.7" />
        <path d="M14.4 4.2c.8 1.5 2.2 2.6 4 3v3c-1.7-.2-3.2-.9-4.5-2.1" />
      </svg>
    );
  }

  if (name === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.7" y="6.1" width="18.6" height="11.8" rx="3.2" />
        <path d="M10.1 9.4l5.4 2.6-5.4 2.6z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 11.7c2.3-3.2 4.7-4.8 7.1-4.8-1 3.9-3.3 6.5-7.1 7.9-3.8-1.4-6.1-4-7.1-7.9 2.4 0 4.8 1.6 7.1 4.8z" />
      <path d="M12 12.3c2 2.7 4.2 4.1 6.5 4.1-1 2-3.2 3.3-6.5 4-3.3-.7-5.5-2-6.5-4 2.3 0 4.5-1.4 6.5-4.1z" />
    </svg>
  );
}

export default function Home() {
  const socialLinks = [
    { name: "linkedin" as const, label: "LinkedIn", url: siteConfig.social.linkedIn },
    { name: "medium" as const, label: "Medium", url: siteConfig.social.medium },
    { name: "substack" as const, label: "Substack", url: siteConfig.social.substack },
    { name: "tiktok" as const, label: "TikTok", url: siteConfig.social.tiktok },
    { name: "youtube" as const, label: "YouTube", url: siteConfig.social.youtube },
    { name: "bluesky" as const, label: "Bluesky", url: siteConfig.social.bluesky },
  ];

  return (
    <main className="launch-page">
      <div className="ambient-grid" aria-hidden="true" />

      <BrandReveal />

      <SectionShell id="hero" containerClassName="max-w-[120rem]">
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
          </div>

          <Reveal delay={220} className="visual-wrap hero-visual-lower">
            <div className="hero-map-frame">
              <HeroMapVideo />
            </div>
          </Reveal>
        </div>
      </SectionShell>

      <SectionShell id="problem" className="problem-shell">
        <div className="mx-auto max-w-4xl text-center">
          <ProblemSequence />
        </div>
      </SectionShell>

      <SectionShell id="mojomap" className="mojomap-shell">
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
            </div>

            <Reveal delay={240} className="visual-wrap">
              <div className="mojomap-core-shot">
                <Image
                  src="/mojomap/mojomap-core.jpeg"
                  alt="MojoMap projected outcome and next move view"
                  className="mojomap-core-image"
                  fill
                  sizes="(min-width: 980px) 42vw, 100vw"
                />
              </div>
            </Reveal>
          </div>

          <div className="mx-auto max-w-4xl">
            <MojoMapSequence />
          </div>

          <div className="map-screens-hold">
            <div className="map-screens-wrap map-screens-overlap">
              <Reveal delay={360}>
                <MapDetailGallery items={mapDetailCards} />
              </Reveal>
            </div>
          </div>

          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <Reveal delay={460} className="space-y-2">
              <p className="copy">This isn't a static plan.</p>
              <p className="copy">New insights update the map.</p>
              <p className="copy">Decisions reshape priorities.</p>
            </Reveal>

            <div className="mojomap-cta-stage">
              <Reveal delay={760}>
                <MojoMapQuiz
                  triggerLabel={siteConfig.cta.primaryLabel}
                  triggerClassName="btn btn-primary btn-mojomap-cta"
                  calendlyBaseUrl={siteConfig.cta.secondaryUrl}
                />
              </Reveal>
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="how-it-works" compact className="how-it-works-shell">
        <div className="space-y-10">
          <Reveal
            delay={0}
            threshold={0.9}
            rootMargin="0px 0px -48% 0px"
            className="space-y-3 text-center"
          >
            <h2 className="display-lg">A simple path to clarity</h2>
          </Reveal>

          <div className="how-steps-stack">
            {cards.map((card, index) => (
              <Reveal
                key={card.title}
                delay={140 + index * 120}
                threshold={0.72}
                rootMargin="0px 0px -40% 0px"
                className="how-step-reveal"
              >
                <article className="panel how-step">
                  <div className="how-step-inner">
                    <span className="how-step-icon">
                      <HowStepIcon title={card.title} />
                    </span>
                    <div className="how-step-copy">
                      <h3 className="panel-title">{card.title}</h3>
                      <p className="panel-copy">{card.body}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell id="outcomes" compact className="outcomes-shell">
        <div className="space-y-10">
          <Reveal
            delay={0}
            threshold={0.9}
            rootMargin="0px 0px -48% 0px"
            className="space-y-3"
          >
            <h2 className="display-lg outcomes-title-left">What changes</h2>
          </Reveal>

          <ul className="outcomes-checklist">
            {outcomes.map((item, index) => (
              <Reveal key={item} as="li" delay={120 + index * 100} className="outcome-item">
                <span className="outcome-check" aria-hidden="true">✓</span>
                <strong>{item}</strong>
              </Reveal>
            ))}
          </ul>
        </div>
      </SectionShell>

      <SectionShell id="differentiation" compact>
        <div className="mx-auto max-w-4xl">
          <DifferentiationSequence />
        </div>
      </SectionShell>

      <SectionShell id="final-cta" compact>
        <Reveal delay={0} className="final-cta final-cta-slide">
          <h2 className="display-lg">Start with clarity</h2>
          <div className="final-cta-intro">
            <p className="copy final-cta-intro-line">No prep. No pressure.</p>
            <p className="copy final-cta-intro-line">
              You'll leave the first conversation with a clearer view of what matters.
            </p>
          </div>
          <MojoMapQuiz
            triggerLabel={siteConfig.cta.primaryLabel}
            triggerClassName="btn btn-primary"
            calendlyBaseUrl={siteConfig.cta.secondaryUrl}
          />
          <div className="final-cta-process">
            <p className="support-line final-cta-process-line">
              <span className="process-label-orange">You</span> take the quiz, book a call
            </p>
            <p className="support-line final-cta-process-line">
              <span className="process-label-orange">We</span> create your initial map
            </p>
            <p className="support-line final-cta-process-line">
              <span className="process-label-orange">Together</span> we see if there is a fit
            </p>
          </div>
        </Reveal>
      </SectionShell>

      <footer className="footer-shell">
        <div className="mx-auto flex w-full max-w-narrative flex-col items-center gap-8 px-5 py-10 text-center sm:px-8 sm:py-14">
          <Reveal delay={0}>
            <div className="footer-brand">
              <div className="footer-brand-logo-wrap" role="img" aria-label="FomoMojoDojo">
                <Image
                  src="/fomomojodojo-logo-white.svg"
                  alt=""
                  className="footer-brand-logo-base"
                  width={121}
                  height={112}
                />
                <span className="footer-brand-logo-ramp" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm text-fm-muted">Build clarity. Create momentum. Win.</p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="footer-socials">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.url}
                  className="footer-social-link"
                  aria-label={social.label}
                  title={social.label}
                >
                  <SocialIcon name={social.name} />
                  <span className="sr-only">{social.label}</span>
                </a>
              ))}
            </div>
          </Reveal>

          <div className="footer-legal">
            <p>{siteConfig.legal.copyright}</p>
            <LegalOverlay variant="compact" />
            <p>{siteConfig.legal.trademarks}</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
