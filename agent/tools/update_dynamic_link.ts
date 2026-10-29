import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { dynamicLinkSchema, type DynamicLink } from "../lib/dynamic-link-schema.js";
import { requestDynamicLinks } from "../lib/dynamic-links-api.js";

const inputSchema = z
  .object({
    name: z.string().trim().min(1).describe("Name of the existing dynamic link."),
    link: z.url().optional().describe("Replacement destination URL."),
    imageUrl: z
      .url()
      .nullable()
      .optional()
      .describe("Replacement image URL, or null to clear the image."),
  })
  .refine(
    ({ link, imageUrl }) => link !== undefined || imageUrl !== undefined,
    "Provide a new link URL and/or image URL.",
  );

const outputSchema = z.object({
  updated: z.literal(true),
  dynamicLink: dynamicLinkSchema,
});

export default defineTool({
  description:
    "Update the destination URL and/or image URL of an existing dynamic link. Use this when the user explicitly asks to change the link or confirms an update after a name conflict. The tool requires approval before execution.",
  inputSchema,
  outputSchema,
  approval: always(),
  async execute({ name, link, imageUrl }, ctx) {
    const updated = await requestDynamicLinks<DynamicLink[]>({
      method: "PATCH",
      name,
      body: {
        ...(link === undefined ? {} : { link }),
        ...(imageUrl === undefined ? {} : { image_url: imageUrl }),
      },
      signal: ctx.abortSignal,
    });

    const dynamicLink = updated[0];
    if (!dynamicLink) {
      throw new Error(`No dynamic link named "${name}" exists to update.`);
    }

    return outputSchema.parse({ updated: true, dynamicLink });
  },
});
