import { unsupportedOfficeDocumentConverter } from "../common/unsupported-document-converter.mjs";

export function createWindowsPlatformAdapter({ arch }) {
  return Object.freeze({
    platform: "windows",
    arch,
    primaryModifier: "control",
    windowChrome: Object.freeze({
      mode: "native",
      browserWindowOptions: Object.freeze({ titleBarStyle: "default" }),
      focusApplication: () => undefined,
      supportsDockIcon: false,
      shouldReapplyProfile: false,
    }),
    documents: Object.freeze({
      supportedInputs: Object.freeze([]),
      convertOfficeDocumentToDocx: unsupportedOfficeDocumentConverter,
    }),
    updater: Object.freeze({ supported: true, installMode: "nsis" }),
  });
}
