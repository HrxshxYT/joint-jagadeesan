import { describe, it, expect } from "vitest";
import { formatTranscript } from "../../../src/modules/tickets/transcript.js";

const meta = { number: 42, categoryLabel: "Billing", openerTag: "user#0001" };

describe("formatTranscript", () => {
  it("renders a header and each message oldest-first", () => {
    const msgs = [
      { createdAt: new Date("2026-07-16T10:02:00Z"), authorTag: "user#0001", content: "hi", attachments: [] },
      { createdAt: new Date("2026-07-16T10:03:00Z"), authorTag: "staff#0002", content: "hello", attachments: [] },
    ];
    const out = formatTranscript(msgs, meta);
    expect(out).toContain("Ticket #42");
    expect(out).toContain("Billing");
    expect(out).toContain("user#0001");
    const hiIdx = out.indexOf("hi");
    const helloIdx = out.indexOf("hello");
    expect(hiIdx).toBeGreaterThan(-1);
    expect(helloIdx).toBeGreaterThan(hiIdx);
  });

  it("appends attachment urls", () => {
    const msgs = [
      { createdAt: new Date("2026-07-16T10:02:00Z"), authorTag: "u#1", content: "see this", attachments: ["https://cdn/x.png"] },
    ];
    expect(formatTranscript(msgs, meta)).toContain("https://cdn/x.png");
  });

  it("marks empty content", () => {
    const msgs = [
      { createdAt: new Date("2026-07-16T10:02:00Z"), authorTag: "u#1", content: "", attachments: [] },
    ];
    expect(formatTranscript(msgs, meta)).toContain("[no text]");
  });

  it("handles an empty transcript", () => {
    expect(formatTranscript([], meta)).toContain("Ticket #42");
  });
});
