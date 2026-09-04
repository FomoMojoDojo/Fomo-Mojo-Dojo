// LISTING EVIDENCE CLASS — client-visible strings, SIGNED (operator ruling 2026-09-04, shape (d)). One home,
// byte-exact, never inlined at a render site. A listing is rendered as a listing — never in quote marks, never
// as speech: eyebrow "Listed by {host}", body "{product}, {price}"; the price comes from the STRUCTURED field
// with its currency symbol, never from page text.
import type { FRListing } from "./types";

export const LISTING_STRINGS = {
  eyebrow: (host: string) => `Listed by ${host}`,
  body: (product: string, price: string | null) => (price ? `${product}, ${price}` : product),
} as const;

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$" };
/** "$22.00" for USD; "22.00 XXX" for an unknown currency; null when the listing carries no price. */
export function formatListingPrice(price: number | null, currency: string | null): string | null {
  if (price === null || !Number.isFinite(price)) return null;
  const amount = price.toFixed(2);
  const code = (currency ?? "").toUpperCase();
  if (SYMBOL[code]) return `${SYMBOL[code]}${amount}`;
  return code ? `${amount} ${code}` : amount;
}
export function listingBody(l: FRListing): string {
  return LISTING_STRINGS.body(l.productName, formatListingPrice(l.price, l.currency));
}
