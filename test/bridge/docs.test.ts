import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

// Each case is a row of spec/CONFORMANCE.md: what the record holds reaches the repository once, when the team goes.

test("the plugin commits nothing of the record on the base while a team runs, and leaves its map there when the project is removed", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sw-docs-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const plugin = new Plugin(stateRoot());
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  const attached = git("rev-parse", "main");

  const supervisor = await agentTools(socketPath, paseo.created[0]!.env);
  const set = await supervisor.call("set_plan", {
    scope: "root",
    plan: {
      goal: { text: "A chess club site members book matches on" },
      limits: [{ text: "No accounts beyond the club's members" }],
      unknowns: [{ line: { text: "How many play at once" }, check: "the club's own count" }],
      appetite: { line: { text: "Two weeks" } },
      terms: [{ name: "Match", line: { text: "One game between two members, booked ahead" }, avoid: ["Game"] }],
    },
  });
  assert.ok(set.ok, set.text);
  await plugin.idle();
  assert.equal(git("rev-parse", "main"), attached, "a plan and its words move nothing on the base");
  supervisor.close();

  const theirs = join(repo, "docs/seatworks/MAP.md");
  mkdirSync(join(theirs, ".."), { recursive: true });
  writeFileSync(theirs, "The Human's own notes.\n");
  const whole = (await plugin.leftovers()).find((l) => l.kind === "project");
  assert.ok(whole);
  const held = await plugin.clean([whole.id]);
  assert.equal(held[0]?.ok, false, "a file of the Human's where the map would go is never written over");
  assert.match(held[0].text, /docs\/seatworks\/MAP\.md has uncommitted changes/);
  assert.equal(git("rev-parse", "main"), attached, "and nothing was written: the note is still there");

  rmSync(theirs);
  const removed = await plugin.clean([whole.id]);
  assert.ok(removed[0]?.ok, removed[0]?.text);
  const map = git("show", "main:docs/seatworks/MAP.md");
  assert.match(map, /## Destination\n\nA chess club site members book matches on/);
  assert.match(map, /How many play at once; checked by the club's own count/);
  assert.match(
    map,
    /## Chosen so far, open to question on evidence\n\n- No accounts beyond the club's members \(a1\)/,
    "a limit the team chose is listed as its choice, not as one the Human set",
  );
  assert.match(
    map,
    /## Words settled\n\n\*\*Match\*\*:\nOne game between two members, booked ahead \(a1\)\n_Avoid_: Game/,
  );
  assert.equal(git("show", "--name-only", "--format=", "main~1"), "docs/seatworks/MAP.md", "in a commit of its own");
  assert.equal(git("show", "--name-only", "--format=", "main"), "AGENTS.md", "before the note is taken out");
  assert.equal(git("status", "--porcelain"), "", "the checkout follows, clean");
});
