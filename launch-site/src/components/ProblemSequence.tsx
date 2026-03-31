"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type SequenceStep = {
  id: string;
  kind: "statement" | "list";
  lines: string[];
  emphasis?: boolean;
  callout?: boolean;
  accentLineIndex?: number;
  delayedLineIndex?: number;
  dimLineIndex?: number;
  carryPreviousAsDim?: boolean;
  finalCallout?: boolean;
};

const steps: SequenceStep[] = [
  {
    id: "s0",
    kind: "statement",
    lines: ["You're working hard.", "But something isn't clicking."],
  },
  {
    id: "s1",
    kind: "statement",
    lines: [
      "The team is busy. There's a strategy.",
      "But progress feels slower than it should.",
    ],
  },
  {
    id: "s2a",
    kind: "statement",
    lines: ["Priorities keep shifting."],
  },
  {
    id: "s2b",
    kind: "statement",
    lines: ["Decisions get revisited."],
  },
  {
    id: "s2c",
    kind: "statement",
    lines: ["Teams aren't fully aligned."],
  },
  {
    id: "s2d",
    kind: "statement",
    lines: ["Customers aren't adopting like you expected."],
  },
  {
    id: "s3",
    kind: "statement",
    lines: ["That's not an effort problem.", "It's a clarity problem."],
    emphasis: true,
    callout: true,
    accentLineIndex: 1,
    delayedLineIndex: 1,
  },
  {
    id: "s4a",
    kind: "statement",
    lines: ["Most teams don't struggle because they lack strategy."],
  },
  {
    id: "s4b",
    kind: "statement",
    lines: ["They struggle because their strategy isn't usable."],
    accentLineIndex: 0,
    carryPreviousAsDim: true,
  },
  {
    id: "s5a",
    kind: "statement",
    lines: ["They debate instead of decide,"],
  },
  {
    id: "s5b",
    kind: "statement",
    lines: ["They hedge instead of commit,"],
  },
  {
    id: "s5c",
    kind: "statement",
    lines: ["They build without knowing if it will work."],
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
    delayedLineIndex: 1,
  },
];

