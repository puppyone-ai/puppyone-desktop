import { spawnSync } from "node:child_process";

const SYSTEM_DEFAULT_APP_SCRIPT = `
ObjC.import("AppKit");
ObjC.import("stdlib");
const filePath = ObjC.unwrap($.getenv("PUPPYONE_EXTERNAL_OPEN_FILE"));
if (!filePath) {
  $.exit(2);
}
const url = $.NSURL.fileURLWithPath(filePath);
const appUrl = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(url);
if (!appUrl) {
  $.exit(3);
}
console.log(ObjC.unwrap(appUrl.path));
`;

const SYSTEM_OPEN_CANDIDATES_SCRIPT = `
ObjC.import("AppKit");
ObjC.import("stdlib");
const filePath = ObjC.unwrap($.getenv("PUPPYONE_EXTERNAL_OPEN_FILE"));
if (!filePath) {
  $.exit(2);
}
const url = $.NSURL.fileURLWithPath(filePath);
const appUrls = $.NSWorkspace.sharedWorkspace.URLsForApplicationsToOpenURL(url);
const paths = [];
for (let index = 0; index < appUrls.count; index += 1) {
  const appUrl = appUrls.objectAtIndex(index);
  const appPath = ObjC.unwrap(appUrl.path);
  if (appPath) paths.push(appPath);
}
console.log(JSON.stringify(paths));
`;

export function resolveSystemDefaultApplicationPath(filePath) {
  if (process.platform !== "darwin") return null;

  const result = spawnSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", SYSTEM_DEFAULT_APP_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PUPPYONE_EXTERNAL_OPEN_FILE: filePath,
    },
    timeout: 3000,
  });

  if (result.error || result.status !== 0) return null;
  const appPath = result.stdout.trim();
  return appPath.endsWith(".app") ? appPath : null;
}

export function resolveSystemOpenApplicationPaths(filePath) {
  if (process.platform !== "darwin") return [];

  const result = spawnSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", SYSTEM_OPEN_CANDIDATES_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PUPPYONE_EXTERNAL_OPEN_FILE: filePath,
    },
    timeout: 3000,
  });

  if (result.error || result.status !== 0) return [];

  try {
    const paths = JSON.parse(result.stdout.trim());
    return Array.isArray(paths)
      ? paths.filter((candidatePath) => typeof candidatePath === "string" && candidatePath.endsWith(".app"))
      : [];
  } catch {
    return [];
  }
}
