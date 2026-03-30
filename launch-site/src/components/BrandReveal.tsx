"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export function BrandReveal() {
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const closePanel = useCallback(() => {
    setIsOpen(false);
    // Prevent focus-within from keeping the panel visible on touch devices.
    requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const node = shellRef.current;
      if (!node) return;
      if (!node.contains(event.target as Node)) {
        closePanel();
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };

    const onScroll = () => {
      closePanel();
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll);
    };
  }, [closePanel, isOpen]);

  return (
    <header ref={shellRef} className={`brand-reveal-shell ${isOpen ? "brand-open" : ""}`.trim()}>
      <div className="brand-reveal-panel" id="brand-reveal-panel" aria-hidden={!isOpen}>
        <button
          type="button"
          className="brand-panel-close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            closePanel();
          }}
          aria-label="Close panel"
        >
          Close
        </button>

        <article className="brand-column brand-column-fomo">
          <h3 className="brand-column-title">
            <span className="brand-wordmark brand-wordmark-fomo" aria-label="FOMO" />
            <span className="brand-column-subtitle">The Focus Killer</span>
          </h3>
          <p>
            Feeling pulled in every direction? That&apos;s FOMO. It&apos;s the anxiety that you&apos;re not working on
            the right thing — a symptom of unclear strategy. It kills focus and momentum.
          </p>
          <p>We cut through the noise and make what matters obvious.</p>
        </article>

        <article className="brand-column brand-column-mojo">
          <h3 className="brand-column-title">
            <span className="brand-wordmark brand-wordmark-mojo" aria-label="MOJO" />
            <span className="brand-column-subtitle">Your Unfair Advantage</span>
          </h3>
          <p>
            MOJO is what happens when your team has real clarity. You know where you&apos;re going, why it matters,
            and what to do next.
          </p>
          <p>That&apos;s when momentum kicks in.</p>
        </article>

        <article className="brand-column brand-column-dojo">
          <h3 className="brand-column-title">
            <span className="brand-wordmark brand-wordmark-dojo" aria-label="DOJO" />
            <span className="brand-column-subtitle">Your Path to Mastery</span>
          </h3>
          <p>
            The DOJO is how you get there. A system, not advice — designed to build the muscle for clear thinking and
            better decisions.
          </p>
          <p>So you don&apos;t need us forever.</p>
        </article>
      </div>

      <button
        type="button"
        className="brand-logo-link"
        aria-label={isOpen ? "Close FomoMojoDojo details" : "Open FomoMojoDojo details"}
        aria-expanded={isOpen}
        aria-controls="brand-reveal-panel"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="brand-logo-wrap" aria-hidden="true">
          <Image src="/fomomojodojo-logo-white.svg" alt="" className="brand-logo-base" width={121} height={112} priority />
          <span className="brand-logo-ramp" />
        </span>
      </button>
    </header>
  );
}
