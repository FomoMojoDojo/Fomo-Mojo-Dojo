import Image from "next/image";

export function HeroMapVideo() {
  return (
    <Image
      src="/mojomap/hero-top.jpeg"
      width={4032}
      height={2268}
      className="hero-map-video"
      alt="MojoMap screen showing current reality and strategy journey map"
      priority
      sizes="(max-width: 900px) 100vw, 42rem"
    />
  );
}
