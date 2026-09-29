import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Where the reflex asks Jev, and with what key: host-scoped plugin settings, kept by Paseo per installation. The key is
 * never logged or shown back; installing it is the Human's consent to send the record's text to that route.
 */
export const reflexSettings = defineSettings({
  id: "reflex",
  scope: "host",
  version: 1,
  schema: z.object({
    route: z.enum(["openrouter", "typesafe"]).default("openrouter"),
    key: z.string().trim().max(500).default(""),
  }),
});
