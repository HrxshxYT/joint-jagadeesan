import { describe, it, expect } from "vitest";
import { buildDashboardCard } from "../../../src/modules/dashboard/card.js";

const base = {
  integrity: 100,
  tier: { label: "PROTECTED", color: 0x2ecc71 },
  firewall: true,
  roles: 15,
  adminRoles: 6,
  threatRoles: 0,
  permRisk: 0,
  channels: 22,
  privileged: 5,
  threatUsers: 0,
  integrations: 5,
  totalAssets: 0,
  threatAssets: 0,
  members: 1234,
  features: { "Anti-Nuke": true, "Anti-Raid": true, "Auto-Mod": true },
};

describe("buildDashboardCard", () => {
  it("renders a non-empty PNG buffer", () => {
    const buf = buildDashboardCard(base);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG"); // PNG signature
  });

  it("renders across every security tier without throwing", () => {
    for (const label of ["PROTECTED", "GUARDED", "ELEVATED", "AT RISK"]) {
      const buf = buildDashboardCard({
        ...base,
        tier: { label, color: 0 },
        firewall: label !== "AT RISK",
        threatRoles: label === "AT RISK" ? 3 : 0,
        threatUsers: label === "AT RISK" ? 2 : 0,
        threatAssets: label === "AT RISK" ? 1 : 0,
        permRisk: label === "AT RISK" ? 2 : 0,
      });
      expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
    }
  });
});
