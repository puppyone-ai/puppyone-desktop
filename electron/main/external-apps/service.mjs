import os from "node:os";
import path from "node:path";
import { createUnknownExternalOpenTarget, getExternalApplicationInfo } from "./application-info.mjs";
import { validateExternalApplicationPath } from "./bundle-metadata.mjs";
import { getApplicationCandidatesForExtension } from "./inventory.mjs";
import { resolveSystemDefaultApplicationPath, resolveSystemOpenApplicationPaths } from "./launch-services.mjs";
import { openFileWithExternalApplication } from "./open-file.mjs";

export { openFileWithExternalApplication, validateExternalApplicationPath };

export async function resolveExternalOpenTarget({
  app,
  appPath,
  extension,
  filePath,
  source,
}) {
  if (appPath) {
    return {
      ...(await getExternalApplicationInfo({ app, appPath })),
      extension,
      source,
    };
  }

  const systemAppPath = resolveSystemDefaultApplicationPath(filePath);
  if (!systemAppPath) {
    return createUnknownExternalOpenTarget(extension);
  }

  return {
    ...(await getExternalApplicationInfo({ app, appPath: systemAppPath })),
    extension,
    source: "system",
  };
}

export async function listExternalOpenTargets({
  app,
  appPath,
  extension,
  filePath,
}) {
  const defaultTarget = await resolveExternalOpenTarget({
    app,
    appPath,
    extension,
    filePath,
    source: appPath ? "override" : "system",
  });
  const targets = [defaultTarget];
  const seenPaths = new Set();
  if (defaultTarget.appPath) {
    seenPaths.add(path.resolve(defaultTarget.appPath));
  }

  for (const candidatePath of resolveSystemOpenApplicationPaths(filePath)) {
    const normalizedPath = path.resolve(candidatePath);
    if (seenPaths.has(normalizedPath)) continue;

    try {
      const target = await getExternalApplicationInfo({ app, appPath: normalizedPath });
      seenPaths.add(normalizedPath);
      targets.push({
        ...target,
        extension,
        source: "candidate",
      });
    } catch {
      // Ignore stale LaunchServices entries. macOS can keep apps in the list
      // after they have been deleted or moved.
    }
  }

  for (const candidate of getApplicationCandidatesForExtension(extension)) {
    if (seenPaths.has(candidate.appPath)) continue;

    try {
      const target = await getExternalApplicationInfo({ app, appPath: candidate.appPath });
      seenPaths.add(candidate.appPath);
      targets.push({
        ...target,
        extension,
        source: "candidate",
      });
    } catch {
      // Ignore stale or inaccessible app bundles discovered from local scans.
    }
  }

  return targets.slice(0, 8);
}

export async function chooseExternalApplication({
  app,
  dialog,
  ownerWindow,
  extension,
  t = defaultTranslate,
}) {
  const options = {
    title: extension
      ? t("native.externalApp.chooseForExtension.title", { extension })
      : t("native.externalApp.choose.title"),
    defaultPath: getDefaultApplicationsPath(),
    buttonLabel: t("native.externalApp.choose.button"),
    properties: ["openFile"],
    filters: [
      { name: t("native.externalApp.applications.filter"), extensions: ["app"] },
    ],
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) return null;
  const appPath = result.filePaths[0];
  validateExternalApplicationPath(appPath);

  return {
    ...(await getExternalApplicationInfo({ app, appPath })),
    extension,
    source: "override",
  };
}

function defaultTranslate(messageId, values = {}) {
  const messages = {
    "native.externalApp.choose.title": "Choose app",
    "native.externalApp.choose.button": "Choose",
    "native.externalApp.applications.filter": "Applications",
  };
  if (messageId === "native.externalApp.chooseForExtension.title") {
    return `Choose default app for .${values.extension}`;
  }
  return messages[messageId] ?? "";
}

function getDefaultApplicationsPath() {
  return process.platform === "darwin" ? "/Applications" : path.join(os.homedir(), "Applications");
}
