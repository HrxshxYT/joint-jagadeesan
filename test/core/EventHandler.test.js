import { describe, it, expect, vi } from "vitest";
import { bindEvents } from "../../src/core/EventHandler.js";

function fakeClient() {
  const handlers = { on: {}, once: {} };
  return {
    on: (name, fn) => (handlers.on[name] = fn),
    once: (name, fn) => (handlers.once[name] = fn),
    _handlers: handlers,
  };
}

describe("bindEvents", () => {
  it("registers on and once listeners and passes context", async () => {
    const client = fakeClient();
    const ctx = { flag: true };
    const spy = vi.fn();
    bindEvents(client, [{ name: "ready", once: true, execute: spy }], ctx);
    await client._handlers.once.ready("arg1");
    expect(spy).toHaveBeenCalledWith(ctx, "arg1");
  });

  it("registers recurring listeners with client.on", () => {
    const client = fakeClient();
    bindEvents(client, [{ name: "guildCreate", execute: () => {} }], {});
    expect(typeof client._handlers.on.guildCreate).toBe("function");
  });
});
