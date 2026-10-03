import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { argvOf, lineOf } from "../../client/state/checks.ts";

// Rows of spec/CONFORMANCE.md, The Human's surface: a check's command as the Human types one.

test("a check's command typed on one line is the program and its arguments, quotes keeping an argument whole", () => {
  assert.deepEqual(argvOf("npm run lint"), ["npm", "run", "lint"]);
  assert.deepEqual(argvOf('  sh -c "npm test && npm run lint"  '), ["sh", "-c", "npm test && npm run lint"]);
  assert.deepEqual(argvOf("grep 'a \"quoted\" word' src\\ dir"), ["grep", 'a "quoted" word', "src dir"]);
  assert.deepEqual(argvOf(""), []);
  assert.equal(lineOf(["sh", "-c", "npm test && npm run lint"]), 'sh -c "npm test && npm run lint"');
});

test("any arguments shown as a line and typed back are the same arguments", () => {
  fc.assert(
    fc.property(fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 8 }), (argv) => {
      assert.deepEqual(argvOf(lineOf(argv)), argv);
    }),
  );
});
