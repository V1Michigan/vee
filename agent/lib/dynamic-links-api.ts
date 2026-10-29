const DYNAMIC_LINKS_API_URL =
  "https://xxlvdpgngmcvkzcsatuz.supabase.co/functions/v1/dynamic-links-api";

export type DynamicLinksRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  name?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function requestDynamicLinks<T>(
  options: DynamicLinksRequestOptions,
): Promise<T> {
  const token = process.env.DYNAMIC_LINKS_API_TOKEN;

  if (!token) {
    throw new Error(
      "Dynamic links access is not configured. Set DYNAMIC_LINKS_API_TOKEN in Vee's server environment.",
    );
  }
  const url = new URL(DYNAMIC_LINKS_API_URL);

  if (options.name !== undefined) {
    url.searchParams.set("name", options.name);
  }

  const headers = new Headers({
    Authorization: `Bearer ${token}`,
  });
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      signal: options.signal,
    });
  } catch (error) {
    throw new Error("Could not reach the dynamic links API.", { cause: error });
  }

  const responseText = await response.text();
  let payload: unknown;
  try {
    payload = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const apiMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : undefined;
    const message =
      response.status === 401
        ? "The dynamic links API rejected Vee's token. Check DYNAMIC_LINKS_API_TOKEN."
        : response.status === 503
          ? "The dynamic links API is not configured yet. Check its Supabase function secrets."
          : apiMessage ?? `The dynamic links API returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}
