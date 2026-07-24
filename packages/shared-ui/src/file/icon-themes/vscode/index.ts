import { createIconTheme } from "../themeFactory";
import {
  renderVsCodeFolderPreviewGlyph,
  vscodeGlyphRenderers,
} from "./glyphs";

export const vscodeTheme = createIconTheme({
  id: "vscode",
  glyphRenderers: vscodeGlyphRenderers,
  renderFolderPreviewGlyph: renderVsCodeFolderPreviewGlyph,
});
