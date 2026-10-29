import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { dynamicLinkSchema, type DynamicLink } from "../lib/dynamic-link-schema.js";
import { requestDynamicLinks } from "../lib/dynamic-links-api.js";

const inputSchema = z.object({
  name: z.string().trim().min(1).describe("Name of the dynamic link to delete."),
});

const outputSchema = z.object({
  deleted: z.literal(true),
  dynamicLink: dynamicLinkSchema,
});

export default defineTool({
  description:
    "Delete an existing dynamic link by its exact name. Use only when the user explicitly asks to delete that link. The tool requires approval before execution.",
  inputSchema,
  outputSchema,
  approval: always(),
  async execute({ name }, ctx) {
    const deleted = await requestDynamicLinks<DynamicLink[]>({
      method: "DELETE",
      name,
      signal: ctx.abortSignal,
    });

    const dynamicLink = deleted[0];
    if (!dynamicLink) {
      throw new Error(`No dynamic link named "${name}" exists to delete.`);
    }

    return outputSchema.parse({ deleted: true, dynamicLink });
  },
});
