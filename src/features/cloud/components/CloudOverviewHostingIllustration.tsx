/**
 * Theme-aware Homepage artwork.
 *
 * The composition intentionally mirrors PuppyOne's flat connection artwork:
 * one project inside a Cloud boundary, with a compact availability signal.
 * Keeping the geometry in SVG lets every interface style supply its own color
 * tokens without maintaining light and dark raster variants.
 */
export function CloudOverviewHostingIllustration() {
  return (
    <svg
      className="desktop-cloud-overview-hosting-art"
      viewBox="0 0 320 260"
      fill="none"
      focusable="false"
      aria-hidden="true"
    >
      <path
        className="desktop-cloud-overview-hosting-cloud"
        d="M72 176C42 176 19 153 19 124C19 96 40 73 68 70C76 39 104 18 137 18C175 18 205 45 209 80C219 72 232 68 245 68C276 68 301 92 301 123C301 152 278 176 249 176H72Z"
      />

      <path
        className="desktop-cloud-overview-hosting-folder"
        d="M102 91H141C145 91 147 92 150 95L163 110H219C225 110 230 115 230 121V160C230 166 225 171 219 171H102C96 171 91 166 91 160V102C91 96 96 91 102 91Z"
      />
      <path
        className="desktop-cloud-overview-hosting-folder-rim"
        d="M92 116H229"
      />

      <path
        className="desktop-cloud-overview-hosting-connector"
        d="M160 176V202"
      />
      <rect
        className="desktop-cloud-overview-hosting-status"
        x="108"
        y="202"
        width="104"
        height="36"
        rx="18"
      />
      <circle
        className="desktop-cloud-overview-hosting-status-dot"
        cx="130"
        cy="220"
        r="5.5"
      />
      <path
        className="desktop-cloud-overview-hosting-status-line"
        d="M148 220H187"
      />
    </svg>
  );
}
