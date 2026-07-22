import { createCanvas } from "@napi-rs/canvas";
import {
  GLASS,
  FONT,
  paintBackground,
  glassPanel,
  drawText,
  roundRectPath,
  hexToRgba,
} from "../../lib/glassCard.js";

export const WELCOME_FILENAME = "welcome.png";

const W = 1000;
const H = 420;
const P = 28;

const TITLE = "Suzune Anti Nuke Service";

// Largest font size (bold) at which `text` still fits within `maxWidth`.
function fitTitle(ctx, text, maxWidth, start = 82) {
  for (let size = start; size > 24; size -= 2) {
    ctx.font = `bold ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return 24;
}

// The onboarding banner: the shared purple liquid-glass backdrop with the
// service name set large and centred, a soft accent underline, and a feature
// tagline beneath. Returns a PNG buffer ready to attach to the welcome embed.
export function buildWelcomeCard() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const accent = GLASS.accent;

  paintBackground(ctx, W, H, accent);
  glassPanel(ctx, P, P, W - 2 * P, H - 2 * P, { radius: 30 });

  const cx = W / 2;

  // Kicker.
  drawText(ctx, "PROTECTION SUITE", cx, 138, {
    size: 24,
    color: GLASS.accentSoft,
    weight: "bold",
    align: "center",
  });

  // Title — auto-fitted so the full phrase always fits on one centred line.
  const titleSize = fitTitle(ctx, TITLE, W - 2 * (P + 46));
  ctx.save();
  ctx.shadowColor = hexToRgba(accent, 0.55);
  ctx.shadowBlur = 26;
  drawText(ctx, TITLE, cx, H / 2 + titleSize / 3, {
    size: titleSize,
    color: GLASS.text,
    weight: "bold",
    align: "center",
  });
  ctx.restore();

  // Accent underline under the title.
  const barW = 200;
  const barY = H / 2 + titleSize / 2 + 26;
  const g = ctx.createLinearGradient(cx - barW / 2, 0, cx + barW / 2, 0);
  g.addColorStop(0, hexToRgba(accent, 0));
  g.addColorStop(0.5, accent);
  g.addColorStop(1, hexToRgba(accent, 0));
  roundRectPath(ctx, cx - barW / 2, barY, barW, 4, 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Feature tagline.
  drawText(ctx, "Real-time Anti-Nuke  ·  Anti-Raid  ·  Live Analytics", cx, H - 96, {
    size: 24,
    color: GLASS.label,
    align: "center",
  });

  return canvas.toBuffer("image/png");
}
