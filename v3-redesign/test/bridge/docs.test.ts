import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

test("the glossary and the map are written from the record into the repository, beside what others wrote there", async () => {
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
  const plugin = new Plugin(mkdtempSync(join(tmpdir(), "sw-root-")));
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  await plugin.openProject(repo, "main");
  await plugin.idle();
  assert.throws(() => git("show", "main:GLOSSARY.md"), "no glossary before a word is settled");

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
  const glossary = git("show", "main:GLOSSARY.md");
  assert.match(glossary, /\*\*Match\*\*:\nOne game between two members, booked ahead \(a1\)\n_Avoid_: Game/);
  const map = git("show", "main:docs/seatworks/MAP.md");
  assert.match(map, /## Destination\n\nA chess club site members book matches on/);
  assert.match(map, /How many play at once; checked by the club's own count/);
  assert.match(
    map,
    /## Chosen so far, open to question on evidence\n\n- No accounts beyond the club's members \(a1\)/,
    "a limit the team chose is listed as its choice, not as one the Human set",
  );

  writeFileSync(join(repo, "GLOSSARY.md"), `${glossary}\n\n**Ladder**:\nThe club's ranking, written by hand.\n`);
  git("commit", "-q", "-am", "a word of our own");
  const amended = await supervisor.call("amend_plan", {
    scope: "root",
    add: [{ section: "terms", term: "Booking", text: "A match placed on the calendar", avoid: ["Reservation"] }],
    reason: "a word settled",
  });
  assert.ok(amended.ok, amended.text);
  await plugin.idle();
  const again = git("show", "main:GLOSSARY.md");
  assert.match(
    again,
    /\*\*Booking\*\*:[^]*\*\*Match\*\*:[^]*<!-- seatworks:end -->/,
    "the settled words, kept together",
  );
  assert.match(again, /\*\*Ladder\*\*:\nThe club's ranking, written by hand\./, "and the word written by hand stays");
  assert.equal(git("status", "--porcelain"), "", "the checkout follows, clean");
  supervisor.close();
});
