export function applyWindowsBuilderConfig({ config, identity }) {
  return {
    ...config,
    win: {
      target: ["nsis"],
      executableName: identity.applicationName,
      artifactName: "puppyone-${version}-${arch}-setup.${ext}",
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      artifactName: "puppyone-${version}-${arch}-setup.${ext}",
    },
  };
}
