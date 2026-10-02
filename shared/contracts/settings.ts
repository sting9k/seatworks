import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Where the reflex asks Jev and with what key; installing the key is the Human's consent to send text there. */
export const reflexSettings = defineSettings({
  id: "reflex",
  scope: "host",
  version: 1,
  schema: z.object({
    route: z.enum(["openrouter", "typesafe"]).default("openrouter"),
    key: z.string().trim().max(500).default(""),
  }),
});
