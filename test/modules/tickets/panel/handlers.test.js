// test/modules/tickets/panel/handlers.test.js
import { describe, it, expect, vi } from "vitest";
import { handleTicketsComponent } from "../../../../src/modules/tickets/panel/handlers.js";

const render = () => ({ embeds: [], components: [] });
const baseState = (over = {}) => ({
  guildId: "g1", ownerId: "o1", view: "home",
  config: { enabled: true, dmTranscript: false, maxOpenPerUser: 1 },
  panels: [{ id: "p1", name: "Main", title: "T", description: "D", messageId: null, channelId: null, categories: [] }],
  selectedPanelId: null,
  ...over,
});
const ctx = (over = {}) => ({
  tickets: {
    updateConfig: vi.fn(async () => ({})),
    createPanel: vi.fn(async () => ({ id: "p2", name: "New", categories: [] })),
    listPanels: vi.fn(async () => []),
    ...over,
  },
});

describe("handleTicketsComponent", () => {
  it("returns close for the close button", async () => {
    const dir = await handleTicketsComponent({ customId: "tk:close:o1", user: { id: "o1" } }, baseState(), ctx(), render);
    expect(dir).toBe("close");
  });

  it("toggles a boolean config field and persists", async () => {
    const c = ctx();
    const s = baseState();
    const dir = await handleTicketsComponent({ customId: "tk:tog:enabled:o1", user: { id: "o1" } }, s, c, render);
    expect(dir).toBe("update");
    expect(c.tickets.updateConfig).toHaveBeenCalledWith("g1", { enabled: false });
    expect(s.config.enabled).toBe(false);
  });

  it("sets the transcript channel from a channel select", async () => {
    const c = ctx();
    const s = baseState();
    await handleTicketsComponent({ customId: "tk:transcriptch:o1", values: ["chX"], user: { id: "o1" } }, s, c, render);
    expect(c.tickets.updateConfig).toHaveBeenCalledWith("g1", { transcriptChannelId: "chX" });
    expect(s.config.transcriptChannelId).toBe("chX");
  });

  it("selecting a panel switches to the editor view", async () => {
    const s = baseState();
    const dir = await handleTicketsComponent({ customId: "tk:selpanel:o1", values: ["p1"], user: { id: "o1" } }, s, ctx(), render);
    expect(dir).toBe("update");
    expect(s.view).toBe("panel");
    expect(s.selectedPanelId).toBe("p1");
  });

  it("back returns to home", async () => {
    const s = baseState({ view: "panel", selectedPanelId: "p1" });
    await handleTicketsComponent({ customId: "tk:back:o1", user: { id: "o1" } }, s, ctx(), render);
    expect(s.view).toBe("home");
  });
});
