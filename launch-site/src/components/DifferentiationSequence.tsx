"use client";

import { useEffect, useRef, useState } from "react";

type SequenceTone = "orange" | "list";

type SequenceStep = {
  id: string;
  tone: SequenceTone;
  lines: string[];
};

const steps: SequenceStep[] = [
  {
    id: "d4",
    tone: "list",
    lines: ["Not presentations."],
  },
  {
    id: "d5",
    tone: "list",
    lines: ["Not theory."],
  },
  {
    id: "d6",
    tone: "list",
    lines: ["Not one-off workshops."],
  },
  {
    id: "d7",
    tone: "orange",
    lines: ["A shared map for making better decisions, every week."],
  },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function DifferentiationSequence() {
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

  const getSequenceProgress = (value: number, count: number) => clamp01((value - 0.54) / 0.46) * (count - 1);

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
    const showWhisper = progress >= 0.17;
    const showOrange = progress >= 0.27;
    const showList = progress >= 0.56;
    const activeStep = steps[Math.max(0, Math.min(steps.length - 1, mobileActiveIndex))];

    return (
      <div ref={shellRef} className="diff-sequence mobile-sequence">
        <div className="problem-sequence-inner">
          <div className="sequence-stage">
            {!showList ? (
              <article className="sequence-card diff-sequence-card is-active diff-intro-card mobile-swap-card">
                <div className="sequence-lines diff-sequence-lines">
                  <p
                    className="sequence-line diff-sequence-line line-tone-headline"
                    style={{ color: showWhisper ? "rgba(121, 134, 154, 1)" : "rgba(245, 248, 255, 0.99)" }}
                  >
                    This isn't consulting
                  </p>
                  {showWhisper ? (
                    <p className="sequence-line diff-sequence-line line-tone-whisper-white">
                      We don't hand you a deck and disappear.
                    </p>
                  ) : null}
                  {showOrange ? (
                    <p
                      className="sequence-line diff-sequence-line line-tone-orange"
                      style={{ color: "#ff9a4e", textShadow: "0 0 14px rgba(255, 154, 78, 0.18)" }}
                    >
                      We build a system your team actually uses.
                    </p>
                  ) : null}
                </div>
              </article>
            ) : (
              <article
                key={activeStep.id}
                className={`sequence-card diff-sequence-card diff-tone-${activeStep.tone} is-active mobile-swap-card`}
                style={{ opacity: 1, transform: "translateY(0) scale(1)", zIndex: 20 }}
              >
                <div className="sequence-lines diff-sequence-lines">
                  {activeStep.lines.map((line) => (
                    <p key={line} className={`sequence-line diff-sequence-line line-tone-${activeStep.tone}`}>
                      {line}
                    </p>
                  ))}
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (reducedMotion) {
    return (
      <div className="diff-sequence reduced-motion">
        <div className="problem-sequence-inner">
          <div className="sequence-stage">
            <article className="sequence-card diff-sequence-card is-active diff-intro-card">
              <div className="sequence-lines diff-sequence-lines">
                <p className="sequence-line diff-sequence-line line-tone-headline-dim">This isn't consulting</p>
                <p className="sequence-line diff-sequence-line line-tone-whisper-white">
                  We don't hand you a deck and disappear.
                </p>
                <p
                  className="sequence-line diff-sequence-line line-tone-orange"
                  style={{ color: "#ff9a4e", textShadow: "0 0 14px rgba(255, 154, 78, 0.18)" }}
                >
                  We build a system your team actually uses.
                </p>
              </div>
            </article>
            {steps.map((step) => (
              <article
                key={step.id}
                className={`sequence-card diff-sequence-card diff-tone-${step.tone} is-active`}
              >
                <div className="sequence-lines diff-sequence-lines">
                  {step.lines.map((line) => (
                    <p key={line} className={`sequence-line diff-sequence-line line-tone-${step.tone}`}>
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
    <div ref={shellRef} className="diff-sequence">
      <div className="problem-sequence-inner">
        <div className="sequence-stage">
          {(() => {
            const gray = { r: 121, g: 134, b: 154 };
            const white = { r: 245, g: 248, b: 255 };
            const toGray = mobileMode ? (progress >= 0.14 ? 1 : 0) : clamp01((progress - 0.08) / 0.14);
            const whisperIn = mobileMode ? (progress >= 0.17 ? 1 : 0) : clamp01((progress - 0.14) / 0.12);
            const orangeIn = mobileMode ? (progress >= 0.27 ? 1 : 0) : clamp01((progress - 0.23) / 0.11);
            const whisperToGray = mobileMode ? (progress >= 0.27 ? 1 : 0) : clamp01((progress - 0.22) / 0.12);
            const introExit = mobileMode ? (progress >= 0.56 ? 1 : 0) : clamp01((progress - 0.46) / 0.12);
            const introOpacity = 1 - introExit;
            const headlineColor = {
              r: Math.round(white.r + (gray.r - white.r) * toGray),
              g: Math.round(white.g + (gray.g - white.g) * toGray),
              b: Math.round(white.b + (gray.b - white.b) * toGray),
            };
            const whisperGray = { r: 132, g: 146, b: 166 };
            const whisperColor = {
              r: Math.round(white.r + (whisperGray.r - white.r) * whisperToGray),
              g: Math.round(white.g + (whisperGray.g - white.g) * whisperToGray),
              b: Math.round(white.b + (whisperGray.b - white.b) * whisperToGray),
            };

            return (
              <article
                className="sequence-card diff-sequence-card is-active diff-intro-card"
                style={{
                  opacity: introOpacity,
                  transform: `translateY(${-16 * introExit}px) scale(${1 - introExit * 0.02})`,
                  zIndex: 24,
                }}
                aria-hidden={introOpacity < 0.04}
              >
                <div className="sequence-lines diff-sequence-lines">
                  <p
                    className="sequence-line diff-sequence-line line-tone-headline"
                    style={{ color: `rgb(${headlineColor.r}, ${headlineColor.g}, ${headlineColor.b})` }}
                  >
                    This isn't consulting
                  </p>
                  <p
                    className="sequence-line diff-sequence-line line-tone-whisper-white"
                    style={{
                      opacity: whisperIn * (1 - introExit * 0.68),
                      color: `rgb(${whisperColor.r}, ${whisperColor.g}, ${whisperColor.b})`,
                    }}
                  >
                    We don't hand you a deck and disappear.
                  </p>
                  <p
                    className="sequence-line diff-sequence-line line-tone-orange"
                    style={{
                      opacity: orangeIn * (1 - introExit * 0.38),
                      color: "#ff9a4e",
                      textShadow: "0 0 14px rgba(255, 154, 78, 0.18)",
                    }}
                  >
                    We build a system your team actually uses.
                  </p>
                </div>
              </article>
            );
          })()}

          {steps.map((step, index) => {
            const count = steps.length;
            const sequenceProgress = getSequenceProgress(progress, count);
            const nearestIndex = mobileMode ? mobileActiveIndex : Math.round(sequenceProgress);
            const isActive = nearestIndex === index;
            const enterGate = mobileMode ? (progress >= 0.6 ? 1 : 0) : clamp01((progress - 0.52) / 0.09);
            const opacity = isActive ? enterGate : 0;
            const yShift = 0;
            const scale = 1;

            return (
              <article
                key={step.id}
                className={`sequence-card diff-sequence-card diff-tone-${step.tone} ${isActive ? "is-active" : ""}`}
                style={{
                  opacity,
                  transform: `translateY(${yShift}px) scale(${scale})`,
                  zIndex: isActive ? 20 : 8,
                }}
                aria-hidden={!isActive && opacity < 0.18}
              >
                <div className="sequence-lines diff-sequence-lines">
                  {step.lines.map((line) => (
                    <p key={line} className={`sequence-line diff-sequence-line line-tone-${step.tone}`}>
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
