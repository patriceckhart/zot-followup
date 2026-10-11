import assert from "node:assert/strict";
import test from "node:test";
import { FollowUpQueue, renderEditorLine, renderEditorLines, splitPanelText } from "./followups.js";

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

test("leaves panel wrapping to the host and preserves explicit newlines", () => {
  const input = "long follow-up text ".repeat(10);
  assert.deepEqual(splitPanelText(input), [input]);
  assert.deepEqual(splitPanelText("one\r\n\r\ntwo\rthree\n"), ["one", "", "two", "three", ""]);
});

test("leaves long editor input on one logical line", () => {
  const input = "a".repeat(100);
  assert.deepEqual(renderEditorLines(input), [renderEditorLine(input)]);
});

test("preserves editor newlines with a cursor only on the last line", () => {
  assert.deepEqual(renderEditorLines("one\r\n\r\ntwo\rthree\n"), [
    "  \x1b[97mone\x1b[0m",
    "  \x1b[97m\x1b[0m",
    "  \x1b[97mtwo\x1b[0m",
    "  \x1b[97mthree\x1b[0m",
    renderEditorLine(""),
  ]);
});

test("strips terminal controls from every editor line", () => {
  assert.deepEqual(renderEditorLines("safe\x1b[31mred\nlast\tline"), [
    "  \x1b[97msafe[31mred\x1b[0m",
    renderEditorLine("lastline"),
  ]);
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
