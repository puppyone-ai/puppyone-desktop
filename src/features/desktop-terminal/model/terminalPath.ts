export function terminalPathLabel(pathValue: string) {
  const value = pathValue.trim();
  if (!value) return "—";
  const withoutTrailingSeparators = value.replace(/[\\/]+$/u, "") || value;
  const segments = withoutTrailingSeparators.split(/[\\/]/u).filter(Boolean);
  return segments.at(-1) ?? withoutTrailingSeparators;
}
