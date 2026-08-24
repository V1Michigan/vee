function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value === "" ? undefined : value;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (typeof value === "object") {
    const entries: [string, unknown][] = [];
    for (const [key, item] of Object.entries(value)) {
      const sanitizedItem = sanitizeValue(item);
      if (sanitizedItem !== undefined) {
        entries.push([key, sanitizedItem]);
      }
    }
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  return value;
}

export function sanitizeAgentMailArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = sanitizeValue(args);
  return typeof sanitized === "object" && sanitized !== null
    ? (sanitized as Record<string, unknown>)
    : {};
}
