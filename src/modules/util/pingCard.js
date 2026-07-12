import { createCanvas } from "@napi-rs/canvas";
import { ensureCardFont } from "../../lib/cardFont.js";

const FONT = ensureCardFont();
const W = 700;
const H = 240;

export function formatUptime(ms) {
  if (!ms || ms < 0) return "0m";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

// Maps samples to canvas points; higher latency = nearer the top (smaller y).
export function sparklinePoints(samples, { width, height, min, max }) {
  if (!samples.length) return [];
  const lo = min ?? Math.min(...samples);
  const hi = max ?? Math.max(...samples);
  const range = hi - lo || 1;
  const n = samples.length;
  return samples.map((v, i) => ({
    x: n === 1 ? 0 : (i / (n - 1)) * width,
    y: height - ((v - lo) / range) * height,
  }));
}

function pingColor(ping) {
  if (ping < 0) return "#9fb3ab";
  if (ping <= 150) return "#2ecc71";
  if (ping <= 300) return "#fee75c";
  return "#ed4245";
}

export async function buildPingCard({ samples, currentPing, uptimeMs }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1f2724";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(0, 0, 10, H);

  ctx.fillStyle = "#ffffff";
  ctx.font = `30px ${FONT}`;
  ctx.fillText("🏓 Bot Health", 40, 55);

  // Current latency (big, colored)
  ctx.fillStyle = pingColor(currentPing);
  ctx.font = `64px ${FONT}`;
  ctx.fillText(currentPing < 0 ? "—" : `${currentPing}ms`, 40, 130);

  ctx.fillStyle = "#9fb3ab";
  ctx.font = `24px ${FONT}`;
  ctx.fillText(`Uptime: ${formatUptime(uptimeMs)}`, 40, 170);

  // Sparkline (or collecting state)
  const gx = 40, gy = 185, gw = W - 80, gh = 35;
  if (samples.length >= 2) {
    const pts = sparklinePoints(samples, { width: gw, height: gh });
    ctx.strokeStyle = "#2ecc71";
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = gx + p.x;
      const y = gy + p.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  } else {
    ctx.fillStyle = "#9fb3ab";
    ctx.font = `20px ${FONT}`;
    ctx.fillText("collecting latency data…", gx, gy + 24);
  }

  return canvas.toBuffer("image/png");
}
