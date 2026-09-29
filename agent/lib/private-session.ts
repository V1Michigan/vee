import { defineState } from "eve/context";
import { ProviderFailure } from "./provider-errors.js";

// This marker is scoped to Eve's DM session. It contains no source content.
// Once private retrieval is requested, model-selected arguments must not carry
// that session's content into other providers, files shared across sessions, or
// actions. Start a separate conversation for those tasks.
export const privateSlackSession = defineState("vee.private-slack-session.v1", () => false);

export function assertNoPrivateSlackExport(): void {
  if (privateSlackSession.get()) throw new ProviderFailure("private_session_restricted");
}
