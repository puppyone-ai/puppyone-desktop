const UNSUPPORTED_SYMLINK_CODES = new Set(["EACCES", "EPERM", "ENOTSUP"]);

export async function createSymlinkOrSkip(context, fsPromises, target, linkPath, type) {
  try {
    await fsPromises.symlink(target, linkPath, type);
  } catch (error) {
    if (!UNSUPPORTED_SYMLINK_CODES.has(error?.code)) throw error;
    context.skip(`Symbolic links are unavailable for this test process (${error.code}).`);
  }
}
