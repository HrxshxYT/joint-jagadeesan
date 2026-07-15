export const NS = "ticket";

export const KINDS = Object.freeze({
  OPEN: "open",
  OPEN_MODAL: "openmodal",
  CLAIM: "claim",
  MEMBERS: "members",
  MEMBER_PICK: "memberpick",
  CLOSE: "close",
  CLOSE_CONFIRM: "closeconfirm",
  REOPEN: "reopen",
  TRANSCRIPT: "transcript",
  DELETE: "delete",
});

export function buildId(kind, ...args) {
  return [NS, kind, ...args].join(":");
}

export function parseId(customId) {
  if (typeof customId !== "string" || !customId.startsWith(`${NS}:`)) return null;
  const [, kind, ...args] = customId.split(":");
  return { kind, args };
}

export const DEFAULTS = Object.freeze({
  config: {
    enabled: true,
    transcriptChannelId: null,
    dmTranscript: false,
    logChannelId: null,
    maxOpenPerUser: 1,
  },
  category: {
    namePrefix: "ticket",
    welcomeMessage: "Thanks {mention}, staff will be with you shortly.",
    staffRoleIds: [],
  },
});

export const LIMITS = Object.freeze({
  maxPanelsPerGuild: 25,
  maxCategoriesPerPanel: 25,
  transcriptMaxMessages: 2000,
});
