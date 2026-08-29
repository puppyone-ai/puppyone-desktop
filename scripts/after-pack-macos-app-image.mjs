import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import plist from "plist";

const APP_IMAGE_FILENAME = "puppy-app-image.png";

export default async function useMacAppImageAfterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appFilename = `${context.packager.appInfo.productFilename}.app`;
  const contentsPath = path.join(context.appOutDir, appFilename, "Contents");
  const resourcesPath = path.join(contentsPath, "Resources");
  const appImagePath = path.join(resourcesPath, APP_IMAGE_FILENAME);
  const generatedIcnsPath = path.join(resourcesPath, "icon.icns");
  const infoPlistPath = path.join(contentsPath, "Info.plist");

  await access(appImagePath);
  await rm(generatedIcnsPath, { force: true });

  const info = plist.parse(await readFile(infoPlistPath, "utf8"));
  info.CFBundleIconFile = APP_IMAGE_FILENAME;
  delete info.CFBundleIconName;
  await writeFile(infoPlistPath, plist.build(info));
}
