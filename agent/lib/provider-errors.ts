export type FailureCode =
  | "authorization_required" | "authorization_denied" | "wrong_account"
  | "missing_scope" | "provider_configuration" | "rate_limited"
  | "provider_unavailable" | "request_cancelled" | "invalid_request"
  | "access_denied" | "provider_error" | "outcome_unknown";

const messages: Record<FailureCode, string> = {
  authorization_required: "Authorization is missing, expired, or revoked. Connect this account again.",
  authorization_denied: "Authorization was declined. No provider action was taken.",
  wrong_account: "The connected Slack account does not match the requesting user and V1 workspace. Reauthorize with the correct account.",
  missing_scope: "The provider grant lacks a required permission. Update the connector scopes and authorize again.",
  provider_configuration: "The provider integration is not configured for this operation. A Vee administrator must check the app and connector settings.",
  rate_limited: "The provider is rate limiting requests. Retry later.",
  provider_unavailable: "The provider is temporarily unavailable or timed out. Retrieval could not be verified.",
  request_cancelled: "The request was cancelled.",
  invalid_request: "The provider rejected the request parameters. Correct the request before retrying.",
  access_denied: "This requester or conversation is not permitted to perform this operation.",
  provider_error: "The provider returned an unexpected response. An administrator can investigate using the service and failure code.",
  outcome_unknown: "The write may have reached the provider, but its outcome is unknown. Check the destination before proposing another write. Vee did not retry it.",
};

/** Safe to put in model results, logs, and diagnostic output. Never keeps a cause. */
export class ProviderFailure extends Error {
  readonly code: FailureCode;
  readonly retryAfterMs?: number;
  constructor(code: FailureCode, retryAfterMs?: number) {
    super(`${code}: ${messages[code]}`);
    this.name = "ProviderFailure";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function classifyFailure(error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  const value = error as { code?: unknown; name?: unknown; message?: unknown; status?: unknown; statusCode?: unknown } | null;
  // Inspect only to classify. Raw provider text can contain tokens and private records.
  const detail = [value?.code, value?.name, value?.message].filter((v) => typeof v === "string").join(" ").toLowerCase();
  const status = value?.status ?? value?.statusCode;
  if (/not enabled for slack mcp|app.*not.*enabled|invalid_client|connector_not_found|not_installed|app_not_configured/.test(detail)) return new ProviderFailure("provider_configuration");
  if (/missing_scope|insufficient_scope|not_allowed_token_type/.test(detail)) return new ProviderFailure("missing_scope");
  if (/authorization_denied|consent_denied|access_denied.*consent/.test(detail)) return new ProviderFailure("authorization_denied");
  if (status === 401 || /unauthorized|invalid_auth|token_revoked|token_expired|not_authed|no_token|user_authorization_required/.test(detail)) return new ProviderFailure("authorization_required");
  if (status === 429 || /ratelimited|rate_limited|rate.limit/.test(detail)) return new ProviderFailure("rate_limited");
  if (status === 403 || /access_denied|channel_not_found|not_in_channel|restricted_action/.test(detail)) return new ProviderFailure("access_denied");
  if (/aborterror/.test(detail)) return new ProviderFailure("request_cancelled");
  if (typeof status === "number" && status >= 500 || /timeout|timed out|fetch failed|econnreset|econnrefused|service_unavailable|internal_error/.test(detail)) return new ProviderFailure("provider_unavailable");
  if (status === 400 || /invalid[_ -](params|arguments|request)/.test(detail)) return new ProviderFailure("invalid_request");
  return new ProviderFailure("provider_error");
}
