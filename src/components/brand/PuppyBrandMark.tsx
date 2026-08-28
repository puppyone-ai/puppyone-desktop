import { resolveRendererPublicAssetUrl } from "@puppyone/shared-ui";

export const PUPPY_BRAND_MARK_ASSETS = Object.freeze({
  dark: "assets/brand/puppy/puppy-dark.png",
  lite: "assets/brand/puppy/puppy-lite.png",
});

export type PuppyBrandMarkTone = keyof typeof PUPPY_BRAND_MARK_ASSETS;

type PuppyBrandMarkProps = {
  className?: string;
  tone: PuppyBrandMarkTone;
};

/**
 * Renders one of the two product-facing Puppy marks.
 *
 * The native macOS App Image intentionally lives outside `public/` and must
 * never be used by renderer UI.
 */
export function PuppyBrandMark({ className, tone }: PuppyBrandMarkProps) {
  return (
    <img
      className={className}
      src={resolveRendererPublicAssetUrl(PUPPY_BRAND_MARK_ASSETS[tone])}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
