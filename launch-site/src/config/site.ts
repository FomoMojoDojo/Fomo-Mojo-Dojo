const readEnv = (value: string | undefined, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

export const siteConfig = {
  companyName: "FomoMojoDojo",
  productName: "MojoMap™",
  cta: {
    primaryLabel: "See what's blocking your momentum (3 min)",
    secondaryLabel: "Book a 45-min Mojo Diagnostic",
    primaryUrl: readEnv(
      process.env.NEXT_PUBLIC_PRIMARY_CTA_URL,
      "https://example.com/mojomap-intake",
    ),
    secondaryUrl: readEnv(
      process.env.NEXT_PUBLIC_SECONDARY_CTA_URL,
      "https://example.com/mojo-diagnostic",
    ),
  },
  social: {
    linkedIn: readEnv(process.env.NEXT_PUBLIC_LINKEDIN_URL, "https://example.com/linkedin"),
    substack: readEnv(process.env.NEXT_PUBLIC_SUBSTACK_URL, "https://example.com/substack"),
    youtube: readEnv(process.env.NEXT_PUBLIC_YOUTUBE_URL, "https://example.com/youtube"),
  },
  legal: {
    copyright: "©2026 FomoMojoDojo",
    trademarks: "MojoMap™ | MojoSignal™ | The MOJO Method™",
  },
} as const;

export type SiteConfig = typeof siteConfig;
