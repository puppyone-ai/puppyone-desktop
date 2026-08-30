export async function unsupportedOfficeDocumentConverter() {
  throw new Error("Desktop Office conversion is unavailable on this platform.");
}
