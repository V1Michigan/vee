import { createHash } from "node:crypto";
import { ProviderFailure } from "./provider-errors.js";

export type WriteAttempt = { sessionId: string; callId: string; digest: string };

/**
 * An external atomic latch is necessary: Eve checkpoints authored state only
 * at step boundaries and can replay a step interrupted after a provider write.
 * Store only a digest. Never expire/delete claims while a run can be resumed.
 */
export async function claimWriteAttempt(attempt: WriteAttempt, signal?: AbortSignal): Promise<void> {
  const endpoint = process.env.VEE_ACTION_REDIS_REST_URL;
  const token = process.env.VEE_ACTION_REDIS_REST_TOKEN;
  if (!endpoint || !token) throw new ProviderFailure("write_journal_unavailable");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new ProviderFailure("write_journal_unavailable"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new ProviderFailure("write_journal_unavailable");
  signal?.throwIfAborted();
  const key = `vee:write:v1:${createHash("sha256").update(`${attempt.sessionId}:${attempt.callId}`).digest("hex")}`;
  try {
    // No TTL, client retries, or result/argument payload. SET NX is atomic.
    const response = await fetch(url, {
      method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, attempt.digest, "NX"]),
      signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
    });
    if (!response.ok) throw new ProviderFailure("write_journal_unavailable");
    const result = await response.json() as { result?: unknown; error?: unknown };
    if (result.error || !Object.hasOwn(result, "result")) throw new ProviderFailure("write_journal_unavailable");
    if (result.result === null) throw new ProviderFailure("outcome_unknown");
    if (result.result !== "OK") throw new ProviderFailure("write_journal_unavailable");
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    // The latch may have committed. Never dispatch a write on an uncertain claim.
    throw new ProviderFailure("write_journal_unavailable");
  }
}
