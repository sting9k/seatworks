import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import { parseBody } from "../../shared/contracts/commands.ts";
import { stuckOf } from "../../shared/views/stuck.ts";
import { Dispatcher } from "../../server/bridge/dispatcher.ts";
import { Project } from "../../server/bridge/project.ts";
import { ProjectStore } from "../../server/satellites/store/project-store.ts";
import { slpProfile, team } from "../kernel/ledger.ts";
import { recordingHandlers } from "./fakes.ts";

test("an effect that keeps throwing shows as stuck, with its tries, then with its error once given up", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const store = new ProjectStore(join(mkdtempSync(join(tmpdir(), "sw-stuck-")), "project.db"));
    const project = Project.open("p", store, slpProfile());
    const { handlers } = recordingHandlers((e) => {
      if (e.kind === "workspace.create") throw new Error("disk full");
      return { status: "done" };
    });
    const dispatcher = new Dispatcher(project, store, handlers, () => false);
    const parsed = parseBody("open_project", { base: "main", profile: "slp", profileHash: "h", model: "m" });
    assert.ok(parsed.ok);
    await project.submit({ id: "c1", at: "2026-09-30T00:00:00.000Z", caller: { kind: "human" }, body: parsed.body });
    const stuck = () => stuckOf(project.view, store.pending(), store.abandoned(), slpProfile());
    assert.deepEqual(stuck(), []);

    dispatcher.kick();
    await dispatcher.idle();
    assert.deepEqual(stuck(), ["Effect 2:workspace (workspace.create) has thrown 1 time and is tried again."]);

    for (let pause = 1000; pause <= 8000; pause *= 2) {
      mock.timers.tick(pause);
      await dispatcher.idle();
    }
    assert.deepEqual(stuck(), ["Effect 2:workspace (workspace.create) was given up: Error: disk full"]);
    dispatcher.dispose();
    project.dispose();
  } finally {
    mock.timers.reset();
  }
});

test("an empty seat in an open scope, and words queued for an agent that never started, show as stuck", () => {
  const { ledger, supervisor, lead, task } = team();
  ledger.must(ledger.fact("record_agent", { actor: supervisor, host: "h-supervisor" }));
  ledger.must(ledger.fact("record_agent", { actor: lead, host: "h-lead" }));
  const pending = () => ledger.effects.map((e, i) => ({ ...e, seq: i, attempts: 0 }));
  ledger.must(ledger.as(lead, "send_message", { to: "a3", text: "Why int16?", asks: true }));
  assert.deepEqual(stuckOf(ledger.state, pending(), [], ledger.profile), [
    "a3 is seated on scope 1.1 with no agent yet: 1 delivery waits for it.",
  ]);

  ledger.must(ledger.as(lead, "release", { actor: "a3", reason: "done for now" }));
  assert.deepEqual(stuckOf(ledger.state, pending(), [], ledger.profile), [
    `Scope ${task} is open with nobody seated; its parent's owner is a2.`,
  ]);
});

test("an actor seated in a role the project's profile no longer has shows as stuck, by its seat", () => {
  const { ledger, lead } = team();
  const without = {
    roles: new Map([...ledger.profile.roles].filter(([name]) => name !== "lead")),
    root: ledger.profile.root,
  };

  assert.deepEqual(stuckOf(ledger.state, [], [], ledger.profile), []);
  assert.deepEqual(stuckOf(ledger.state, [], [], without), [
    `${lead} is seated on scope 1 in a role the project's profile no longer has; its tools are refused until the profile has the role again or the seat is released.`,
  ]);
});
