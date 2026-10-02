import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import type { Caller } from "../../shared/contracts/commands.ts";
import { parseBody } from "../../shared/contracts/commands.ts";
import { Dispatcher } from "../../server/bridge/dispatcher.ts";
import { Project } from "../../server/bridge/project.ts";
import { ProjectStore } from "../../server/satellites/store/project-store.ts";
import { slpProfile } from "../kernel/ledger.ts";
import { recordingHandlers } from "./fakes.ts";

const profile = slpProfile();
let n = 0;
const command = (caller: Caller, type: string, args: Record<string, unknown>, id = `c${++n}`) => {
  const parsed = parseBody(type, args);
  if (!parsed.ok) throw new Error(parsed.says);
  return { id, at: new Date(Date.UTC(2026, 8, 29, 0, 0, n)).toISOString(), caller, body: parsed.body };
};
const human: Caller = { kind: "human" };

function fresh() {
  const file = join(mkdtempSync(join(tmpdir(), "sw-store-")), "project.db");
  return { file, store: new ProjectStore(file) };
}

test("a restart folds the same state from the log, and again with every snapshot gone", async () => {
  const { file, store } = fresh();
  const project = Project.open("p", store, profile);
  await project.submit(command(human, "open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" }));
  await project.submit(command({ kind: "bridge" }, "record_workspace", { scope: "root", ok: true, branch: "main" }));
  const before = project.view;
  project.dispose();

  const again = Project.open("p", new ProjectStore(file), profile);
  assert.deepEqual(again.view, before);
  again.dispose();
});

test("a command retried with the same id gets its earlier result and appends nothing", async () => {
  const { store } = fresh();
  const project = Project.open("p", store, profile);
  const open = command(human, "open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" });
  const first = await project.submit(open);
  const second = await project.submit(open);
  assert.ok(first.ok && second.ok);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.events, first.events);
  assert.equal(store.seq(), first.events.length);
  project.dispose();
});

test("an effect committed but not dispatched before a crash is dispatched once on restart", async () => {
  const { file, store } = fresh();
  const project = Project.open("p", store, profile);
  await project.submit(command(human, "open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" }));
  assert.equal(store.pending().length, 1, "workspace.create waits in the outbox");
  project.dispose();

  const reopened = new ProjectStore(file);
  const again = Project.open("p", reopened, profile);
  const { handlers, asked } = recordingHandlers((e) =>
    e.kind === "workspace.create"
      ? {
          status: "done",
          facts: [{ type: "record_workspace", scope: e.scope, ok: true, branch: "main", head: null, why: null }],
        }
      : { status: "done" },
  );
  const dispatcher = new Dispatcher(again, reopened, handlers, () => false);
  again.onCommitted(() => {
    dispatcher.kick();
  });
  dispatcher.kick();
  await dispatcher.idle();
  await dispatcher.idle();
  assert.deepEqual(
    asked.map((e) => e.kind),
    ["workspace.create", "agent.create"],
  );
  dispatcher.kick();
  await dispatcher.idle();
  assert.equal(asked.length, 2, "nothing twice");
  assert.equal(again.view.scopes.get("root")?.workspace, "ready");
  dispatcher.dispose();
  again.dispose();
});

test("a fact delivered twice is recorded once", async () => {
  const { store } = fresh();
  const project = Project.open("p", store, profile);
  await project.submit(command(human, "open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" }));
  const fact = command(
    { kind: "bridge" },
    "record_workspace",
    { scope: "root", ok: true, branch: "main" },
    "fact:1:workspace:0",
  );
  await project.submit(fact);
  const seq = store.seq();
  await project.submit(fact);
  assert.equal(store.seq(), seq);
  project.dispose();
});

test("while the machine is held, effects that load it wait, and start when the hold lifts", async () => {
  const { store } = fresh();
  const project = Project.open("p", store, profile);
  let held = true;
  const { handlers, asked } = recordingHandlers();
  const dispatcher = new Dispatcher(project, store, handlers, () => held);
  await project.submit(command(human, "open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" }));
  dispatcher.kick();
  await dispatcher.idle();
  assert.equal(asked.length, 0);
  held = false;
  dispatcher.kick();
  await dispatcher.idle();
  assert.deepEqual(
    asked.map((e) => e.kind),
    ["workspace.create"],
  );
  dispatcher.dispose();
  project.dispose();
});

test("a settled effect's row is let go after a week, and only then", () => {
  const { store } = fresh();
  const at = Date.UTC(2026, 8, 1);
  store.append(
    [{ type: "checks_set", checks: [], seq: 1, at: "", by: "human", commandId: "c" }],
    [{ key: "1:x", body: { kind: "machine.hold", actor: "a1", hold: true } }],
    0,
  );
  store.settle("1:x", "done", null, new Date(at).toISOString());
  assert.equal(store.sweep(at + 6 * 24 * 3600 * 1000), 0);
  assert.equal(store.sweep(at + 8 * 24 * 3600 * 1000), 1);
  store.close();
});

test("an effect that waits is tried again only after a change, never spun on while others finish", async () => {
  const { store } = fresh();
  const project = Project.open("p", store, profile);
  let tries = 0;
  const { handlers } = recordingHandlers((e) => {
    if (e.kind === "workspace.create") {
      tries += 1;
      return { status: "wait" };
    }
    return { status: "done" };
  });
  const dispatcher = new Dispatcher(project, store, handlers, () => false);
  await project.submit(command(human, "open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" }));
  dispatcher.kick();
  await dispatcher.idle();
  store.append(
    [{ type: "checks_set", checks: [], seq: store.seq() + 1, at: "", by: "human", commandId: "x" }],
    [{ key: "99:machine", body: { kind: "machine.hold", actor: "a1", hold: true } }],
    store.seq(),
  );
  dispatcher.kick("freed");
  await dispatcher.idle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(tries, 1, "a freed channel does not retry what waits");
  dispatcher.kick();
  await dispatcher.idle();
  assert.equal(tries, 2, "a change does");
  dispatcher.dispose();
  project.dispose();
});

test("an effect whose satellite threw is tried again after its pause, with no change to wake it", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { store } = fresh();
    const project = Project.open("p", store, profile);
    let tries = 0;
    const { handlers } = recordingHandlers((e) => {
      if (e.kind === "workspace.create" && ++tries === 1) throw new Error("connection lost");
      return { status: "done" };
    });
    const dispatcher = new Dispatcher(project, store, handlers, () => false);
    await project.submit(
      command(human, "open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" }),
    );
    dispatcher.kick();
    await dispatcher.idle();
    assert.equal(tries, 1);
    mock.timers.tick(1000);
    await dispatcher.idle();
    assert.equal(tries, 2);
    dispatcher.dispose();
    project.dispose();
  } finally {
    mock.timers.reset();
  }
});
