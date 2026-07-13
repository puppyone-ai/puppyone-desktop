export const DOCX_REDLINE_BUDGET = Object.freeze({
  maxEntryUncompressedBytes: 16 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxXmlStartTags: 250_000,
  maxXmlDepth: 512,
  maxBlocks: 12_000,
  maxTextCharacters: 2_000_000,
  maxAlignmentCells: 300_000,
  maxWordDiffCells: 160_000,
  maxPresentedChanges: 1_200,
});

export function createDocxLimitError(message: string) {
  const error = new Error(message);
  error.name = "DocxRedlineLimitError";
  return error;
}
