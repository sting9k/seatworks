import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { type Caller, parseBody } from "../../shared/contracts/commands.ts";
import { scopeRecordText } from "../../shared/views/record.ts";
import { Project } from "../../server/bridge/project.ts";
import { ProjectStore } from "../../server/satellites/store/project-store.ts";
import { command } from "../kernel/arbitrary.ts";
import { TEAM_STEPS, slpProfile } from "../kernel/ledger.ts";

const profile = slpProfile();

test("a scope's record read from the events filed under it says what the whole log says, whatever was done", async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(command, { maxLength: 40 }), async (commands) => {
      const store = new ProjectStore(":memory:");
      const project = Project.open("p", store, profile);
      let n = 0;
      const send = async (caller: Caller, type: string, args: Record<string, unknown>) => {
        const parsed = parseBody(type, args);
        assert.ok(parsed.ok);
        const at = new Date(Date.UTC(2026, 8, 29, 0, 0, ++n)).toISOString();
        return project.submit({ id: `c${n}`, at, caller, body: parsed.body });
      };
      for (const [caller, type, args] of TEAM_STEPS) assert.ok((await send(caller, type, args)).ok);
      for (const c of commands)
        await send(c.who === "bridge" ? { kind: "bridge" } : { kind: "agent", actor: c.who }, c.type, c.args);
      const log = [...store.read(0)];
      const scopes = log.flatMap((e) => (e.type === "scope_opened" ? [e.scope.id] : []));
      for (const scope of scopes)
        assert.equal(
          scopeRecordText(store.about(scope), scope, "above"),
          scopeRecordText(log, scope, "above"),
          `scope ${scope}`,
        );
      project.dispose();
    }),
    { numRuns: 200 },
  );
});
