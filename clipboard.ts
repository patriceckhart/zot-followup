import { execFile } from "node:child_process";

type ClipboardCommand = {
  command: string;
  args: string[];
};

type CommandRunner = (
  command: string,
  args: string[],
  callback: (error: Error | null, stdout: string) => void,
) => void;

export function clipboardCommands(platform: NodeJS.Platform): ClipboardCommand[] {
  switch (platform) {
    case "darwin":
      return [{ command: "pbpaste", args: [] }];
    case "win32":
      return [
        {
          command: "powershell.exe",
          args: [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-Clipboard -Raw",
          ],
        },
      ];
    default:
      return [
        { command: "wl-paste", args: ["--no-newline"] },
        { command: "xclip", args: ["-selection", "clipboard", "-o"] },
        { command: "xsel", args: ["--clipboard", "--output"] },
      ];
  }
}

const runCommand: CommandRunner = (command, args, callback) => {
  execFile(
    command,
    args,
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
    (error, stdout) => callback(error, stdout),
  );
};

export function readClipboardText(
  callback: (error: Error | null, text?: string) => void,
  platform: NodeJS.Platform = process.platform,
  runner: CommandRunner = runCommand,
): void {
  const commands = clipboardCommands(platform);

  function tryCommand(index: number, lastError?: Error): void {
    const candidate = commands[index];
    if (!candidate) {
      callback(lastError ?? new Error("no clipboard command is available"));
      return;
    }
    runner(candidate.command, candidate.args, (error, stdout) => {
      if (error) {
        tryCommand(index + 1, error);
        return;
      }
      callback(null, stdout);
    });
  }

  tryCommand(0);
}
