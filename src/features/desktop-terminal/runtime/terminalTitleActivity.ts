const terminalActivitySpinnerFrames = new Set([
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
]);

export function readTerminalActivitySpinnerFrame(title: string) {
  const firstVisibleCharacter = Array.from(title.trimStart())[0];
  return firstVisibleCharacter && terminalActivitySpinnerFrames.has(firstVisibleCharacter)
    ? firstVisibleCharacter
    : null;
}
