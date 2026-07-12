import { GlobalFonts } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const CARD_FONT = "BotSans";

const fontPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "DejaVuSans.ttf");
let registered = false;

// Registers the bundled card font once. Wrapped in try/catch so a missing/invalid
// font file falls back to the canvas default instead of throwing at import time.
export function ensureCardFont() {
  if (!registered) {
    try {
      GlobalFonts.registerFromPath(fontPath, CARD_FONT);
    } catch {
      // fall back to the library's built-in font
    }
    registered = true;
  }
  return CARD_FONT;
}
