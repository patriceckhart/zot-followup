import { createInterface } from "node:readline";
import { stderr, stdin, stdout } from "node:process";
import { readClipboardText } from "./clipboard.js";
import { FollowUpQueue, renderEditorLines, wrapPanelText } from "./followups.js";

type Frame = { type: string; id?: string; [key: string]: unknown };
type PanelMode = "browse" | "add" | "edit";

interface CommandInvoked extends Frame {
  type: "command_invoked";
  id: string;
  name: string;
  args?: string;
}

interface PanelKey extends Frame {
  type: "panel_key";
  panel_id: string;
  key: string;
  text?: string;
}

const NAME = "zot-followup";
const VERSION = "0.1.0";
const PANEL_ID = "followups-main";

const queue = new FollowUpQueue();
let agentWorking = false;
let dispatchPending = false;
let activeFollowUp = "";
let panelOpen = false;
let cursor = 0;
let mode: PanelMode = "browse";
let editor = "";

function send(frame: Frame): void {
  stdout.write(`${JSON.stringify(frame)}\n`);
}

function log(message: string): void {
  stderr.write(`[${NAME}] ${message}\n`);
}

function clampCursor(): void {
  const count = queue.list().length;
  cursor = count === 0 ? 0 : Math.max(0, Math.min(cursor, count - 1));
}

function panelTitle(): string {
  const count = queue.list().length;
  const status = agentWorking || dispatchPending ? "agent working" : "agent idle";
  return `Follow-ups (${count}) - ${status}`;
}

function panelLines(): string[] {
  if (mode !== "browse") {
    return [
      `  ${mode === "add" ? "Add follow-up" : "Edit follow-up"}`,
      "",
      ...renderEditorLines(editor),
      "",
      "  Enter saves, Esc cancels",
    ];
  }

  const lines: string[] = [];
  if (activeFollowUp) {
    lines.push("  Working on:", ...wrapPanelText(activeFollowUp, 46).map((line) => `  ${line}`), "");
  }
  if (queue.list().length === 0) {
    lines.push("  No pending follow-ups.", "", "  Press a to add one.");
    return lines;
  }
  for (const [index, item] of queue.list().entries()) {
    const prefix = `${index === cursor ? ">" : " "} ${index + 1}. `;
    const indent = " ".repeat(prefix.length);
    const chunks = wrapPanelText(item.text, Math.max(1, 48 - prefix.length));
    lines.push(`${prefix}${chunks[0]}`, ...chunks.slice(1).map((chunk) => `${indent}${chunk}`));
  }
  lines.push("", "  ↑↓ select  ←→ reorder", "  Enter run when idle, Esc close");
  return lines;
}

function panelFooter(): string {
  if (mode !== "browse") {
    return "Enter save  Esc cancel  ⌫ delete";
  }
  return "a add  e edit  d delete  c clear";
}

function renderPanel(): void {
  if (!panelOpen) return;
  send({
    type: "panel_render",
    panel_id: PANEL_ID,
    title: panelTitle(),
    lines: panelLines(),
    footer: panelFooter(),
  });
}

function openPanel(id: string): void {
  panelOpen = true;
  mode = "browse";
  editor = "";
  clampCursor();
  send({
    type: "command_response",
    id,
    action: "open_panel",
    open_panel: {
      id: PANEL_ID,
      title: panelTitle(),
      lines: panelLines(),
      footer: panelFooter(),
    },
  });
}

function dispatchNext(index = 0): boolean {
  if (agentWorking || dispatchPending) return false;
  const next = queue.take(index);
  if (!next) return false;
  activeFollowUp = next.text;
  dispatchPending = true;
  clampCursor();
  renderPanel();
  send({ type: "submit", text: next.text });
  return true;
}

function addFollowUp(text: string): number {
  queue.add(text);
  cursor = queue.list().length - 1;
  renderPanel();
  return queue.list().length;
}

function handleCommand(frame: CommandInvoked): void {
  const args = (frame.args ?? "").trim();
  switch (frame.name) {
    case "followup":
      if (!args) {
        openPanel(frame.id);
        return;
      }
      try {
        const count = addFollowUp(args);
        send({
          type: "command_response",
          id: frame.id,
          action: "display",
          display: `Queued follow-up #${count}: ${args}`,
        });
        if (!agentWorking && !dispatchPending) setImmediate(dispatchNext);
      } catch (error) {
        commandError(frame.id, error);
      }
      return;
    default:
      send({
        type: "command_response",
        id: frame.id,
        action: "noop",
        error: `Unknown command /${frame.name}`,
      });
  }
}

