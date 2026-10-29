import { z } from "zod";

export const dynamicLinkSchema = z.object({
  name: z.string(),
  link: z.string(),
  image_url: z.string().nullable(),
});

export type DynamicLink = z.infer<typeof dynamicLinkSchema>;
