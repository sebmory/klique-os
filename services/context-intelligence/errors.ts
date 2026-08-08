import type { ContextCollectionErrorCode } from "@/types/context-intelligence";

export class ContextCollectionError extends Error {
  code: ContextCollectionErrorCode;

  constructor(code: ContextCollectionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
