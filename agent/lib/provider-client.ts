import { setTimeout as delay } from "node:timers/promises";
import { createMCPClient, type MCPClient, type CallToolResult } from "@ai-sdk/mcp";
import { classifyFailure, ProviderFailure } from "./provider-errors.js";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRY_DELAY_MS = 5_000;

export async function retryRead<T>(run: () => Promise<T>, signal?: AbortSignal, sleep = delay): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await run(); } catch (error) {
      const failure = classifyFailure(error);
      if (attempt >= 2 || !["rate_limited", "provider_unavailable"].includes(failure.code)) throw failure;
      const wait = failure.retryAfterMs ?? 250 * 2 ** attempt;
      // Do not retry earlier than Retry-After or keep a serverless call waiting indefinitely.
      if (wait > MAX_RETRY_DELAY_MS) throw failure;
      await sleep(wait, undefined, { signal });
    }
  }
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now()) || undefined;
}

/** Deadlines and safe HTTP errors. The MCP library performs no automatic retries. */
export function providerFetch(signal?: AbortSignal): typeof fetch {
  return async (input, init) => {
    const signals = [signal, init?.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)].filter((s): s is AbortSignal => !!s);
    try {
      const response = await fetch(input, { ...init, redirect: "error", signal: AbortSignal.any(signals) });
      if (response.ok || response.status === 401) return response;
      if (response.status === 429) throw new ProviderFailure("rate_limited", retryAfter(response));
      // Preserve provider configuration codes internally, never the response text.
      const detail = await response.clone().text();
      throw classifyFailure({ status: response.status, message: detail });
    } catch (error) {
      if (signal?.aborted || init?.signal?.aborted) throw new ProviderFailure("request_cancelled");
      throw classifyFailure(error);
    }
  };
}

export function assertMcpResult(result: CallToolResult): void {
  if ("toolResult" in result) return;
  if (result.isError) {
    const detail = result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    throw classifyFailure({ message: detail });
  }
}

export function mcpText(result: CallToolResult): string {
  return "toolResult" in result ? JSON.stringify(result.toolResult)
    : result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

export async function withMcpClient<T>(
  url: string, token: string, signal: AbortSignal | undefined,
  run: (client: MCPClient) => Promise<T>, headers: Record<string, string> = {},
): Promise<T> {
  let client: MCPClient | undefined;
  try {
    client = await createMCPClient({
      clientName: "vee",
      maxRetries: 0,
      protocolVersionDiscovery: false,
      initializationOptions: { signal, timeout: REQUEST_TIMEOUT_MS },
      transport: { type: "http", url, headers: { ...headers, Authorization: `Bearer ${token}` }, fetch: providerFetch(signal) },
    });
    return await run(client);
  } catch (error) {
    throw classifyFailure(error);
  } finally {
    // A failed session-close request must not turn a completed write into a retry.
    await client?.close().catch(() => undefined);
  }
}

export async function callMcpRead(url: string, token: string, name: string, args: Record<string, unknown>, signal?: AbortSignal, requiredArguments: string[] = []): Promise<CallToolResult> {
  return retryRead(() => withMcpClient(url, token, signal, async (client) => {
    if (requiredArguments.length) {
      const tools = await client.listTools({ options: { signal, timeout: REQUEST_TIMEOUT_MS } });
      const schema = tools.tools.find((tool) => tool.name === name)?.inputSchema;
      if (!schema?.properties || requiredArguments.some((arg) => !Object.hasOwn(schema.properties!, arg))) {
        throw new ProviderFailure("provider_configuration");
      }
    }
    const result = await client.callTool({ name, arguments: args, options: { signal, timeout: REQUEST_TIMEOUT_MS } });
    assertMcpResult(result);
    return result;
  }), signal);
}
