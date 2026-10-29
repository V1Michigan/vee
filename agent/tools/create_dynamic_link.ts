import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { dynamicLinkSchema, type DynamicLink } from "../lib/dynamic-link-schema.js";
import { requestDynamicLinks } from "../lib/dynamic-links-api.js";

const inputSchema = z.object({
  name: z.string().trim().min(1).describe("Unique name for the dynamic link."),
  link: z.url().describe("The destination URL for this dynamic link."),
  imageUrl: z
    .url()
    .optional()
    .describe("Optional image URL associated with the link."),
});

const outputSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("created"), dynamicLink: dynamicLinkSchema }),
  z.object({ status: z.literal("already_exists"), dynamicLink: dynamicLinkSchema }),
]);

export default defineTool({
  description:
    "Create a new dynamic link with a unique name, destination URL, and optional image URL. An explicit user request authorizes creation without a separate approval step. This tool never intentionally replaces an existing link: if the name is already in use, return the existing link and ask whether the user wants to update it.",
  inputSchema,
  outputSchema,
  approval: never(),
  async execute({ name, link, imageUrl }, ctx) {
    const existing = await requestDynamicLinks<DynamicLink[]>({
      method: "GET",
      name,
      signal: ctx.abortSignal,
    });

    if (existing.some((row) => row.name === name)) {
      const existingLink = existing.find((row) => row.name === name)!;
      return outputSchema.parse({
        status: "already_exists",
        dynamicLink: existingLink,
      });
    }

    const created = await requestDynamicLinks<DynamicLink[]>({
      method: "POST",
      body: {
        name,
        link,
        ...(imageUrl === undefined ? {} : { image_url: imageUrl }),
      },
      signal: ctx.abortSignal,
    });

    const dynamicLink = created[0];
    if (!dynamicLink) {
      throw new Error("The dynamic links API did not return the created link.");
    }

    return outputSchema.parse({ status: "created", dynamicLink });
  },
});
