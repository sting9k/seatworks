// One check run as the plugin runs it, in a process of its own, for the test that kills that process outright.
import { EvidenceRunner } from "../../server/satellites/evidence/runner.ts";

const [repo = "", scratch = "", commit = "", ...run] = process.argv.slice(2);
await new EvidenceRunner(repo, scratch).run("killed", commit, [{ name: "slow", run }], 600_000, []);
