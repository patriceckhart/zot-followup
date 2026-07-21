import assert from "node:assert/strict";
import test from "node:test";
import { clipboardCommands, readClipboardText } from "./clipboard.js";

test("uses the native macOS clipboard command", () => {
  assert.deepEqual(clipboardCommands("darwin"), [
    { command: "pbpaste", args: [] },
  ]);
});

test("falls back through Linux clipboard commands", async () => {
  const calls: string[] = [];
  const text = await new Promise<string>((resolve, reject) => {
    readClipboardText(
      (error, value) => {
        if (error) reject(error);
        else resolve(value ?? "");
      },
      "linux",
      (command, _args, callback) => {
        calls.push(command);
        if (command === "wl-paste") {
          callback(new Error("not installed"), "");
          return;
        }
        callback(null, "clipboard text");
      },
    );
  });

  assert.equal(text, "clipboard text");
  assert.deepEqual(calls, ["wl-paste", "xclip"]);
});

test("returns the final clipboard command error", async () => {
  await assert.rejects(
    new Promise<string>((resolve, reject) => {
      readClipboardText(
        (error, value) => {
          if (error) reject(error);
          else resolve(value ?? "");
        },
        "darwin",
        (_command, _args, callback) => {
          callback(new Error("clipboard unavailable"), "");
        },
      );
    }),
    /clipboard unavailable/,
  );
});
