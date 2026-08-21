// Signed source-category map (2026-08-21): the single authority for host → kind, used by both the
// scorer's coverage_breadth and beat 8's lever sub-line. These pin the classifier and the sub-line
// shape so neither can drift.
import { describe, it, expect } from "vitest";
import { categorizeHost, hostFromUrl, coverageSubline, type SourceCategory } from "./sourceCategories";

describe("categorizeHost — signed table", () => {
  it("client's own site → Your own site (excluded from breadth)", () => {
    expect(categorizeHost("https://www.cafebarra.com/")).toBe("Your own site");
    expect(categorizeHost("https://order-cafebarra.square.site/menu")).toBe("Your own site");
  });
  it("review platforms / listings → Reviews & listings", () => {
    expect(categorizeHost("https://www.yelp.com/biz/cafe-barra")).toBe("Reviews & listings");
    expect(categorizeHost("https://joe.coffee/locations/ca/burbank/x")).toBe("Reviews & listings");
    expect(categorizeHost("https://wineandeggs.com/products/cafe-barra")).toBe("Reviews & listings");
  });
  it("instagram → Social", () => {
    expect(categorizeHost("https://www.instagram.com/lefrenchrooster.us/")).toBe("Social");
  });
  it("directory listings → Directories", () => {
    expect(categorizeHost("https://www.chamberofcommerce.com/business-directory/x")).toBe("Directories");
    expect(categorizeHost("https://restaurants-california.nears.me/california/burbank")).toBe("Directories");
  });
  it("partner / competitor / junk sites → Other (excluded), never defaulted to Directories", () => {
    expect(categorizeHost("https://www.lefrenchrooster.com/about-us/")).toBe("Other"); // signed
    expect(categorizeHost("https://www.facebook.com/2008/fbml")).toBe("Other");
    expect(categorizeHost("https://izotecoffee.com/")).toBe("Other");
  });
  it("unmatched host → Other; empty/null → Other", () => {
    expect(categorizeHost("https://some-unknown-host.example/x")).toBe("Other");
    expect(categorizeHost(null)).toBe("Other");
    expect(categorizeHost("")).toBe("Other");
  });
  it("subdomains resolve to the listed base (m.yelp.com → yelp.com; any sub of instagram)", () => {
    expect(categorizeHost("https://m.yelp.com/c/la-east/coffeeroasteries")).toBe("Reviews & listings");
    expect(categorizeHost("https://foo.instagram.com/x")).toBe("Social");
    // never strips down to a bare TLD
    expect(categorizeHost("https://unknownthing.dev/x")).toBe("Other");
  });
  it("hostFromUrl strips scheme, www, path, port", () => {
    expect(hostFromUrl("https://www.Yelp.com:443/biz/x?y=1")).toBe("yelp.com");
    expect(hostFromUrl(null)).toBeNull();
  });
});

describe("coverageSubline — signed shape", () => {
  it("3 of 4 (CB2): present in canonical order + Missing clause", () => {
    const present: SourceCategory[] = ["Social", "Directories", "Reviews & listings"]; // unordered input
    expect(coverageSubline(present)).toBe(
      "3 of 4 outside source kinds represented: Reviews & listings, Social, Directories. Missing: Press & articles.",
    );
  });
  it("4 of 4: no Missing clause", () => {
    const present: SourceCategory[] = ["Reviews & listings", "Social", "Press & articles", "Directories"];
    expect(coverageSubline(present)).toBe(
      "4 of 4 outside source kinds represented: Reviews & listings, Social, Press & articles, Directories.",
    );
  });
  it("0 of 4: head + Missing all four", () => {
    expect(coverageSubline([])).toBe(
      "0 of 4 outside source kinds represented. Missing: Reviews & listings, Social, Press & articles, Directories.",
    );
  });
});
