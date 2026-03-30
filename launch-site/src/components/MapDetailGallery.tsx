"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type MapDetailItem = {
  title: string;
  body: string;
  image: {
    src: string;
    alt: string;
  };
};

export function MapDetailGallery({ items }: { items: MapDetailItem[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveIndex(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex]);

  const activeItem = activeIndex === null ? null : items[activeIndex];

  return (
    <>
      <div className="mojomap-detail-grid">
        {items.map((detail, index) => (
          <article key={detail.title} className="mojomap-detail-card" data-variant={index + 1}>
            <button
              type="button"
              className="mojomap-detail-trigger"
              onClick={() => setActiveIndex(index)}
              aria-label={`Open larger view for ${detail.title}`}
            >
              <div className="mojomap-preview has-media">
                <Image
                  src={detail.image.src}
                  alt={detail.image.alt}
                  className="mojomap-preview-media"
                  fill
                  sizes="(min-width: 860px) 31vw, 100vw"
                />
              </div>
              <h3 className="mojomap-detail-title">{detail.title}</h3>
              <p className="mojomap-detail-body">{detail.body}</p>
            </button>
          </article>
        ))}
      </div>

      {activeItem ? (
        <div
          className="mojomap-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeItem.title} expanded screenshot`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setActiveIndex(null);
          }}
        >
          <div className="mojomap-lightbox-card">
            <button type="button" className="mojomap-lightbox-close" onClick={() => setActiveIndex(null)}>
              Close
            </button>
            <div className="mojomap-lightbox-media">
              <Image
                src={activeItem.image.src}
                alt={activeItem.image.alt}
                fill
                className="mojomap-lightbox-image"
                sizes="(min-width: 1280px) 76vw, 94vw"
                priority
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

