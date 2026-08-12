/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DESKTOP_UPDATE_PREVIEW?: string;
  readonly VITE_DESKTOP_UPDATE_PREVIEW_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
