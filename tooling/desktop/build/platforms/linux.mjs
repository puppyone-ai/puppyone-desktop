export function applyLinuxBuilderConfig({ config, identity }) {
  return {
    ...config,
    linux: {
      category: "Office;Utility",
      executableName: identity.applicationName,
      target: ["AppImage"],
      artifactName: "puppyone-${version}-${arch}.${ext}",
    },
    appImage: {
      artifactName: "puppyone-${version}-${arch}.${ext}",
    },
  };
}