function commandError(id: string, error: unknown): void {
  send({
    type: "command_response",
    id,
    action: "noop",
    error: error instanceof Error ? error.message : String(error),
  });
}

function handlePanelKey(frame: PanelKey): void {
  if (frame.panel_id !== PANEL_ID || !panelOpen) return;
  if (mode !== "browse") {
    handleEditorKey(frame.key, frame.text ?? "");
    return;
  }

  switch (frame.key) {
    case "up":
      cursor--;
      break;
    case "down":
      cursor++;
      break;
    case "left":
      if (queue.list().length > 0) cursor = queue.move(cursor, -1);
      break;
    case "right":
      if (queue.list().length > 0) cursor = queue.move(cursor, 1);
      break;
    case "enter":
      dispatchNext(cursor);
      break;
    case "rune":
      handlePanelRune((frame.text ?? "").toLowerCase());
      break;
  }
  clampCursor();
  renderPanel();
}

function handlePanelRune(key: string): void {
  switch (key) {
    case "a":
      mode = "add";
      editor = "";
      break;
    case "e":
      if (queue.list().length > 0) {
        mode = "edit";
        editor = queue.list()[cursor].text;
      }
      break;
    case "d":
      if (queue.list().length > 0) queue.remove(cursor);
      break;
    case "c":
      queue.clear();
      cursor = 0;
      break;
  }
}

function handleEditorKey(key: string, text: string): void {
  switch (key) {
    case "enter": {
      const value = editor.trim();
      if (value) {
        if (mode === "add") {
          addFollowUp(value);
        } else if (mode === "edit" && queue.list().length > 0) {
          queue.edit(cursor, value);
        }
      }
      mode = "browse";
      editor = "";
      break;
    }
    case "esc":
      mode = "browse";
      editor = "";
      break;
    case "backspace": {
      const runes = Array.from(editor);
      runes.pop();
      editor = runes.join("");
      break;
    }
    case "rune":
      editor += text;
      break;
    case "unknown":
      // Current zot releases do not expose a distinct panel paste key or
      // include bracketed-paste text, so paste gestures arrive as unknown.
      readClipboardText((error, clipboardText) => {
        if (error || !clipboardText || !panelOpen || mode === "browse") return;
        editor += clipboardText;
        renderPanel();
      });
      break;
  }
  clampCursor();
  renderPanel();
}

send({
  type: "hello",
  name: NAME,
  version: VERSION,
  capabilities: ["commands", "events", "panels"],
});

const rl = createInterface({ input: stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let frame: Frame;
  try {
    frame = JSON.parse(line) as Frame;
  } catch (error) {
    log(`ignored malformed frame: ${error}`);
    return;
  }

  switch (frame.type) {
    case "hello_ack":
      send({
        type: "register_command",
        name: "followup",
        description: "queue a follow-up, or open the follow-up panel",
      });
      send({ type: "subscribe", events: ["turn_start", "turn_end"] });
      send({ type: "ready" });
      break;
    case "command_invoked":
      handleCommand(frame as CommandInvoked);
      break;
    case "panel_key":
      handlePanelKey(frame as PanelKey);
      break;
    case "panel_close":
      if (frame.panel_id === PANEL_ID) {
        panelOpen = false;
        mode = "browse";
        editor = "";
      }
      break;
    case "event":
      if (frame.event === "turn_start") {
        agentWorking = true;
        dispatchPending = false;
      } else if (frame.event === "turn_end" && frame.stop !== "tool_use") {
        agentWorking = false;
        dispatchPending = false;
        activeFollowUp = "";
        // turn_end reaches extensions just before zot marks its host loop idle.
        // Give that bookkeeping a moment so submit starts a fresh turn instead
        // of racing into the run that just ended.
        if (frame.stop === "end" || frame.stop === "length") {
          setTimeout(dispatchNext, 50);
        }
      }
      renderPanel();
      break;
    case "shutdown":
      send({ type: "shutdown_ack" });
      rl.close();
      break;
    default:
      log(`ignored frame type: ${frame.type}`);
  }
});

rl.on("close", () => process.exit(0));
