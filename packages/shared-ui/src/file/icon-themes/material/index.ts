import { createIconTheme } from "../themeFactory";
import {
  materialGlyphRenderers,
  renderMaterialFolderPreviewGlyph,
} from "./glyphs";

export const materialTheme = createIconTheme({
  id: "material",
  glyphRenderers: materialGlyphRenderers,
  renderFolderPreviewGlyph: renderMaterialFolderPreviewGlyph,
});
