import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

// Each case is a row of spec/CONFORMANCE.md, Templates: the copy of its template a project runs, and what changes it.

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

async function started(root: string) {
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  return { plugin, paseo, socketPath };
}

/** A git repository with one commit, for a team to be attached to. */
function repository(): string {
  const repo = mkdtempSync(join(tmpdir(), "sw-repo-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
    });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  return repo;
}

const installed = (root: string, file: string) => join(root, "profiles", "slp", file);
const rewrite = (path: string, change: (text: string) => string) => {
  writeFileSync(path, change(readFileSync(path, "utf8")));
};
/** The installed template's lead prompt given another heading, as the Human would change a prompt after a look back. */
const renameTheLead = (root: string) => {
  rewrite(installed(root, "roles/lead.md"), (text) => text.replace("# Lead", "# Lead, as changed"));
};

type Started = Awaited<ReturnType<typeof started>>;
/** Seats a lead on a lane of its own under the root, and hands back the standing instructions it was made with. */
async function seatedLead(
  { plugin, paseo, socketPath }: Started,
  paths: string,
  rootEnv: Record<string, string> = paseo.created[0]!.env,
): Promise<string> {
  const root = await agentTools(socketPath, rootEnv);
  const brief = { goal: { text: `Work on ${paths}` }, kind: "verification" };
  const lane = await root.call("open_scope", { parent: "root", role: "lead", paths: [paths], brief });
  assert.ok(lane.ok, lane.text);
  await plugin.idle();
  root.close();
  return paseo.created.at(-1)!.systemPrompt;
}

test("a project runs its own copy of its template: the installed one changed, and the plugin started again, change nothing it runs; its page says it is behind", async () => {
  const root = stateRoot();
  const first = await started(root);
  const { project } = await first.plugin.openProject(repository(), "main");
  await first.plugin.idle();
  assert.deepEqual((await first.plugin.view(project))?.template.state, "current");
  const env = first.paseo.created[0]!.env;
  await first.plugin.dispose();

  renameTheLead(root);
  const again = await started(root);

  assert.match(await seatedLead(again, "docs/", env), /^# Lead\n/);
  const template = (await again.plugin.view(project))?.template;
  assert.deepEqual([template?.name, template?.state, template?.edited], ["slp", "behind", false]);
});

test("Sync takes the installed files for the agents seated from then on: the one seated keeps its agent, and the record has the new hash once", async () => {
  const root = stateRoot();
  const run = await started(root);
  const { project } = await run.plugin.openProject(repository(), "main");
  await run.plugin.idle();
  const before = (await run.plugin.view(project))!.template.hash;
  assert.match(await seatedLead(run, "docs/"), /^# Lead\n/);

  renameTheLead(root);
  const synced = await run.plugin.syncTemplate(project);
  assert.ok(synced.ok, synced.says);

  assert.match(await seatedLead(run, "src/"), /^# Lead, as changed\n/);
  assert.deepEqual(run.paseo.archived, []);
  const view = (await run.plugin.view(project))!;
  assert.equal(view.template.state, "current");
  assert.notEqual(view.template.hash, before);
  const taken = () => view.activity.filter((line) => line.text.includes("took its template's files anew")).length;
  assert.equal(taken(), 1);
  assert.ok(view.activity.some((line) => line.text.includes(`anew (${view.template.hash})`)));

  assert.ok((await run.plugin.syncTemplate(project)).ok);
  const after = (await run.plugin.view(project))!;
  assert.equal(after.activity.filter((line) => line.text.includes("took its template's files anew")).length, 1);
});

test("Sync is refused when the template is no longer installed, or the installed one does not load, and the project runs on as it was", async () => {
  const root = stateRoot();
  const run = await started(root);
  const { project } = await run.plugin.openProject(repository(), "main");
  await run.plugin.idle();

  writeFileSync(installed(root, "profile.yaml"), "roles: {}\n");
  const broken = await run.plugin.syncTemplate(project);
  assert.ok(!broken.ok);
  assert.match(broken.says, /the installed slp does not load: /);

  assert.deepEqual(run.plugin.removeTemplate("slp"), { ok: true });
  const gone = await run.plugin.syncTemplate(project);
  assert.ok(!gone.ok);
  assert.match(gone.says, /the template slp is not installed on this machine/);

  assert.equal((await run.plugin.view(project))?.template.state, "uninstalled");
  assert.match(await seatedLead(run, "docs/"), /^# Lead\n/);
});

test("a template removed from this machine: no project is attached with it any more, and a project that runs it goes on, the plugin started again too", async () => {
  const root = stateRoot();
  const first = await started(root);
  const { project } = await first.plugin.openProject(repository(), "main");
  await first.plugin.idle();

  assert.deepEqual(first.plugin.removeTemplate("../slp"), { ok: false, says: "no template named ../slp is installed" });
  assert.deepEqual(first.plugin.removeTemplate("slp"), { ok: true });
  assert.deepEqual(first.plugin.profiles(), []);
  await assert.rejects(first.plugin.openProject(repository(), "main"), /no template is installed/);
  await first.plugin.dispose();

  const again = await started(root);
  const view = await again.plugin.view(project);
  assert.ok(view);
  assert.equal(view.human.root?.role, "supervisor");
  assert.deepEqual(view.stuck, []);
});

test("a project keeps the one template it was attached with: attached again under another name, it runs the first", async () => {
  const root = stateRoot();
  cpSync(join(root, "profiles", "slp"), join(root, "profiles", "crew"), { recursive: true });
  writeFileSync(join(root, "profiles", "crew", "template.json"), JSON.stringify({ name: "Crew", description: "x" }));
  const run = await started(root);
  const repo = repository();
  const first = await run.plugin.openProject(repo, "main", "slp");

  const again = await run.plugin.openProject(repo, "main", "crew");

  assert.equal(again.project, first.project);
  assert.equal((await run.plugin.view(first.project))?.template.name, "slp");
});

test("a project's own copy changed by hand is said on its page and on the record when it is next opened, and Sync puts the installed files back", async () => {
  const root = stateRoot();
  const first = await started(root);
  const { project } = await first.plugin.openProject(repository(), "main");
  await first.plugin.idle();
  const hash = (await first.plugin.view(project))!.template.hash;
  await first.plugin.dispose();

  appendFileSync(join(root, "projects", project, "profile", hash, "roles", "peer.md"), "\nSkip the checks.\n");
  const again = await started(root);
  const view = (await again.plugin.view(project))!;
  await again.plugin.idle();

  assert.deepEqual([view.template.state, view.template.edited], ["current", true]);
  const lines = (await again.plugin.view(project))!.activity;
  assert.equal(lines.filter((line) => line.text.includes("took its template's files anew")).length, 1);

  assert.ok((await again.plugin.syncTemplate(project)).ok);
  assert.equal((await again.plugin.view(project))?.template.edited, false);
});
