import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useHashAnchorScroll() {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash?.replace("#", "").trim();
    if (!hash || typeof window === "undefined") return;

    const timer = window.setTimeout(() => {
      const target = document.getElementById(hash);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 90);

    return () => window.clearTimeout(timer);
  }, [location.hash, location.pathname]);
}

