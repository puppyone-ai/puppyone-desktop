import type JSZip from "jszip";
import { validateOfficePackageDecompression } from "../../../../../../../vendor/shared-ui/src/editor/security/officePackageValidationTask";
import { DOCX_REDLINE_BUDGET, createDocxLimitError } from "../budget";
import type { DocxNormalizedBlock } from "../model";
import { normalizeDocxDocumentXml } from "./normalize";

export async function parseDocxRevision(arrayBuffer: ArrayBuffer): Promise<DocxNormalizedBlock[]> {
  if (isEncryptedOfficeContainer(arrayBuffer)) {
    const error = new Error("Encrypted or password-protected Word documents cannot be compared.");
    error.name = "DocxEncryptedError";
    throw error;
  }
  await validateOfficePackageDecompression(arrayBuffer, {
    profile: "docx",
    budget: {
      maxEntryUncompressedBytes: DOCX_REDLINE_BUDGET.maxEntryUncompressedBytes,
      maxTotalUncompressedBytes: DOCX_REDLINE_BUDGET.maxTotalUncompressedBytes,
      maxDocxXmlStartTags: DOCX_REDLINE_BUDGET.maxXmlStartTags,
    },
  });
  const { default: JSZipRuntime } = await import("jszip");
  const zip = await JSZipRuntime.loadAsync(arrayBuffer, { createFolders: false });
  const documentEntry = zip.files["word/document.xml"] as JSZip.JSZipObject | undefined;
  if (!documentEntry || documentEntry.dir) {
    const error = new Error("The Word package does not contain word/document.xml.");
    error.name = "DocxStructureError";
    throw error;
  }
  const xml = await documentEntry.async("string");
  if (xml.length > DOCX_REDLINE_BUDGET.maxEntryUncompressedBytes) {
    throw createDocxLimitError("Word document XML exceeds the semantic diff budget.");
  }
  return normalizeDocxDocumentXml(xml);
}

function isEncryptedOfficeContainer(arrayBuffer: ArrayBuffer) {
  if (arrayBuffer.byteLength < 8) return false;
  const signature = new Uint8Array(arrayBuffer, 0, 8);
  const compoundFileSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return compoundFileSignature.every((byte, index) => signature[index] === byte);
}
