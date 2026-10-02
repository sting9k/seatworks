import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { loadBundle } from "../../server/profile/bundle.ts";
import { fakePaseo } from "./fake-paseo.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates.

const pluginDir = join(import.meta.dirname, "../..");
const shipped = join(pluginDir, "profile", "slp");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

/** A copy of the shipped profile to change, in a directory of its own. */
function profileCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "sw-profile-"));
  cpSync(shipped, dir, { recursive: true });
  return dir;
}

test("a profile's hash is of every file that makes its agents do what they do, and of none the plugin does not read", () => {
  const first = profileCopy();
  const sameButForTheGallery = profileCopy();
  writeFileSync(join(sameButForTheGallery, "template.json"), '{ "name": "Another", "description": "x" }\n');
  writeFileSync(join(sameButForTheGallery, "NOTICE.md"), "Drawn from elsewhere.\n");
  assert.equal(loadBundle(sameButForTheGallery).hash, loadBundle(first).hash);

  for (const changed of ["skills/spike/SKILL.md", "reflex.yaml", "watch.yaml", "roles/peer.md"]) {
    const other = profileCopy();
    appendFileSync(join(other, changed), "\n# one more line\n");
    assert.notEqual(loadBundle(other).hash, loadBundle(first).hash, changed);
  }

  const withFileBesideASkill = profileCopy();
  writeFileSync(join(withFileBesideASkill, "skills", "spike", "form.md"), "# The form\n");
  assert.notEqual(loadBundle(withFileBesideASkill).hash, loadBundle(first).hash);
});

test("a profile with a flow and docs of its own: every agent reads the flow after its prompt, and is pointed at each doc", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-flow-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
    });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const root = mkdtempSync(join(tmpdir(), "sw-root-"));
  const own = join(root, "profile");
  cpSync(shipped, own, { recursive: true });
  writeFileSync(join(own, "flow.md"), "# The team's flow\n\n1. **Plan** (lead). Then: Work.\n");
  writeFileSync(
    join(own, "profile.yaml"),
    readFileSync(join(own, "profile.yaml"), "utf8").replace("docs: [docs/adr]", "docs: [docs/adr, docs/research]") +
      "\nflow: flow.md\n",
  );
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();

  const first = paseo.created[0]!;
  assert.match(
    first.systemPrompt,
    /# Supervisor[\s\S]*# The team's flow\n\n1\. \*\*Plan\*\* \(lead\)\. Then: Work\.\n\n## Skills/,
  );
  assert.match(
    first.prompt,
    /The project's docs in your copy: `GLOSSARY\.md`, `docs\/adr`, `docs\/research`, `docs\/seatworks\/MAP\.md`\./,
  );
});
