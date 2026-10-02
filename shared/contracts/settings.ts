import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Whether this machine asks a template's classifier, and the host its key is for: the key goes to no other. */
export const reflexSettings = defineSettings({
  id: "reflex",
  scope: "host",
  version: 1,
  schema: z.object({
    on: z.boolean().default(true),
    host: z.string().trim().toLowerCase().max(253).default(""),
    key: z.string().trim().max(500).default(""),
  }),
});
export type ReflexSettings = z.infer<typeof reflexSettings.schema>;
