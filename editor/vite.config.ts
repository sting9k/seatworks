import { defineConfig } from "vite";

/** The page reads the shipped profile and the shared contracts from the repository above it. */
export default defineConfig({ server: { fs: { allow: [".."] } } });
