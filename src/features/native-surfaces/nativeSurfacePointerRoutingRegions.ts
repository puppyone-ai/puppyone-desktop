import type { NativeSurfacePointerPassthroughOwner } from "./nativeSurfacePointerPassthrough";

export type NativeSurfacePointerRoutingRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type NativeSurfacePointerRoutingRegionLease = Readonly<{
  owner: NativeSurfacePointerPassthroughOwner;
  update: (region: NativeSurfacePointerRoutingRegion | null) => void;
  release: () => void;
}>;

type RegisteredRegion = Readonly<{
  owner: NativeSurfacePointerPassthroughOwner;
  region: NativeSurfacePointerRoutingRegion;
}>;

const regions = new Map<number, RegisteredRegion>();
let nextRegionId = 1;
let publishedSignature = "";

/**
 * Registers renderer-owned hit geometry that may be visually covered by a
 * native WebContentsView. The main process routes only the initial primary
 * press in these rectangles back through the owner renderer; the existing
 * gesture lease then owns move/up forwarding.
 */
export function acquireNativeSurfacePointerRoutingRegion(
  owner: NativeSurfacePointerPassthroughOwner,
): NativeSurfacePointerRoutingRegionLease {
  const id = nextRegionId++;
  let released = false;

  return {
    owner,
    update: (region) => {
      if (released) return;
      if (!region) regions.delete(id);
      else regions.set(id, { owner, region: normalizeRegion(region) });
      publishRegions();
    },
    release: () => {
      if (released) return;
      released = true;
      regions.delete(id);
      publishRegions();
    },
  };
}

function normalizeRegion(
  region: NativeSurfacePointerRoutingRegion,
): NativeSurfacePointerRoutingRegion {
  return Object.freeze({
    x: Math.round(region.x),
    y: Math.round(region.y),
    width: Math.max(1, Math.round(region.width)),
    height: Math.max(1, Math.round(region.height)),
  });
}

function publishRegions(): void {
  const nextRegions = Array.from(regions.values(), ({ region }) => region);
  const signature = JSON.stringify(nextRegions);
  if (signature === publishedSignature) return;
  const publish = window.puppyoneDesktop?.setNativeSurfacePointerRoutingRegions;
  if (typeof publish !== "function") return;
  publishedSignature = signature;
  publish({ regions: nextRegions });
}
