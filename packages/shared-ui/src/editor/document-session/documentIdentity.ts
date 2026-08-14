import type {
  DocumentPersistencePort,
  DocumentStorageIdentity,
} from "../../core/types";
import {
  canonicalizeResourcePath,
  type CanonicalResourcePath,
} from "../../core/resourcePath";

export type CanonicalDocumentResourcePath = CanonicalResourcePath;

export type DocumentIdentity = Readonly<{
  storageIdentity: DocumentStorageIdentity;
  resourcePath: CanonicalDocumentResourcePath;
}>;

export function createDocumentIdentity(
  persistence: Pick<DocumentPersistencePort, "storageIdentity">,
  resourcePath: string,
): DocumentIdentity {
  const storageIdentity = persistence.storageIdentity.trim();
  if (!storageIdentity) throw new TypeError("Document storage identity must not be empty.");
  return {
    storageIdentity,
    resourcePath: canonicalizeResourcePath(resourcePath),
  };
}

export const canonicalizeDocumentResourcePath = canonicalizeResourcePath;

export function getDocumentIdentityKey(identity: DocumentIdentity): string {
  return JSON.stringify([identity.storageIdentity, identity.resourcePath]);
}
