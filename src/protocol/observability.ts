/** Opt-in wire observations. Observers must enqueue quickly; persistence belongs to the host. */
export interface WireEvent {
  transport: "http" | "token" | "websocket" | "webhook";
  direction: "in" | "out" | "lifecycle";
  stage: string;
  payload?: unknown;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  status?: number;
  capture?: "complete" | "incomplete";
  receivedAt?: number;
}
export type WireObserver = (event: WireEvent) => void | Promise<void>;
const sensitive = /^(authorization|proxyauthorization|cookie|setcookie|token|accesstoken|refreshtoken|clientsecret|appsecret|password|secret|signature|plain(token)?|fileinfo|uplo(ad)?id|presignedurl|filedata|messagescene|sessionid|xsignatureed25519)$/i;
function credentialQueryKey(key: string): boolean {
  try {
    // URL query keys can be percent encoded independently of their values.
    for (let pass = 0; pass < 3 && key.includes("%"); pass++) key = decodeURIComponent(key);
  } catch { return true; } // Undecodable key: its value cannot be classified safely.
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return sensitive.test(normalized) || /^(sign|key|credential|qsignature|qak|xcos.*|xamz.*)$/.test(normalized);
}
/** Recursive JSON redaction. Unknown business fields and full envelope keys are preserved. */
export function sanitizeWire(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") {
    let text = value;
    for (const secret of secrets) if (secret) text = text.split(secret).join("[redacted]");
    text = text.replace(/(QQBot|Bearer)\s+[^\s"<>]+/gi, "$1 [redacted]");
    text = text.replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@");
    // Scan each query assignment, including multiple URLs embedded in ordinary text.
    return text.replace(/([?&])([^=&#?\s"<>]+)=([^&#?\s"<>]*)/g,
      (match, separator: string, key: string) => credentialQueryKey(key) ? `${separator}${key}=[redacted]` : match);
  }
  if (Array.isArray(value)) return value.map(item => sanitizeWire(item, secrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item]) => [key, sensitive.test(key.replace(/[_-]/g,"")) ? "[redacted]" : sanitizeWire(item,secrets)]));
  return value;
}
/** Exceptions/rejections cannot change protocol behavior. No raw bytes for malformed JSON. */
export function observeWire(observer: WireObserver | undefined, event: WireEvent, secrets: readonly string[] = []): void {
  if (!observer) return;
  try { Promise.resolve(observer(sanitizeWire({...event,receivedAt:Date.now()},secrets) as WireEvent)).catch(() => {}); } catch { /* isolated */ }
}
export function jsonWireBody(text: string): {payload: unknown; capture: "complete" | "incomplete"} {
  try { return {payload:JSON.parse(text),capture:"complete"}; }
  catch { return {payload:{byteLength:Buffer.byteLength(text),reason:"redaction_unavailable"},capture:"incomplete"}; }
}
