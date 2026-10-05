// Share links: the settings that differ from the defaults, deflated and base64url-encoded into ?plan=.
import { DEFAULT_INPUT } from "./defaults";
import type { PlanInput } from "./types";

export const SHARE_PARAM = "plan";

export function diffFromDefaults(input: PlanInput): Partial<PlanInput> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (JSON.stringify(v) !== JSON.stringify((DEFAULT_INPUT as unknown as Record<string, unknown>)[k])) out[k] = v;
  }
  return out as Partial<PlanInput>;
}

const toB64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodePlan(input: PlanInput): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(diffFromDefaults(input)));
  return toB64url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** Settings from a share code merged over the defaults; null when the code is damaged. */
export async function decodePlan(code: string): Promise<PlanInput | null> {
  try {
    const json = new TextDecoder().decode(await pipe(fromB64url(code), new DecompressionStream("deflate-raw")));
    const diff = JSON.parse(json);
    if (typeof diff !== "object" || diff == null) return null;
    return { ...DEFAULT_INPUT, ...diff };
  } catch {
    return null;
  }
}
