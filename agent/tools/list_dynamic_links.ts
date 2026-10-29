import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { dynamicLinkSchema, type DynamicLink } from "../lib/dynamic-link-schema.js";
import { requestDynamicLinks } from "../lib/dynamic-links-api.js";

const inputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional exact name of the dynamic link to look up."),
});

const outputSchema = z.object({
  dynamicLinks: z.array(dynamicLinkSchema),
});

export default defineTool({
  description:
    "List dynamic links, or look up a dynamic link by its exact name. This is read-only.",
  inputSchema,
  outputSchema,
  approval: never(),
  async execute({ name }, ctx) {
    const dynamicLinks = await requestDynamicLinks<DynamicLink[]>({
      method: "GET",
      name,
      signal: ctx.abortSignal,
    });

    return outputSchema.parse({ dynamicLinks });
  },
});
