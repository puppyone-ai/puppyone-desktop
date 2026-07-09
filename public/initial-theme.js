(() => {
  try {
    const storedTheme = window.localStorage.getItem("puppyone.desktop.theme");
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const dark = storedTheme === "dark" || (storedTheme !== "light" && systemDark);
    if (dark) document.documentElement.dataset.initialTheme = "dark";
  } catch {
    // Keep the static first-paint background when storage is unavailable.
  }
})();
