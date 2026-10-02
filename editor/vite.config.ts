import { defineConfig } from "vite";

/** The page imports the shared contracts from the repository above it, and is served from any path once built. */
export default defineConfig({ base: "./", server: { fs: { allow: [".."] } } });
