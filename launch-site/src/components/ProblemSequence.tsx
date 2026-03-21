"use client";

import { useEffect, useRef, useState } from "react";

type SequenceStep = {
  id: string;
  kind: "statement" | "list";
  lines: string[];
  emphasis?: boolean;
  callout?: boolean;
  accentLineIndex?: number;
  finalCallout?: boolean;
};

const steps: SequenceStep[] = [
  {
    id: "s1",
    kind: "statement",
    lines: [
      "The team is busy. There's a strategy.",
      "But progress feels slower than it should.",
    ],
  },
  {
    id: "s2",
    kind: "list",
    lines: [
      "Priorities keep shifting.",
      "Decisions get revisited.",
      "Teams aren't fully aligned.",
      "Customers aren't adopting like you expected.",
    ],
  },
  {
    id: "s3",
    kind: "statement",
    lines: ["That's not an effort problem.", "It's a clarity problem."],
    emphasis: true,
    callout: true,
    accentLineIndex: 1,
  },
  {
    id: "s4",
    kind: "statement",
    lines: [
      "Most teams don't struggle because they lack strategy.",
      "They struggle because their strategy isn't usable.",
    ],
  },
  {
    id: "s5",
    kind: "list",
    lines: [
      "They debate instead of decide,",
      "They hedge instead of commit,",
      "They build without knowing if it will work.",
    ],
  },
  {
    id: "s6",
    kind: "statement",
    lines: [
      "You need a system that helps you decide what to do next.",
      "And keeps working as things change.",
    ],
    emphasis: true,
    finalCallout: true,
    accentLineIndex: 0,
  },
];

export function ProblemSequence() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    return () => media.removeEventListener("change", updateMotion);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const update = () => {
      const root = shellRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const scrollLength = rect.height - window.innerHeight;
      if (scrollLength <= 0) {
        setProgress(0);
        return;
      }

      const scrolled = Math.min(scrollLength, Math.max(0, -rect.top));
      setProgress(scrolled / scrollLength);
    };

    let rafId = 0;
    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(() => {
        update();
        rafId = 0;
      });
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <div className="problem-sequence reduced-motion">
        <div className="problem-sequence-inner">
          <div className="sequence-stage">
            {steps.map((step) => (
              <article
                key={step.id}
                className={`sequence-card is-active ${step.emphasis ? "is-emphasis" : ""} ${step.callout ? "is-callout" : ""} ${step.finalCallout ? "is-final-callout" : ""}`}
              >
                <div className="sequence-lines">
                  {step.lines.map((line, lineIndex) => (
                    <p
                      key={line}
                      className={`sequence-line ${step.accentLineIndex === lineIndex ? "is-accent" : ""}`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={shellRef} className="problem-sequence">
      <div className="problem-sequence-inner">
        <div className="sequence-stage">
          {steps.map((step, index) => {
            const count = steps.length;
            const target = count > 1 ? index / (count - 1) : 0;
            const distance = (progress - target) * (count - 1);
            const absDistance = Math.abs(distance);
            const focus = Math.max(0, 1 - absDistance * 1.5);
            const isActive = absDistance < 0.44;
            const opacity = absDistance > 0.82 ? 0 : 0.04 + focus * 0.96;
            const yShift = distance * -44;
            const scale = 1 - Math.min(0.08, absDistance * 0.08);

            return (
              <article
                key={step.id}
                className={`sequence-card ${isActive ? "is-active" : ""} ${step.emphasis ? "is-emphasis" : ""} ${step.callout ? "is-callout" : ""} ${step.finalCallout ? "is-final-callout" : ""}`}
                style={{
                  opacity,
                  transform: `translateY(${yShift}px) scale(${scale})`,
                  zIndex: isActive ? 20 : Math.max(1, 10 - Math.round(absDistance * 10)),
                }}
                aria-hidden={!isActive && opacity < 0.18}
              >
                <div className="sequence-lines">
                  {step.lines.map((line, lineIndex) => (
                    <p
                      key={line}
                      className={`sequence-line ${step.accentLineIndex === lineIndex ? "is-accent" : ""}`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
