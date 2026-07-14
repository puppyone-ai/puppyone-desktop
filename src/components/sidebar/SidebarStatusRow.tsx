import { type HTMLAttributes, type ReactNode } from "react";

export type SidebarStatusRowProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export function SidebarStatusRow({
  className,
  icon,
  label,
  meta,
  tone = "neutral",
  ...props
}: SidebarStatusRowProps) {
  return (
    <div
      className={["po-desktop-sidebar-status-row", className].filter(Boolean).join(" ")}
      data-tone={tone}
      {...props}
    >
      {icon != null && <span className="po-desktop-sidebar-status-row__icon" aria-hidden="true">{icon}</span>}
      <span className="po-desktop-sidebar-status-row__label">{label}</span>
      {meta != null && <span className="po-desktop-sidebar-status-row__meta">{meta}</span>}
    </div>
  );
}
