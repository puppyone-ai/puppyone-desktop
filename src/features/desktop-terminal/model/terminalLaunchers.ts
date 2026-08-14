export type DesktopTerminalLauncherId =
  | "codex"
  | "claude"
  | "cursor"
  | "opencode"
  | "shell";

export type DesktopTerminalLauncherDefinition = {
  id: DesktopTerminalLauncherId;
  command: string | null;
  descriptionMessage: string;
  icon: "codex" | "claude" | "cursor" | "opencode" | "shell";
  nameMessage: string;
};

export const DESKTOP_TERMINAL_LAUNCHERS: readonly DesktopTerminalLauncherDefinition[] =
  Object.freeze([
    Object.freeze({
      id: "codex",
      command: "codex",
      descriptionMessage: "terminal.launcher.codex.description",
      icon: "codex",
      nameMessage: "terminal.launcher.codex.name",
    }),
    Object.freeze({
      id: "claude",
      command: "claude",
      descriptionMessage: "terminal.launcher.claude.description",
      icon: "claude",
      nameMessage: "terminal.launcher.claude.name",
    }),
    Object.freeze({
      id: "cursor",
      command: "cursor-agent",
      descriptionMessage: "terminal.launcher.cursor.description",
      icon: "cursor",
      nameMessage: "terminal.launcher.cursor.name",
    }),
    Object.freeze({
      id: "opencode",
      command: "opencode",
      descriptionMessage: "terminal.launcher.opencode.description",
      icon: "opencode",
      nameMessage: "terminal.launcher.opencode.name",
    }),
    Object.freeze({
      id: "shell",
      command: null,
      descriptionMessage: "terminal.launcher.shell.description",
      icon: "shell",
      nameMessage: "terminal.launcher.shell.name",
    }),
  ] satisfies DesktopTerminalLauncherDefinition[]);

const launcherById = new Map(
  DESKTOP_TERMINAL_LAUNCHERS.map((launcher) => [launcher.id, launcher]),
);

export function getDesktopTerminalLauncher(
  launcherId: DesktopTerminalLauncherId,
): DesktopTerminalLauncherDefinition {
  const launcher = launcherById.get(launcherId);
  if (!launcher) throw new Error(`Unknown terminal launcher: ${launcherId}`);
  return launcher;
}