export function ProblemSequence() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const isMobileRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const mobileActiveIndexRef = useRef(0);
  const mobileInitRef = useRef(false);
  const clarityHoldUntilRef = useRef(0);
  const systemHoldUntilRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const strategyLeadIndex = steps.findIndex((step) => step.id === "s4a");
  const strategyFollowIndex = steps.findIndex((step) => step.id === "s4b");
  const clarityStepIndex = steps.findIndex((step) => step.id === "s3");
  const systemStepIndex = steps.findIndex((step) => step.id === "s6");
  const clarityHoldDurationMs = 1800;
  const systemHoldDurationMs = 1800;
  const getSequenceProgress = useCallback((value: number, count: number) => clamp01((value - 0.07) / 0.86) * (count - 1), []);
  const getHoldAwareSequenceProgress = useCallback((value: number, count: number) => {
    const raw = getSequenceProgress(value, count);
    const now = Date.now();
    const evaluateHold = (stepIndex: number, holdDurationMs: number, holdRef: { current: number }) => {
      if (stepIndex < 0) return null;
      const inWindow = raw >= stepIndex && raw < stepIndex + 1;
      if (inWindow && now >= holdRef.current) {
        holdRef.current = now + holdDurationMs;
      }
      if (raw < stepIndex) {
        holdRef.current = 0;
      }
      if (now < holdRef.current && raw >= stepIndex) {
        return stepIndex;
      }
      return null;
    };

    const clarityHold = evaluateHold(clarityStepIndex, clarityHoldDurationMs, clarityHoldUntilRef);
    const systemHold = evaluateHold(systemStepIndex, systemHoldDurationMs, systemHoldUntilRef);

    const heldStep = Math.max(clarityHold ?? -1, systemHold ?? -1);
    if (heldStep >= 0) return heldStep;
    return raw;
  }, [clarityStepIndex, clarityHoldDurationMs, getSequenceProgress, systemStepIndex, systemHoldDurationMs]);
  const renderLines = (step: SequenceStep, index: number) => {
    const output: { key: string; text: string; accent: boolean; dim: boolean; delayed: boolean }[] = [];
    if (step.carryPreviousAsDim && index > 0) {
      const previousLine = steps[index - 1]?.lines?.[0];
      if (previousLine) {
        output.push({
          key: `carry-${step.id}`,
          text: previousLine,
          accent: false,
          dim: true,
          delayed: false,
        });
      }
    }
    step.lines.forEach((line, lineIndex) => {
      output.push({
        key: `${step.id}-${lineIndex}-${line}`,
        text: line,
        accent: step.accentLineIndex === lineIndex,
        dim: step.dimLineIndex === lineIndex,
        delayed: step.delayedLineIndex === lineIndex,
      });
    });
    return output;
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileMedia = window.matchMedia("(max-width: 900px)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updateMobile = () => {
      isMobileRef.current = mobileMedia.matches;
      setMobileMode(mobileMedia.matches);
    };
    updateMotion();
    updateMobile();
    viewportHeightRef.current = window.innerHeight;
    media.addEventListener("change", updateMotion);
    mobileMedia.addEventListener("change", updateMobile);
    return () => {
      media.removeEventListener("change", updateMotion);
      mobileMedia.removeEventListener("change", updateMobile);
    };
  }, []);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsInView(Boolean(entry?.isIntersecting));
      },
      {
        root: null,
        rootMargin: "140% 0px 140% 0px",
        threshold: 0,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || !isInView) return;

    const update = () => {
      const root = shellRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const viewportHeight = viewportHeightRef.current || window.innerHeight;
      const scrollLength = rect.height - viewportHeight;
      if (scrollLength <= 0) {
        setProgress(0);
        return;
      }

      const scrolled = Math.min(scrollLength, Math.max(0, -rect.top));
      const rawProgress = scrolled / scrollLength;
      if (isMobileRef.current) {
        const count = steps.length;
        const sequenceProgress = getHoldAwareSequenceProgress(rawProgress, count);
        let next = mobileActiveIndexRef.current;

        while (next < count - 1 && sequenceProgress >= next + 0.7) next += 1;
        while (next > 0 && sequenceProgress <= next - 0.7) next -= 1;

        if (next !== mobileActiveIndexRef.current) {
          mobileActiveIndexRef.current = next;
          setMobileActiveIndex(next);
        }
        return;
      }

      const epsilon = 0.003;
      setProgress((current) => (Math.abs(current - rawProgress) < epsilon ? current : rawProgress));
    };

    let rafId = 0;
    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(() => {
        update();
        rafId = 0;
      });
    };

    const onResize = () => {
      const nextHeight = window.innerHeight;
      const currentHeight = viewportHeightRef.current || nextHeight;
      if (!isMobileRef.current || Math.abs(nextHeight - currentHeight) > 96) {
        viewportHeightRef.current = nextHeight;
        onScroll();
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
    };
  }, [getHoldAwareSequenceProgress, reducedMotion, isInView]);

  useEffect(() => {
    if (!mobileMode) {
      mobileInitRef.current = false;
      return;
    }
    if (mobileInitRef.current) return;
    const initial = 0;
    mobileActiveIndexRef.current = initial;
    setMobileActiveIndex(initial);
    mobileInitRef.current = true;
  }, [mobileMode]);

  if (mobileMode) {
    const activeStep = steps[Math.max(0, Math.min(steps.length - 1, mobileActiveIndex))];

    return (
      <div ref={shellRef} className="problem-sequence mobile-sequence">
        <div className="problem-sequence-inner">
          <div className="sequence-stage">
            <article
              key={activeStep.id}
              className={`sequence-card mobile-swap-card is-active ${activeStep.emphasis ? "is-emphasis" : ""} ${activeStep.callout ? "is-callout" : ""} ${activeStep.finalCallout ? "is-final-callout" : ""}`}
              style={{ opacity: 1, transform: "translateY(0) scale(1)", zIndex: 20 }}
            >
              <div className="sequence-lines">
                {renderLines(activeStep, mobileActiveIndex).map((line) => (
                  <p
                    key={line.key}
                    className={`sequence-line ${line.accent ? "is-accent" : ""} ${line.dim ? "is-dim" : ""} ${line.delayed ? "is-delayed" : ""}`}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            </article>
          </div>
        </div>
      </div>
    );
  }

  if (reducedMotion) {
    return (
      <div className="problem-sequence reduced-motion">
        <div className="problem-sequence-inner">
          <div className="sequence-stage">
            {steps.map((step, index) => (
              <article
                key={step.id}
                className={`sequence-card is-active ${step.emphasis ? "is-emphasis" : ""} ${step.callout ? "is-callout" : ""} ${step.finalCallout ? "is-final-callout" : ""}`}
              >
                <div className="sequence-lines">
                  {renderLines(step, index).map((line) => (
                    <p
                      key={line.key}
                      className={`sequence-line ${line.accent ? "is-accent" : ""} ${line.dim ? "is-dim" : ""} ${line.delayed ? "is-delayed" : ""}`}
                    >
                      {line.text}
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
          {(() => {
            const sequenceProgress = getHoldAwareSequenceProgress(progress, steps.length);
            const nearestIndex = Math.round(sequenceProgress);
            const hasStrategyPair = strategyLeadIndex >= 0 && strategyFollowIndex === strategyLeadIndex + 1;
            const strategyBlend = hasStrategyPair ? clamp01(sequenceProgress - strategyLeadIndex) : 0;
            const strategyLeadText = hasStrategyPair ? steps[strategyLeadIndex]?.lines?.[0] ?? "" : "";
            const strategyFollowText = hasStrategyPair ? steps[strategyFollowIndex]?.lines?.[0] ?? "" : "";

            return steps.map((step, index) => {
              if (hasStrategyPair && index === strategyFollowIndex) {
                return null;
              }

              if (hasStrategyPair && index === strategyLeadIndex) {
                const pairActive = nearestIndex === strategyLeadIndex || nearestIndex === strategyFollowIndex;
                const white = { r: 245, g: 248, b: 255 };
                const gray = { r: 121, g: 134, b: 154 };
                const mixed = {
                  r: Math.round(white.r + (gray.r - white.r) * strategyBlend),
                  g: Math.round(white.g + (gray.g - white.g) * strategyBlend),
                  b: Math.round(white.b + (gray.b - white.b) * strategyBlend),
                };

                return (
                  <article
                    key="strategy-pair"
                    className="sequence-card is-active"
                    style={{
                      opacity: pairActive ? 1 : 0,
                      transform: "translateY(0) scale(1)",
                      zIndex: pairActive ? 20 : 8,
                    }}
                    aria-hidden={!pairActive}
                  >
                    <div className="sequence-lines">
                      <p className="sequence-line" style={{ color: `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})` }}>
                        {strategyLeadText}
                      </p>
                      <p className="sequence-line is-accent" style={{ opacity: strategyBlend }}>
                        {strategyFollowText}
                      </p>
                    </div>
                  </article>
                );
              }

              const isNearest = nearestIndex === index;
              const isActive = isNearest;
              const opacity = isNearest ? 1 : 0;
              const yShift = isNearest ? 0 : (sequenceProgress - index) * -18;
              const scale = 1;

              return (
                <article
                  key={step.id}
                  className={`sequence-card ${isActive ? "is-active" : ""} ${step.emphasis ? "is-emphasis" : ""} ${step.callout ? "is-callout" : ""} ${step.finalCallout ? "is-final-callout" : ""}`}
                  style={{
                    opacity,
                    transform: `translateY(${yShift}px) scale(${scale})`,
                    zIndex: isActive ? 20 : 8,
                  }}
                  aria-hidden={!isActive && opacity < 0.18}
                >
                  <div className="sequence-lines">
                    {renderLines(step, index).map((line) => (
                      <p
                        key={line.key}
                        className={`sequence-line ${line.accent ? "is-accent" : ""} ${line.dim ? "is-dim" : ""} ${line.delayed ? "is-delayed" : ""}`}
                      >
                        {line.text}
                      </p>
                    ))}
                  </div>
                </article>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
