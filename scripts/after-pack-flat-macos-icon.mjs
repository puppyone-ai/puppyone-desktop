import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import plist from "plist";

const DIRECT_ICON_FILENAME = "logo-square.png";

export default async function useFlatMacIconAfterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appFilename = `${context.packager.appInfo.productFilename}.app`;
  const contentsPath = path.join(context.appOutDir, appFilename, "Contents");
  const resourcesPath = path.join(contentsPath, "Resources");
  const directIconPath = path.join(resourcesPath, DIRECT_ICON_FILENAME);
  const generatedIcnsPath = path.join(resourcesPath, "icon.icns");
  const infoPlistPath = path.join(contentsPath, "Info.plist");

  await access(directIconPath);
  await rm(generatedIcnsPath, { force: true });

  const info = plist.parse(await readFile(infoPlistPath, "utf8"));
  info.CFBundleIconFile = DIRECT_ICON_FILENAME;
  delete info.CFBundleIconName;
  await writeFile(infoPlistPath, plist.build(info));
}
