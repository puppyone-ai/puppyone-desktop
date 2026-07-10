/**
 * Catalog transport abstraction. The catalog is how first-party packs would be
 * discovered/downloaded on demand, but it is DISABLED by default and the
 * default transport never touches the network. A network-backed transport is a
 * future, explicitly-enabled decision — until then every call fails closed.
 */

export class CatalogDisabledError extends Error {
  constructor(message = "The viewer-pack catalog is disabled.") {
    super(message);
    this.name = "CatalogDisabledError";
  }
}

/**
 * The default transport. `enabled` is false and `fetchIndex` never performs a
 * network request — it rejects. This guarantees that opening a file can never
 * cause catalog traffic even if a caller wired it up incorrectly.
 */
export function createDisabledCatalogTransport() {
  return Object.freeze({
    enabled: false,
    async fetchIndex() {
      throw new CatalogDisabledError();
    },
    async download() {
      throw new CatalogDisabledError();
    },
  });
}
