import { defineConfig } from "vite";

/** The page imports the shared contracts from the repository above it. */
export default defineConfig({ server: { fs: { allow: [".."] } } });
