const readEnv = (value: string | undefined, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

export const siteConfig = {
  companyName: "FomoMojoDojo",
  productName: "MojoMap™",
  cta: {
    primaryLabel: "See what's blocking your momentum",
    secondaryLabel: "Book a 45-min Mojo Diagnostic",
    primaryUrl: readEnv(
      process.env.NEXT_PUBLIC_PRIMARY_CTA_URL,
      "/quiz",
    ),
    secondaryUrl: readEnv(
      process.env.NEXT_PUBLIC_SECONDARY_CTA_URL,
      "https://calendly.com/your-link/mojo-diagnostic",
    ),
  },
  social: {
    linkedIn: readEnv(process.env.NEXT_PUBLIC_LINKEDIN_URL, "https://example.com/linkedin"),
    medium: readEnv(process.env.NEXT_PUBLIC_MEDIUM_URL, "https://example.com/medium"),
    substack: readEnv(process.env.NEXT_PUBLIC_SUBSTACK_URL, "https://example.com/substack"),
    tiktok: readEnv(process.env.NEXT_PUBLIC_TIKTOK_URL, "https://example.com/tiktok"),
    youtube: readEnv(process.env.NEXT_PUBLIC_YOUTUBE_URL, "https://example.com/youtube"),
    bluesky: readEnv(process.env.NEXT_PUBLIC_BLUESKY_URL, "https://example.com/bluesky"),
  },
  legal: {
    copyright: "©2026 Fomo Mojo Dojo LLC",
    trademarks: "MojoMap™ | MojoSignal™ | The MOJO Method™",
  },
} as const;

export type SiteConfig = typeof siteConfig;
