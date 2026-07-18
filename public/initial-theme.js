(() => {
  try {
    const storedTheme = window.localStorage.getItem("puppyone.desktop.theme");
    const storedInterfaceStyle = window.localStorage.getItem("puppyone.desktop.interfaceStyle");
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const dark = storedTheme === "dark" || (storedTheme !== "light" && systemDark);
    const interfaceStyle = storedInterfaceStyle === "windows-xp"
      ? "windows-xp"
      : "default";
    document.documentElement.dataset.interfaceStyle = interfaceStyle;
    if (interfaceStyle === "default" && dark) document.documentElement.dataset.initialTheme = "dark";
  } catch {
    // Keep the static first-paint background when storage is unavailable.
  }
})();
