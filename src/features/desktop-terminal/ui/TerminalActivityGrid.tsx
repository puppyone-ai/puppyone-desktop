import "./terminal-activity-grid.css";

export function TerminalActivityGrid({ className = "" }: { className?: string }) {
  return (
    <span
      className={`desktop-terminal-activity-grid ${className}`.trim()}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
