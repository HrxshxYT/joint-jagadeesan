import { createCanvas } from "@napi-rs/canvas";
import { ensureCardFont } from "../../lib/cardFont.js";

const FONT = ensureCardFont();

const W = 1000;
const H = 848;
const P = 28; // outer padding

// Palette — a dark neon "console" look matching the reference dashboard.
const BG = "#070b10";
const PANEL = "#0c1219";
const PANEL_BORDER = "#16323f";
const TRACK = "#10202b";
const LABEL = "#6f8494";
const MUTED = "#7f93a3";
const VALUE = "#35e0f2"; // bright cyan for healthy numbers
const THREAT = "#ff5c5c"; // red for non-zero threat metrics
const OK_GREEN = "#37f0a4";
const WHITE = "#eaf6ff";

// Security-level colour: the whole card glows in this so the image reads as an
// at-a-glance index of the server's posture.
function tierColor(label) {
  switch (label) {
    case "PROTECTED":
      return "#22d3ee";
    case "GUARDED":
      return "#f1c40f";
    case "ELEVATED":
      return "#e67e22";
    default:
      return "#ff4d4f";
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Draws text with a soft neon glow in the given colour.
function glowText(ctx, text, x, y, { size, color, weight = "", glow = 12, align = "left" }) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`.trim();
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Renders one metric tile: neon left accent, small label, large value.
function tile(ctx, x, y, w, h, { symbol, label, value, color, accent }) {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PANEL_BORDER;
  ctx.stroke();

  // Neon left accent bar.
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  roundRect(ctx, x, y + 10, 5, h - 20, 3);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  glowText(ctx, `${symbol}  ${label}`, x + 20, y + 34, {
    size: 15,
    color: LABEL,
    glow: 0,
  });

  const isText = typeof value === "string";
  glowText(ctx, String(value), x + 20, y + (isText ? 80 : 84), {
    size: isText ? 30 : 42,
    color,
    glow: 10,
  });
}

// Builds the live security dashboard as a PNG buffer from computed metrics.
export function buildDashboardCard(metrics) {
  const m = metrics;
  const accent = tierColor(m.tier.label);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background + outer neon frame.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 22;
  roundRect(ctx, 6, 6, W - 12, H - 12, 20);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  // Full-height left accent.
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.fillStyle = accent;
  roundRect(ctx, 6, 6, 8, H - 12, 4);
  ctx.fill();
  ctx.restore();

  // Header.
  glowText(ctx, "ATHENA'S SECURITY DASHBOARD", P + 14, 56, {
    size: 34,
    color: WHITE,
    glow: 8,
  });
  glowText(
    ctx,
    `STATUS: ${m.tier.label}   •   FIREWALL: ${m.firewall ? "ACTIVE" : "OFFLINE"}   •   MEMBERS: ${m.members}   •   LIVE MONITORING: ACTIVE`,
    P + 16,
    88,
    { size: 17, color: MUTED, glow: 0 },
  );

  // Integrity panel.
  const ipY = 108;
  const ipH = 138;
  roundRect(ctx, P, ipY, W - 2 * P, ipH, 16);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  glowText(ctx, "SYSTEM INTEGRITY INDEX", P + 26, ipY + 44, {
    size: 16,
    color: LABEL,
    glow: 0,
  });
  glowText(ctx, `${m.integrity}%`, P + 24, ipY + 112, {
    size: 62,
    color: accent,
    glow: 16,
  });

  // Integrity bar.
  const barX = P + 320;
  const barY = ipY + 54;
  const barW = W - P - barX - 26;
  const barH = 30;
  roundRect(ctx, barX, barY, barW, barH, 15);
  ctx.fillStyle = TRACK;
  ctx.fill();
  const fillW = Math.max(barH, (Math.max(0, Math.min(100, m.integrity)) / 100) * barW);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 20;
  roundRect(ctx, barX, barY, fillW, barH, 15);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  // Metric grid — 4 columns × 3 rows, matching the reference layout.
  const gap = 16;
  const colW = (W - 2 * P - 3 * gap) / 4;
  const tileH = 112;
  const gridY = ipY + ipH + 22;
  const rowGap = 16;

  const threatColor = (n) => (n > 0 ? THREAT : VALUE);
  const threatAccent = (n) => (n > 0 ? THREAT : accent);

  const cells = [
    { symbol: "@", label: "ROLES", value: m.roles, color: VALUE, accent },
    { symbol: "★", label: "ADMIN ROLES", value: m.adminRoles, color: VALUE, accent },
    { symbol: "!", label: "THREAT ROLES", value: m.threatRoles, color: threatColor(m.threatRoles), accent: threatAccent(m.threatRoles) },
    { symbol: "‼", label: "PERM RISK", value: m.permRisk, color: threatColor(m.permRisk), accent: threatAccent(m.permRisk) },
    { symbol: "#", label: "CHANNELS", value: m.channels, color: VALUE, accent },
    { symbol: "+", label: "PRIVILEGED", value: m.privileged, color: VALUE, accent },
    { symbol: "✕", label: "THREAT USERS", value: m.threatUsers, color: threatColor(m.threatUsers), accent: threatAccent(m.threatUsers) },
    { symbol: "@", label: "INTEGRATIONS", value: m.integrations, color: VALUE, accent },
    { symbol: "●", label: "TOTAL ASSETS", value: m.totalAssets, color: VALUE, accent },
    { symbol: "▲", label: "THREAT ASSETS", value: m.threatAssets, color: threatColor(m.threatAssets), accent: threatAccent(m.threatAssets) },
    { symbol: "»", label: "ACTIVITY", value: "Tracking", color: VALUE, accent },
    { symbol: "▣", label: "FIREWALL", value: m.firewall ? "Active" : "Offline", color: m.firewall ? OK_GREEN : THREAT, accent: m.firewall ? accent : THREAT },
  ];

  cells.forEach((cell, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = P + col * (colW + gap);
    const y = gridY + row * (tileH + rowGap);
    tile(ctx, x, y, colW, tileH, cell);
  });

  // Active monitoring core.
  const coreY = gridY + 3 * tileH + 2 * rowGap + 22;
  const coreH = 118;
  roundRect(ctx, P, coreY, W - 2 * P, coreH, 16);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  roundRect(ctx, P, coreY + 14, 5, coreH - 28, 3);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  glowText(ctx, ">> ACTIVE MONITORING CORE", P + 26, coreY + 42, {
    size: 20,
    color: accent,
    glow: 10,
  });
  const clean = m.threatRoles + m.threatUsers + m.threatAssets + m.permRisk === 0;
  glowText(
    ctx,
    clean
      ? "> No recent security events detected."
      : "> Elevated exposure detected — review threat metrics above.",
    P + 26,
    coreY + 82,
    { size: 17, color: clean ? MUTED : THREAT, glow: 0 },
  );

  // Footer credit.
  glowText(ctx, "Developed by hrxshxforpresident", W / 2, H - 22, {
    size: 16,
    color: LABEL,
    glow: 0,
    align: "center",
  });

  return canvas.toBuffer("image/png");
}
