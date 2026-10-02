import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
import { Plugin } from "../../server/bridge/plugin.ts";
import { loadBundle } from "../../server/profile/bundle.ts";
import { agentTools } from "./agent-tools.ts";
import { fakePaseo } from "./fake-paseo.ts";
import { stateRoot } from "./state-root.ts";

// Rows of spec/CONFORMANCE.md, Templates: the classifier is the template's, and the Human's key is for a host.

const pluginDir = join(import.meta.dirname, "../..");
const plugins: Plugin[] = [];
after(async () => {
  for (const p of plugins) await p.dispose();
});

type Call = {
  url: string;
  key: string;
  body: { model: string; provider?: unknown; questions: Record<string, unknown> };
};

/** Every call that leaves the machine, answered as a classifier answers: a low probability for each question. */
function net(): Call[] {
  const calls: Call[] = [];
  mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Call["body"];
    const key = (init.headers as Record<string, string>).authorization ?? "";
    calls.push({ url, key, body });
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, { type: string; criteria: Record<string, string> }>).map(
        ([name, q]) => [
          name,
          q.type === "noul"
            ? { type: "noul", noul: 0.05 }
            : { type: "choice", choice: Object.keys(q.criteria)[0], confidence: 0.9, probabilities: {} },
        ],
      ),
    );
    return Promise.resolve(Response.json({ model: body.model, answers, usage: { input_tokens: 10 } }));
  });
  return calls;
}

/** A project on `root` whose root agent issues a brief each time `brief` is called, which the template asks of. */
async function attached(root: string) {
  const repo = mkdtempSync(join(tmpdir(), "sw-asks-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
    });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const plugin = new Plugin(root);
  plugins.push(plugin);
  const paseo = fakePaseo(pluginDir);
  plugin.saw(paseo.api);
  const { socketPath } = await plugin.whenReady();
  const { project } = await plugin.openProject(repo, "main");
  await plugin.idle();
  const tools = await agentTools(socketPath, paseo.created[0]!.env);
  let n = 0;
  const brief = async () => {
    const opened = await tools.call("open_scope", {
      parent: "root",
      role: "lead",
      paths: [`src/${++n}/`],
      brief: { goal: { text: "Encode directions" }, kind: "discovery" },
    });
    assert.ok(opened.ok, opened.text);
    await plugin.idle();
  };
  return { plugin, project, brief, close: () => tools.close() };
}

test("a template's classifier is asked at the host the Human's key is for and at no other; off, or with none in the template, nothing leaves and nothing is said", async () => {
  const calls = net();
  const { plugin, project, brief, close } = await attached(stateRoot());
  const alarm = () => plugin.alarmOf(project);

  plugin.setReflex({ on: true, host: "openrouter.ai", key: "the-key" });
  await brief();
  assert.ok(calls.length > 0, "the brief is asked about");
  assert.deepEqual([...new Set(calls.map((c) => c.url))], ["https://openrouter.ai/api/v1/systemone"]);
  assert.ok(calls.every((c) => c.key === "Bearer the-key" && c.body.model === "typesafe/jev-1.13"));
  assert.deepEqual(calls[0]!.body.provider, { data_collection: "deny" }, "with what that route sends every time");
  assert.equal(alarm(), null);

  calls.length = 0;
  plugin.setReflex({ on: true, host: "api.typesafe.ai", key: "another" });
  await brief();
  assert.deepEqual([...new Set(calls.map((c) => c.url))], ["https://api.typesafe.ai/v1/systemone"]);
  assert.ok(calls.every((c) => c.key === "Bearer another" && c.body.model === "jev-1.13.0"));

  calls.length = 0;
  plugin.setReflex({ on: true, host: "elsewhere.test", key: "the-key" });
  await brief();
  assert.equal(calls.length, 0, "a key for a host the template is not served at goes nowhere");
  assert.match(alarm() ?? "", /asks a classifier at openrouter\.ai, api\.typesafe\.ai.+is for elsewhere\.test/);

  plugin.setReflex({ on: true, host: "openrouter.ai", key: "" });
  await brief();
  assert.equal(calls.length, 0);
  assert.match(alarm() ?? "", /no key is set for openrouter\.ai/);

  plugin.setReflex({ on: false, host: "openrouter.ai", key: "the-key" });
  await brief();
  assert.equal(calls.length, 0, "switched off on this machine, nothing is asked");
  assert.equal(alarm(), null, "and that is the Human's choice, so nothing is said");
  close();

  const root = stateRoot();
  const profile = join(root, "profiles", "slp", "profile.yaml");
  const text = readFileSync(profile, "utf8");
  writeFileSync(
    profile,
    text.slice(0, text.indexOf("classifier:")) + text.slice(text.indexOf("# Kept in an attached")),
  );
  assert.equal(loadBundle(join(root, "profiles", "slp")).classifier, null);
  const bare = await attached(root);
  bare.plugin.setReflex({ on: true, host: "openrouter.ai", key: "the-key" });
  await bare.brief();
  assert.equal(calls.length, 0, "a template with no classifier asks no model, whatever key the machine has");
  assert.equal(bare.plugin.alarmOf(bare.project), null);
  bare.close();
});

test("a classifier served over plain http anywhere but this machine, or by no route, is a profile that does not load", () => {
  const withClassifier = (block: string) => {
    const root = stateRoot();
    const profile = join(root, "profiles", "slp", "profile.yaml");
    const text = readFileSync(profile, "utf8");
    const from = text.indexOf("classifier:");
    writeFileSync(profile, `${text.slice(0, from)}${block}\n${text.slice(text.indexOf("# Kept in an attached"))}`);
    return join(root, "profiles", "slp");
  };
  const route = (endpoint: string) => `classifier:\n  own: { endpoint: "${endpoint}", model: m, budget: 1000 }`;
  assert.throws(() => loadBundle(withClassifier(route("http://collects.test/v1"))), /over https/);
  assert.throws(
    () => loadBundle(withClassifier(route("https://openrouter.ai@collects.test/v1"))),
    /written plainly/,
    "a host a reader takes for another is not one a key is sent by",
  );
  assert.throws(() => loadBundle(withClassifier("classifier: {}")), /at least one route/);
  assert.deepEqual(
    Object.keys(loadBundle(withClassifier(route("http://localhost:8080/v1"))).classifier ?? {}),
    ["own"],
    "a model run on this machine is asked over plain http",
  );
});
