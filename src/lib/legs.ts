import type { Leg } from "./types";

/** Tags each bundled leg with its index and starting km on the loop, so lookups survive inserted stops. */
export function withOrigins(legs: Leg[]): Leg[] {
  let acc = 0;
  return legs.map((l, i) => {
    const out = { ...l, orig: i, origStart: acc };
    acc += l.km;
    return out;
  });
}

