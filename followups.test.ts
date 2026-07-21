import assert from "node:assert/strict";
import test from "node:test";
import { FollowUpQueue, renderEditorLine } from "./followups.js";

test("renders panel input with a blinking block cursor", () => {
  const rendered = renderEditorLine("change me");

  assert.equal(
    rendered,
    "  \x1b[97mchange me\x1b[5m█\x1b[25m\x1b[0m",
  );
});

test("strips terminal controls from rendered input", () => {
  assert.equal(
    renderEditorLine("safe\x1b[31mred"),
    "  \x1b[97msafe[31mred\x1b[5m█\x1b[25m\x1b[0m",
  );
});

test("adds trimmed follow-ups in order", () => {
  const queue = new FollowUpQueue();
  queue.add("  update the README  ");
  queue.add("add regression tests");

  assert.deepEqual(
    queue.list().map((item) => item.text),
    ["update the README", "add regression tests"],
  );
});

test("edits, removes, and reorders pending follow-ups", () => {
  const queue = new FollowUpQueue();
  queue.add("first");
  queue.add("second");
  queue.add("third");

  queue.edit(1, "updated second");
  assert.equal(queue.move(1, -1), 0);
  assert.equal(queue.remove(2).text, "third");
  assert.deepEqual(
    queue.list().map((item) => item.text),
    ["updated second", "first"],
  );
});

test("clears all pending follow-ups", () => {
  const queue = new FollowUpQueue();
  queue.add("first");
  queue.add("second");

  queue.clear();

  assert.deepEqual(queue.list(), []);
});

test("takes one follow-up without affecting later work", () => {
  const queue = new FollowUpQueue();
  queue.add("first");
  queue.add("second");

  assert.equal(queue.take()?.text, "first");
  queue.edit(0, "changed while first is running");
  assert.equal(queue.take()?.text, "changed while first is running");
  assert.equal(queue.take(), undefined);
});

test("rejects empty text and invalid indexes", () => {
  const queue = new FollowUpQueue();
  assert.throws(() => queue.add("  "), /cannot be empty/);
  assert.throws(() => queue.edit(0, "missing"), RangeError);
  assert.throws(() => queue.remove(0), RangeError);
});
