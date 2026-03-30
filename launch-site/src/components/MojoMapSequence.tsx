"use client";

import { useEffect, useRef, useState } from "react";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

type SequenceStep = {
  id: string;
  lines: string[];
  finalCallout?: boolean;
  accentLineIndex?: number;
};

const steps: SequenceStep[] = [
  {
    id: "m1",
    lines: ["Most companies track what happened."],
  },
  {
    id: "m2",
    lines: ["Dashboards."],
  },
  {
    id: "m3",
    lines: ["Reports."],
  },
  {
    id: "m4",
    lines: ["Metrics."],
  },
  {
    id: "m5",
    lines: ["A map shows you where to go."],
    finalCallout: true,
  },
];

export function MojoMapSequence() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const isMobileRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const mobileActiveIndexRef = useRef(0);
  const mobileInitRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const [isInView, setIsInView] = useState(false);

  const getSequenceProgress = (value: number, count: number) => clamp01((value - 0.07) / 0.86) * (count - 1);

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
      const nextProgress = isMobileRef.current ? Math.round(rawProgress * 120) / 120 : rawProgress;
      const epsilon = isMobileRef.current ? 0.02 : 0.003;
      setProgress((current) => (Math.abs(current - nextProgress) < epsilon ? current : nextProgress));
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
  }, [reducedMotion, isInView]);

  useEffect(() => {
    if (!mobileMode) return;
    const count = steps.length;
    const sequenceProgress = getSequenceProgress(progress, count);
    let next = mobileActiveIndexRef.current;

    while (next < count - 1 && sequenceProgress >= next + 0.62) next += 1;
    while (next > 0 && sequenceProgress <= next - 0.62) next -= 1;

    if (next !== mobileActiveIndexRef.current) {
      mobileActiveIndexRef.current = next;
      setMobileActiveIndex(next);
    }
  }, [mobileMode, progress]);

  useEffect(() => {
    if (!mobileMode) {
      mobileInitRef.current = false;
      return;
    }
    if (mobileInitRef.current) return;
    const initial = Math.round(getSequenceProgress(progress, steps.length));
    mobileActiveIndexRef.current = initial;
    setMobileActiveIndex(initial);
    mobileInitRef.current = true;
  }, [mobileMode, progress]);

  if (mobileMode) {
    const activeStep = steps[Math.max(0, Math.min(steps.length - 1, mobileActiveIndex))];

    return (
      <div ref={shellRef} className="map-sequence mobile-sequence">
        <div className="problem-sequence-inner">
          <div className="sequence-stage">
            <article
              key={activeStep.id}
              className={`sequence-card map-sequence-card mobile-swap-card is-active ${activeStep.finalCallout ? "is-final-callout" : ""}`}
              style={{ opacity: 1, transform: "translateY(0) scale(1)", zIndex: 20 }}
            >
              <div className="sequence-lines">
                {activeStep.lines.map((line, lineIndex) => (
                  <p
                    key={line}
                    className={`sequence-line map-sequence-line ${activeStep.accentLineIndex === lineIndex ? "is-accent" : ""}`}
                  >
                    {line}
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
      <div className="map-sequence reduced-motion">
        <div className="problem-sequence-inner">
          <div className="sequence-stage">
            {steps.map((step) => (
              <article
                key={step.id}
                className={`sequence-card map-sequence-card is-active ${step.finalCallout ? "is-final-callout" : ""}`}
              >
                <div className="sequence-lines">
                  {step.lines.map((line, lineIndex) => (
                    <p
                      key={line}
                      className={`sequence-line map-sequence-line ${step.accentLineIndex === lineIndex ? "is-accent" : ""}`}
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
    <div ref={shellRef} className="map-sequence">
      <div className="problem-sequence-inner">
        <div className="sequence-stage">
          {steps.map((step, index) => {
            const count = steps.length;
            // Delay the sequence start slightly so the first line can appear and hold.
            const sequenceProgress = getSequenceProgress(progress, count);
            const nearestIndex = mobileMode ? mobileActiveIndex : Math.round(sequenceProgress);
            const isNearest = nearestIndex === index;
            let opacity = isNearest ? 1 : 0;
            let yShift = 0;
            let scale = 1;
            let isActive = isNearest;

            if (!mobileMode && index === 0) {
              // Fade in the first line early, before dashboards can take over.
              const intro = clamp01((progress - 0.01) / 0.05);
              opacity *= intro;
              yShift += (1 - intro) * 18;
            }

            if (index === count - 1) {
              if (progress >= 0.9) {
                opacity = 1;
                yShift = 0;
                scale = 1;
                isActive = true;
              }
            }

            return (
              <article
                key={step.id}
                className={`sequence-card map-sequence-card ${isActive ? "is-active" : ""} ${step.finalCallout ? "is-final-callout" : ""}`}
                style={{
                  opacity,
                  transform: `translateY(${yShift}px) scale(${scale})`,
                  zIndex: isActive ? 20 : 8,
                }}
                aria-hidden={!isActive && opacity < 0.18}
              >
                <div className="sequence-lines">
                  {step.lines.map((line, lineIndex) => (
                    <p
                      key={line}
                      className={`sequence-line map-sequence-line ${step.accentLineIndex === lineIndex ? "is-accent" : ""}`}
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
