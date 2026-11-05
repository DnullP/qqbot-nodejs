import type { ChatScope } from "../types.js";
function encode(text: string): string {
  if (!text || [...text].length > 100) throw new RangeError("Text-chain fields require 1–100 characters");
  return encodeURIComponent(text).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
/** Markdown only. Client/account support has not been verified by this fork. */
export function commandInput(text: string, options: {show?: string; reference?: boolean} = {}): string {
  return `<qqbot-cmd-input text="${encode(text)}"${options.show === undefined ? "" : ` show="${encode(options.show)}"`} reference="${options.reference === true}" />`;
}
/** Direct-send links are documented for C2C only; never silently convert other scopes. */
export function commandEnter(text: string, scope: ChatScope): string {
  if (scope !== "c2c") throw new Error("Direct-send text chains are only documented for C2C");
  return `<qqbot-cmd-enter text="${encode(text)}" />`;
}
