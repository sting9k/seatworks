import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import type { Plugin } from "../../server/bridge/plugin.ts";
import { INTO_TURN } from "../../shared/contracts/delivery.ts";
import { crew } from "./crew.ts";

// The rows of spec/CONFORMANCE.md, Into a turn: the whole plugin over a stand-in for Paseo in which an agent is inside
// a turn until the test ends it. Its hook is the line an agent's process holds to the plugin, asking for mail.

type Crew = Awaited<ReturnType<typeof crew>>;
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

/** A lane's owner inside its first turn, with one maker under it inside its own, in a template that lets mail in. */
async function team(intoTurn: string | null) {
  const c = await crew(intoTurn === null ? "" : `intoTurn: ${intoTurn}\n`);
  plugins.push(c.plugin);
  c.paseo.gate.turns = true;
  const chief = await c.tools(0);
  const brief = { goal: { text: "Lane" }, kind: "verification" };
  assert.ok((await chief.call("open_scope", { parent: "root", role: "keeper", paths: ["src/"], brief })).ok);
  await c.plugin.idle();
  const keeper = await c.tools(1);
  assert.ok((await keeper.call("open_scope", { parent: "1", role: "maker", paths: ["src/a/"], brief })).ok);
  await c.plugin.idle();
  const maker = await c.tools(2);
  return { c, chief, keeper, maker };
}

async function says(c: Crew, who: Awaited<ReturnType<Crew["tools"]>>, message: Record<string, unknown>) {
  const reply = await who.call("send_message", message);
  assert.ok(reply.ok, reply.text);
  await c.plugin.idle();
}

async function turnEnds(c: Crew, nth: number, kind: "completed" | "failed" = "completed") {
  const host = c.paseo.created[nth]!.host;
  c.paseo.endTurn(host);
  await c.plugin.turnEnded(host, kind === "completed" ? { kind } : { kind, error: { message: "overloaded" } }, []);
  await c.plugin.idle();
}

/** The messages the record has as delivered, by their ids, in the order they were. */
function delivered(c: Crew): string[] {
  const db = new DatabaseSync(join(c.root, "projects", c.project, "ledger.db"), { readOnly: true });
  try {
    const rows = db.prepare("SELECT payload FROM events WHERE type = 'message_delivered' ORDER BY seq").all();
    return rows.map((row) => (JSON.parse(String(row.payload)) as { message: string }).message);
  } finally {
    db.close();
  }
}

test("a direction from the owner above enters its reader's turn at its next step, once, and is delivered from then on", async () => {
  const { c, keeper, maker } = await team("{ patience: 3600, rest: 3600 }");
  const flag = c.paseo.created[2]!.env.SEATWORKS_MAIL!;
  assert.equal(existsSync(flag) ? readFileSync(flag, "utf8") : "", "", "nothing waits for it yet");
  assert.equal(await maker.mail(), "", "and its hook is handed nothing");

  await says(c, keeper, { to: "a3", text: "Stop the stand-in: use the real parser.", directs: true });
  assert.equal(readFileSync(flag, "utf8"), "1\n", "its hook is told something waits");
  const mail = await maker.mail();
  assert.ok(mail.startsWith(INTO_TURN), mail);
  assert.match(mail, /m1 from a2 \(keeper, scope 1\) · it directs\nStop the stand-in: use the real parser\.$/);
  assert.equal(readFileSync(flag, "utf8"), "", "and nothing more waits");
  assert.equal(await maker.mail(), "", "it enters once");
  assert.deepEqual(
    [c.told(2), delivered(c)],
    [[], ["m1"]],
    "nothing went through Paseo, and it is delivered from then on",
  );

  // Paseo has the reader between turns before its hook has reached the plugin, and more mail comes for it meanwhile.
  const host = c.paseo.created[2]!.host;
  c.paseo.endTurn(host);
  await says(c, keeper, { to: "a3", text: "The charset is UTF-8, is that right?", asks: true });
  assert.equal(c.told(2).length, 1, "the new mail goes to the reader between turns");
  assert.doesNotMatch(c.told(2)[0]!, /Stop the stand-in/, "and what entered its turn is not sent again with it");

  await c.plugin.turnEnded(host, { kind: "completed" }, []);
  await c.plugin.idle();
  assert.equal(c.told(2).length, 1, "nor when the turn's end is heard");
  assert.deepEqual(delivered(c), ["m1", "m2"]);
  for (const tools of [keeper, maker]) tools.close();
});

