import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // N1b (2026-09-30): loopback only — was "::" (every interface). `tailscale serve` dials this port
    // from the host, so partners keep working through the ts.net URL below. allowedHosts unchanged.
    host: "127.0.0.1",
    port: 8080,
    // Remote viewers reach the dev server through `tailscale serve` (TLS) at this hostname,
    // which gives them a secure context so crypto.subtle is defined (the identity-compute gate's
    // operator half). Allow ONLY this specific host — not `true`/wildcard — so Vite keeps its
    // host-header protection for every other unknown host.
    allowedHosts: ["mojomap.tail7b863b.ts.net"],
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
