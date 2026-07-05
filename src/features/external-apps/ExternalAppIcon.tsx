import { useEffect, useState, type ReactNode } from "react";
import { PulseGridLoader } from "@puppyone/shared-ui";
import { ExternalLink } from "lucide-react";

type ExternalAppIconProps = {
  appName?: string | null;
  iconDataUrl?: string | null;
  loading?: boolean;
  className?: string;
  loadingClassName?: string;
  loaderClassName?: string;
};

export function ExternalAppIcon({
  appName,
  iconDataUrl,
  loading = false,
  className,
  loadingClassName,
  loaderClassName,
}: ExternalAppIconProps) {
  if (loading) {
    return (
      <ExternalAppLoadingIcon
        className={loadingClassName}
        loaderClassName={loaderClassName}
      />
    );
  }

  if (iconDataUrl) {
    return (
      <ExternalAppImageIcon
        appName={appName}
        className={className}
        iconDataUrl={iconDataUrl}
        loadingClassName={loadingClassName}
        loaderClassName={loaderClassName}
      />
    );
  }

  return <ExternalAppFallbackIcon appName={appName} className={className} />;
}

function ExternalAppImageIcon({
  appName,
  className,
  iconDataUrl,
  loadingClassName,
  loaderClassName,
}: {
  appName?: string | null;
  className?: string;
  iconDataUrl: string;
  loadingClassName?: string;
  loaderClassName?: string;
}) {
  const [readyIconDataUrl, setReadyIconDataUrl] = useState<string | null>(null);
  const [failedIconDataUrl, setFailedIconDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();

    setReadyIconDataUrl(null);
    setFailedIconDataUrl(null);
    image.onload = () => {
      if (!cancelled) setReadyIconDataUrl(iconDataUrl);
    };
    image.onerror = () => {
      if (!cancelled) setFailedIconDataUrl(iconDataUrl);
    };
    image.src = iconDataUrl;

    if (image.complete && image.naturalWidth > 0) {
      setReadyIconDataUrl(iconDataUrl);
    }

    return () => {
      cancelled = true;
    };
  }, [iconDataUrl]);

  if (readyIconDataUrl === iconDataUrl) {
    return (
      <ExternalAppIconFrame className={className}>
        <img src={iconDataUrl} alt="" draggable={false} />
      </ExternalAppIconFrame>
    );
  }

  if (failedIconDataUrl === iconDataUrl) {
    return <ExternalAppFallbackIcon appName={appName} className={className} />;
  }

  return <ExternalAppLoadingIcon className={loadingClassName} loaderClassName={loaderClassName} />;
}

function ExternalAppLoadingIcon({
  className,
  loaderClassName,
}: {
  className?: string;
  loaderClassName?: string;
}) {
  return (
    <span
      className={[
        "desktop-external-app-loader",
        className,
      ].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <PulseGridLoader
        className={loaderClassName}
        size="sm"
        tone="neutral"
        ariaHidden
      />
    </span>
  );
}

function ExternalAppFallbackIcon({
  appName,
  className,
}: {
  appName?: string | null;
  className?: string;
}) {
  const fallbackInitial = getAppFallbackInitial(appName);
  if (fallbackInitial) {
    return (
      <ExternalAppIconFrame className={className} fallback>
        {fallbackInitial}
      </ExternalAppIconFrame>
    );
  }

  return (
    <ExternalAppIconFrame className={className}>
      <ExternalLink size={15} />
    </ExternalAppIconFrame>
  );
}

function ExternalAppIconFrame({
  children,
  className,
  fallback = false,
}: {
  children: ReactNode;
  className?: string;
  fallback?: boolean;
}) {
  return (
    <span
      className={[
        "desktop-external-app-icon",
        className,
        fallback ? "fallback" : "",
      ].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function getAppFallbackInitial(appName?: string | null) {
  const normalizedName = appName?.trim();
  if (!normalizedName || normalizedName.toLowerCase() === "macos default") return null;
  return normalizedName[0]?.toUpperCase() ?? null;
}