test("a Claude agent's hook, run between two of its steps as Claude Code runs it, hands the mail over as context for the next step and says nothing while none waits", async () => {
  const { c, keeper, maker } = await team("{ patience: 0, rest: 0 }");
  const made = c.paseo.created[2]!;
  const plugin = String((made.config.options?.extraArgs as Record<string, string>)["plugin-dir"]);
  const hooks = JSON.parse(readFileSync(join(plugin, "hooks", "hooks.json"), "utf8")) as {
    hooks: { PostToolBatch: { hooks: { command: string }[] }[] };
  };
  const command = hooks.hooks.PostToolBatch[0]!.hooks[0]!.command;
  // Never blocking: the plugin that answers the hook runs in this very process.
  const hook = async () =>
    (await promisify(execFile)("/bin/sh", ["-c", command], { env: { ...process.env, ...made.env } })).stdout;

  assert.equal(await hook(), "", "silent while nothing waits");
  await says(c, keeper, { to: "a3", text: "Use the real parser.", directs: true });
  const said = JSON.parse(await hook()) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  assert.equal(said.hookSpecificOutput.hookEventName, "PostToolBatch");
  assert.ok(said.hookSpecificOutput.additionalContext.startsWith(INTO_TURN));
  assert.match(said.hookSpecificOutput.additionalContext, /it directs\nUse the real parser\.$/);
  assert.equal(await hook(), "", "and once it has entered");
  for (const tools of [keeper, maker]) tools.close();
});

test("a question from below waits out the template's patience, then enters with everything else that would wake; one from above waits for the turn's end", async () => {
  const patient = await team("{ patience: 3600, rest: 0 }");
  await says(patient.c, patient.maker, { to: "a2", text: "Which parser?", asks: true });
  assert.equal(await patient.keeper.mail(), "", "it has not waited long enough");
  await turnEnds(patient.c, 1);
  assert.equal(patient.c.told(1).length, 1, "and goes when the turn ends, as before");

  const { c, chief, keeper, maker } = await team("{ patience: 0, rest: 3600 }");
  await says(c, maker, { to: "a2", text: "Which parser?", asks: true });
  await says(c, maker, { to: "a2", text: "And which encoding?", asks: true });
  await says(c, maker, { to: "a2", text: "For what it is worth: the old one is gone.", asks: false });
  await says(c, chief, { to: "a2", text: "How is the lane?", asks: true });
  const mail = await keeper.mail();
  assert.deepEqual(
    [...mail.matchAll(/^(\d) of 2 · (m\d+) from (a\d)/gm)].map((m) => `${m[1]}:${m[2]}:${m[3]}`),
    ["1:m1:a3", "2:m2:a3"],
    "the two questions from below as one, numbered, oldest first",
  );
  assert.doesNotMatch(
    mail,
    /old one is gone|How is the lane/,
    "what asks nothing, and a question from above, stay out",
  );

  await says(c, maker, { to: "a2", text: "And the charset?", asks: true });
  assert.equal(await keeper.mail(), "", "after an entry the reader rests");
  await says(c, chief, { to: "a2", text: "Hold the lane: the goal moved.", directs: true });
  assert.match(await keeper.mail(), /m6 from a1 .* it directs/, "a direction does not wait out the rest");

  await turnEnds(c, 1);
  assert.equal(c.told(1).length, 1, "the rest goes as one delivery when the turn ends");
  assert.match(c.told(1)[0]!, /old one is gone[\s\S]*How is the lane/);
  assert.doesNotMatch(c.told(1)[0]!, /Which parser|Hold the lane/, "without what already entered");
  for (const tools of [chief, keeper, maker, patient.chief, patient.keeper, patient.maker]) tools.close();
});

test("mail that entered a turn is read: a turn that fails after is not sent it again", async () => {
  const { c, keeper, maker } = await team("{ patience: 0, rest: 0 }");
  await says(c, keeper, { to: "a3", text: "Use the real parser.", directs: true });
  assert.match(await maker.mail(), /Use the real parser/);

  await turnEnds(c, 2, "failed");
  assert.equal(
    c.told(2).filter((text) => text.includes("Use the real parser")).length,
    0,
    "it is in the reader's own history, which the turn started again has",
  );
  for (const tools of [keeper, maker]) tools.close();
});

test("a seat that ends within the turn mail entered leaves none of it to move to the owner above", async () => {
  const { c, keeper, maker } = await team("{ patience: 0, rest: 0 }");
  await says(c, keeper, { to: "a3", text: "Use the real parser.", directs: true });
  assert.match(await maker.mail(), /Use the real parser/);

  // Its scope ends while its turn is still open, as a task taken in seconds after its hand-back.
  assert.ok((await keeper.call("drop_scope", { scope: "1.1", reason: "no longer needed" })).ok);
  await c.plugin.idle();
  await turnEnds(c, 1);
  assert.equal(
    c.told(1).filter((text) => text.includes("Use the real parser")).length,
    0,
    "the owner above is not handed, as unread, what its reader had already been given",
  );
  for (const tools of [keeper, maker]) tools.close();
});

test("a template that names no entry into a turn lets nothing in: everything waits for the turn's end", async () => {
  const { c, keeper, maker } = await team(null);
  assert.equal(c.paseo.created[2]!.env.SEATWORKS_MAIL, undefined, "its agents' hooks are given no file to read");
  assert.match(
    c.paseo.created[2]!.prompt,
    /\n\nNothing sent to you arrives while your turn runs\. To wait for /,
    "and their first words say so",
  );
  await says(c, keeper, { to: "a3", text: "Use the real parser.", directs: true });
  assert.equal(await maker.mail(), "");
  await turnEnds(c, 2);
  assert.equal(c.told(2).length, 1);
  for (const tools of [keeper, maker]) tools.close();
});
