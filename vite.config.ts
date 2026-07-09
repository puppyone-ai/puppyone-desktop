import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const DESKTOP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: puppyone-local: http: https:",
  "font-src 'self' data: blob:",
  "media-src 'self' data: blob: puppyone-local: http: https:",
  "connect-src 'self' puppyone-local: http: https: ws: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' data: blob: puppyone-local: http: https:",
].join("; ");

const desktopContentSecurityPolicyPlugin: Plugin = {
  name: "puppyone-desktop-content-security-policy",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler: () => ({
      tags: [{
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: DESKTOP_CONTENT_SECURITY_POLICY,
        },
        injectTo: "head-prepend",
      }],
    }),
  },
};

export default defineConfig({
  base: "./",
  plugins: [react(), desktopContentSecurityPolicyPlugin],
  clearScreen: false,
  resolve: {
    alias: [
      {
        find: "@puppyone/shared-ui",
        replacement: fileURLToPath(new URL("./vendor/shared-ui/src/index.ts", import.meta.url)),
      },
      {
        find: "lucide-react",
        replacement: fileURLToPath(new URL("./node_modules/lucide-react/dist/esm/lucide-react.js", import.meta.url)),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: fileURLToPath(new URL("./node_modules/react/jsx-dev-runtime.js", import.meta.url)),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: fileURLToPath(new URL("./node_modules/react/jsx-runtime.js", import.meta.url)),
      },
      {
        find: /^react$/,
        replacement: fileURLToPath(new URL("./node_modules/react/index.js", import.meta.url)),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["docx-preview"],
  },
  worker: {
    format: "es",
  },
  server: {
    strictPort: true,
    port: 5173,
  },
});
