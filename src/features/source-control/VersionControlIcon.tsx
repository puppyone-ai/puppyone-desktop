import type { SVGProps } from "react";

/** Canonical Version Control icon shared by navigation and feature surfaces. */
export function VersionControlIcon({
  size = 18,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="5" cy="6" r="3" />
      <path d="M5 9v12" />
      <circle cx="19" cy="18" r="3" />
      <path d="m15 9-3-3 3-3" />
      <path d="M12 6h5a2 2 0 0 1 2 2v7" />
    </svg>
  );
}
