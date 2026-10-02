import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { crew } from "./crew.ts";

// The rows of spec/CONFORMANCE.md, Delivery, that need a reader with turns: the whole plugin, over a stand-in for
// Paseo in which an agent made or sent words is inside a turn until the test ends it.

type Crew = Awaited<ReturnType<typeof crew>>;
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

/** A lane's owner inside its first turn, under a root's owner between turns: the mailbox is the lane owner's. */
async function lane() {
  const c = await crew();
  plugins.push(c.plugin);
  c.paseo.gate.turns = true;
  const chief = await c.tools(0);
  const brief = { goal: { text: "Lane" }, kind: "verification" };
  assert.ok((await chief.call("open_scope", { parent: "root", role: "keeper", paths: ["src/"], brief })).ok);
  await c.plugin.idle();
  const keeper = await c.tools(1);
  return { c, chief, keeper, host: c.paseo.created[1]!.host };
}

/** The reader's turn ends: Paseo knows it, and tells the plugin with its hook. */
async function turnEnds(c: Crew, host: string, plugin: Plugin = c.plugin): Promise<void> {
  c.paseo.endTurn(host);
  await plugin.turnEnded(host, { kind: "completed" }, []);
  await plugin.idle();
}

/** A tool call that must be taken, with what it set going settled. */
async function said(c: Crew, who: Awaited<ReturnType<Crew["tools"]>>, to: string, text: string, asks = true) {
  const reply = await who.call("send_message", { to, text, asks });
  assert.ok(reply.ok, reply.text);
  await c.plugin.idle();
}

test("five writers send to their owner above during its turn: one numbered delivery when the turn ends, in the order sent", async () => {
  const { c, keeper, host } = await lane();
  const makers = [];
  for (const dir of ["a", "b", "c", "d", "e"]) {
    const brief = { goal: { text: dir }, kind: "verification" };
    const opened = await keeper.call("open_scope", { parent: "1", role: "maker", paths: [`src/${dir}/`], brief });
    assert.ok(opened.ok, opened.text);
    await c.plugin.idle();
    makers.push(await c.tools(c.paseo.created.length - 1));
  }
  for (const [n, maker] of makers.entries()) await said(c, maker, "a2", `From maker ${n + 1}`);
  assert.deepEqual(c.told(1), [], "nothing lands inside the reader's turn");

  await turnEnds(c, host);
  assert.equal(c.told(1).length, 1, "everything queued goes as one");
  assert.deepEqual(
    [...c.told(1)[0]!.matchAll(/^(\d) of 5 · m\d+ from (a\d)/gm)].map((m) => `${m[1]}:${m[2]}`),
    ["1:a3", "2:a4", "3:a5", "4:a6", "5:a7"],
    "numbered, oldest first, each with who sent it",
  );
  for (const t of [keeper, ...makers]) t.close();
});

test("a delivery refused as busy is sent at the next turn's end, once; what asks nothing waits for one that asks", async () => {
  const { c, chief, keeper, host } = await lane();
  await said(c, chief, "a2", "How far is the lane?");
  assert.deepEqual(c.told(1), [], "its reader is inside its first turn");
  await turnEnds(c, host);
  assert.equal(c.told(1).length, 1);
  await turnEnds(c, host);
  assert.equal(c.told(1).length, 1, "sent once: another turn's end sends nothing again");

  await said(c, chief, "a2", "For what it is worth, the base moved", false);
  assert.equal(c.told(1).length, 1, "a reader between turns is not woken for what asks nothing");
  await said(c, chief, "a2", "Will you take it in?");
  assert.equal(c.told(1).length, 2, "it goes with the next delivery that asks, and wakes it at once");
  assert.match(
    c.told(1)[1]!,
    /^1 of 2 · m\d+ from a1[^]*the base moved\n\n2 of 2 · m\d+ from a1[^]*Will you take it in\?$/,
  );
  for (const t of [chief, keeper]) t.close();
});

test("a queue longer than one delivery holds goes as several, one at each turn's end, in order and nothing cut", async () => {
  const { c, chief, keeper, host } = await lane();
  const long = (n: number) => `Part ${n}: ${"x".repeat(19_000)} end of part ${n}`;
  for (const n of [1, 2, 3, 4, 5]) await said(c, chief, "a2", long(n));
  await turnEnds(c, host);
  assert.equal(c.told(1).length, 1, "one delivery, and the reader is inside the turn it began");
  const first = c.told(1)[0]!;
  assert.ok(first.length <= 60_000, `a delivery stays under what one holds: ${first.length}`);
  assert.match(first, /^1 of 3 · /, "as many as fit, whole");
  assert.match(first, /\n\n2 more wait, and are sent when this turn ends\.$/);

  await turnEnds(c, host);
  assert.equal(c.told(1).length, 2);
  await turnEnds(c, host);
  assert.equal(c.told(1).length, 2, "and then nothing is left");
  const all = c.told(1).join("\n");
  assert.deepEqual(
    [...all.matchAll(/Part (\d): x+ end of part (\d)/g)].map((m) => `${m[1]}${m[2]}`),
    ["11", "22", "33", "44", "55"],
    "every message whole, in the order sent",
  );
  for (const t of [chief, keeper]) t.close();
});

test("messages queued when the plugin stops are delivered once it is back and their reader's turn ends", async () => {
  const { c, chief, keeper, host } = await lane();
  await said(c, chief, "a2", "First");
  await said(c, chief, "a2", "Second");
  for (const t of [chief, keeper]) t.close();
  await c.plugin.dispose();

  const again = new Plugin(c.root);
  plugins.push(again);
  again.saw(c.paseo.api);
  await again.whenReady();
  await again.idle();
  assert.deepEqual(c.told(1), [], "its reader is still inside its turn");
  await turnEnds(c, host, again);
  assert.equal(c.told(1).length, 1);
  assert.match(c.told(1)[0]!, /^1 of 2 · [^]*\nFirst\n\n2 of 2 · [^]*\nSecond$/);
});
