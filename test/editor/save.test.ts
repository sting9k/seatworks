import assert from "node:assert/strict";
import { test } from "node:test";
import { positioned } from "../../editor/template/about.ts";
import { packed } from "../../editor/template/pack.ts";
import { readTemplate } from "../../editor/template/read-template.ts";
import { unpacked } from "../../shared/contracts/template.ts";
import { slpFiles } from "./slp.ts";

// Each case is a row of spec/CONFORMANCE.md, Editor: a template in, the file a person takes away out.

test("the SLP profile packed with nothing changed and opened again holds each file as it was, to the byte", () => {
  const files = slpFiles();

  const again = unpacked(packed(files));

  assert.ok(again.ok);
  assert.deepEqual([...again.files].sort(), [...files].sort());
});

test("a template whose nodes were put somewhere keeps the places in `template.json` and in no other file", () => {
  const files = slpFiles();
  const read = readTemplate(files);
  assert.ok(read.ok);
  const put = new Map([
    ["human", { x: 40, y: -12 }],
    ["question:names-method", { x: 300.4, y: 91.6 }],
  ]);

  const saved = positioned(files, put);

  const changed = [...saved].filter(([path, text]) => files.get(path) !== text).map(([path]) => path);
  assert.deepEqual(changed, ["template.json"]);
  const again = readTemplate(saved);
  assert.ok(again.ok);
  assert.deepEqual(again.template.about.editor?.positions, {
    human: { x: 40, y: -12 },
    "question:names-method": { x: 300, y: 92 },
  });
  assert.equal(again.template.about.name, read.template.about.name);
});

test("a file that is not a packed template is not opened, and says so", () => {
  for (const text of ["not json", JSON.stringify({ files: { "profile.yaml": 3 } }), JSON.stringify({ roles: {} })]) {
    const opened = unpacked(text);
    assert.ok(!opened.ok, text);
    assert.match(opened.says, /not a packed template/);
  }
});
