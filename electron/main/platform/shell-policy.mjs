export function resolveDefaultDesktopShell({ platform, environment = process.env }) {
  if (platform === "win32") {
    return environment.ComSpec || environment.COMSPEC || "cmd.exe";
  }
  if (environment.SHELL) return environment.SHELL;
  return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}
