"use client";

import { useEffect, useMemo, useState } from "react";

type LegalKey = "privacy" | "terms" | "california";

type LegalDoc = {
  label: string;
  title: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
  }>;
};

type LegalOverlayProps = {
  variant?: "full" | "compact";
};

const legalDocs: Record<LegalKey, LegalDoc> = {
  privacy: {
    label: "Privacy Policy",
    title: "Privacy Policy",
    sections: [
      {
        heading: "What We Collect",
        paragraphs: [
          "We may collect contact details, company details, submitted responses, usage analytics, and communications you send us.",
          "We use this information to run the quiz, schedule calls, deliver MojoMap materials, improve our services, and communicate with you.",
        ],
      },
      {
        heading: "How We Use and Share Data",
        paragraphs: [
          "We may share data with service providers that help us host, analyze, schedule, communicate, and secure our systems.",
          "We do not sell personal information for money. If our practices change, we will update this policy and provide required controls.",
        ],
      },
      {
        heading: "Your Choices",
        paragraphs: [
          "You may request access, correction, or deletion of personal information, subject to legal and operational requirements.",
          "For privacy requests, contact us at legal@fomomojodojo.com.",
        ],
      },
    ],
  },
  terms: {
    label: "Terms of Use",
    title: "Terms of Use",
    sections: [
      {
        heading: "Use of This Site",
        paragraphs: [
          "By using this site, you agree to use it lawfully and in a way that does not interfere with our operations or other users.",
          "All content, marks, methods, and materials on this site are owned by or licensed to Fomo Mojo Dojo LLC unless otherwise stated.",
        ],
      },
      {
        heading: "No Professional Advice",
        paragraphs: [
          "Site content is provided for informational purposes and does not constitute legal, financial, tax, or other regulated professional advice.",
          "Any strategic recommendations are provided as part of our services and should be evaluated for your context.",
        ],
      },
      {
        heading: "Limitations",
        paragraphs: [
          "We provide this site and its content on an as-is basis and do not guarantee uninterrupted availability or specific outcomes.",
          "To the fullest extent allowed by law, Fomo Mojo Dojo LLC is not liable for indirect or consequential damages arising from site use.",
        ],
      },
    ],
  },
  california: {
    label: "California Privacy Notice",
    title: "California Privacy Notice",
    sections: [
      {
        heading: "California Rights",
        paragraphs: [
          "California residents may request to know, correct, delete, or obtain a portable copy of personal information, and may request limits where applicable.",
          "You may designate an authorized agent to submit requests on your behalf, as permitted by California law.",
        ],
      },
      {
        heading: "Notice at Collection",
        paragraphs: [
          "We collect only information reasonably necessary for the business purposes described in our Privacy Policy.",
          "We retain personal information only as long as needed for operations, legal obligations, dispute resolution, and security.",
        ],
      },
      {
        heading: "Submitting Requests",
        paragraphs: [
          "To submit a California privacy request, email legal@fomomojodojo.com with the subject line 'California Privacy Request'.",
          "We will verify your request consistent with applicable law before processing sensitive actions.",
        ],
      },
    ],
  },
};

export function LegalOverlay({ variant = "full" }: LegalOverlayProps) {
  const [active, setActive] = useState<LegalKey | null>(null);

  const doc = useMemo(() => (active ? legalDocs[active] : null), [active]);
  const linkKeys: LegalKey[] = variant === "compact" ? ["terms", "privacy", "california"] : ["privacy", "terms", "california"];

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  return (
    <>
      <div className={`legal-link-row ${variant === "compact" ? "legal-link-row-compact" : ""}`.trim()}>
        {linkKeys.map((key) => (
          <button
            key={key}
            type="button"
            className={`legal-link-btn ${variant === "compact" ? "legal-link-btn-compact" : ""}`.trim()}
            onClick={() => setActive(key)}
          >
            {variant === "compact" && key === "terms"
              ? "Legal"
              : variant === "compact" && key === "privacy"
                ? "Privacy"
                : variant === "compact" && key === "california"
                  ? "California"
                  : legalDocs[key].label}
          </button>
        ))}
      </div>

      {doc ? (
        <div className="legal-overlay" role="dialog" aria-modal="true" aria-label={doc.title} onClick={() => setActive(null)}>
          <div className="legal-modal" onClick={(event) => event.stopPropagation()}>
            <div className="legal-modal-head">
              <h3 className="legal-modal-title">{doc.title}</h3>
              <button type="button" className="legal-close-btn" onClick={() => setActive(null)} aria-label="Close legal overlay">
                Close
              </button>
            </div>
            <p className="legal-updated">Last updated: March 27, 2026</p>
            <div className="legal-modal-body">
              {doc.sections.map((section) => (
                <section key={section.heading} className="legal-section">
                  <h4 className="legal-section-title">{section.heading}</h4>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="legal-paragraph">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
