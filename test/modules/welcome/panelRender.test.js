import { describe, it, expect } from "vitest";
import { buildWelcomeView } from "../../../src/modules/welcome/panel/render.js";

const state = (over = {}) => ({
  guildId: "g1",
  ownerId: "o1",
  welcome: {
    welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "hi {mention}",
    goodbyeEnabled: false, goodbyeChannelId: null, goodbyeMessage: "bye {user}",
  },
  ...over,
});

describe("buildWelcomeView", () => {
  it("exposes toggle/message/channel/preview/close controls", () => {
    const ids = buildWelcomeView(state()).components.flatMap((r) => r.components.map((c) => c.data.custom_id));
    expect(ids).toContain("we:tog:welcomeEnabled:o1");
    expect(ids).toContain("we:tog:goodbyeEnabled:o1");
    expect(ids).toContain("we:msg:welcome:o1");
    expect(ids).toContain("we:msg:goodbye:o1");
    expect(ids).toContain("we:preview:o1");
    expect(ids).toContain("we:ch:welcome:o1");
    expect(ids).toContain("we:ch:goodbye:o1");
    expect(ids).toContain("we:close:o1");
  });
  it("shows the welcome toggle green (Success=3) when enabled", () => {
    expect(buildWelcomeView(state()).components[0].components[0].data.style).toBe(3);
  });
  it("has at most 5 rows", () => {
    expect(buildWelcomeView(state()).components.length).toBeLessThanOrEqual(5);
  });
});
