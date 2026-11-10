import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export type ScriptMode = {
  apply: boolean;
  skipConfirmation: boolean;
};

export const parseScriptMode = (args: string[]): ScriptMode => ({
  apply: args.includes("--apply"),
  skipConfirmation: args.includes("--yes"),
});

export const confirmInteractiveApply = async (
  mode: ScriptMode,
  streams: { input: NodeJS.ReadStream; output: NodeJS.WriteStream } = {
    input: stdin,
    output: stdout,
  },
): Promise<boolean> => {
  if (!mode.apply) return false;
  if (mode.skipConfirmation || !streams.input.isTTY || !streams.output.isTTY) return true;

  const prompt = createInterface({ input: streams.input, output: streams.output });
  try {
    const answer = await prompt.question("Tapez APPLIQUER pour confirmer: ");
    return answer.trim() === "APPLIQUER";
  } finally {
    prompt.close();
  }
};
