import path from "node:path";

const AGENT_DISPLAY_READY_SEQUENCES = Object.freeze([
  "\u001b[?1049h",
  "\u001b[?25l",
  "\u001b[2J",
]);

/**
 * A Terminal session is always owned by an interactive shell. An optional
 * Agent is encoded as the shell's first foreground command, so returning from
 * or failing inside the Agent leaves the session at a usable shell prompt.
 */
export function createTerminalShellHost({
  agentLaunch = null,
  environment = process.env,
  platform = process.platform,
} = {}) {
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const file = platform === "win32"
    ? environment.ComSpec || environment.COMSPEC || "cmd.exe"
    : environment.SHELL || "/bin/zsh";
  const shellName = pathModule.basename(file);
  const args = platform !== "win32" && (shellName === "bash" || shellName === "zsh")
    ? ["-l"]
    : [];

  return {
    kind: agentLaunch ? "agent" : "shell",
    file,
    args,
    displayShell: agentLaunch?.displayName ?? shellName,
    loginShell: args.length > 0,
    pathEntries: agentLaunch?.pathEntries ?? [],
    agentBootstrapInput: agentLaunch
      ? serializeTerminalAgentCommand(agentLaunch, { platform, shellFile: file })
      : null,
  };
}

export function serializeTerminalAgentCommand(
  { executablePath, args = [] },
  { platform = process.platform, shellFile = "" } = {},
) {
  const command = [executablePath, ...args];
  if (platform !== "win32") {
    return `${command.map(quotePosixShellArgument).join(" ")}\r`;
  }

  const shellName = path.win32.basename(shellFile).toLowerCase();
  if (shellName === "powershell.exe" || shellName === "pwsh.exe") {
    return `& ${command.map(quotePowerShellArgument).join(" ")}\r`;
  }
  return `${command.map(quoteWindowsCommandArgument).join(" ")}\r`;
}

export function isTerminalAgentDisplayReady(output) {
  const value = String(output || "");
  return value.length >= 384
    || AGENT_DISPLAY_READY_SEQUENCES.some((sequence) => value.includes(sequence));
}

function quotePosixShellArgument(value) {
  return `'${String(value).replace(/'/gu, `'"'"'`)}'`;
}

function quotePowerShellArgument(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

// The executable and prefixes come from the trusted main-process registry,
// never from renderer text. CRT-compatible quoting preserves spaces, quotes,
// and trailing backslashes when cmd.exe launches a native executable.
function quoteWindowsCommandArgument(value) {
  const text = String(value);
  let quoted = '"';
  let backslashes = 0;

  for (const character of text) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += '"';
      backslashes = 0;
      continue;
    }
    quoted += "\\".repeat(backslashes);
    quoted += character;
    backslashes = 0;
  }

  quoted += "\\".repeat(backslashes * 2);
  return `${quoted}"`;
}
