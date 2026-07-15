// test/modules/tickets/panel/render.test.js
import { describe, it, expect } from "vitest";
import { buildTicketsView } from "../../../../src/modules/tickets/panel/render.js";

const base = (over = {}) => ({
  guildId: "g1", ownerId: "o1", view: "home",
  config: { enabled: true, transcriptChannelId: null, dmTranscript: false, logChannelId: null, maxOpenPerUser: 1 },
  panels: [{ id: "p1", name: "Main", title: "Support", description: "d", messageId: null, categories: [] }],
  selectedPanelId: null,
  ...over,
});

describe("buildTicketsView", () => {
  it("home view lists panels and a new-panel button", () => {
    const { embeds, components } = buildTicketsView(base());
    expect(embeds[0].data.title).toContain("Ticket");
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id)).filter(Boolean);
    expect(ids.some((id) => id.startsWith("tk:newpanel:"))).toBe(true);
  });

  it("panel view shows editor controls for the selected panel", () => {
    const s = base({ view: "panel", selectedPanelId: "p1" });
    const { components } = buildTicketsView(s);
    const ids = components.flatMap((r) => r.components.map((c) => c.data.custom_id)).filter(Boolean);
    expect(ids.some((id) => id.startsWith("tk:publish:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("tk:addcat:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("tk:delpanel:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("tk:back:"))).toBe(true);
  });
});
