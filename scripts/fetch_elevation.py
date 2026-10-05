"""Elevation profile along the loop + node altitudes, from OpenTopoData (SRTM 90m).

Writes data/generated/elevation.json: {nodes: {id: m}, profile: [[cum_km, m, leg_index], ...],
peaks: {leg_index: [lat, lon, m]}} — the highest sample of each leg, used to mark passes on the map.
"""
import time
from _common import get_json, load, save, haversine

STEP_KM = 12


def lookup(points):
    out = []
    for i in range(0, len(points), 100):
        chunk = points[i:i + 100]
        loc = "|".join(f"{la:.4f},{lo:.4f}" for la, lo in chunk)
        d = get_json(f"https://api.opentopodata.org/v1/srtm90m?locations={loc}")
        out += [r["elevation"] for r in d["results"]]
        time.sleep(1.1)  # public API: 1 call/s
    return out


def main():
    route, legs = load("data/route.json"), load("data/generated/legs.json")["legs"]
    nodes = route["nodes"]
    node_alt = lookup([tuple(n["ll"]) for n in nodes])
    samples, cum = [], 0.0
    for li, leg in enumerate(legs):
        g = [(c[1], c[0]) for c in leg["geom"]]
        # scale the simplified polyline length to the routed distance so km marks line up with the legs
        plen = sum(haversine(a, b) for a, b in zip(g, g[1:])) or 1
        scale = leg["km"] / plen
        acc, nxt = 0.0, 0.0
        for a, b in zip(g, g[1:]):
            seg = haversine(a, b) * scale
            while nxt <= acc + seg and seg > 0:
                t = (nxt - acc) / seg
                samples.append((cum + nxt, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, li))
                nxt += STEP_KM
            acc += seg
        cum += leg["km"]
    elev = lookup([(s[1], s[2]) for s in samples])
    profile = [[round(s[0], 1), None if e is None else round(e), s[3]] for s, e in zip(samples, elev)]
    peaks = {}
    for s, e in zip(samples, elev):
        if e is None:
            continue
        li = s[3]
        if li not in peaks or e > peaks[li][2]:
            peaks[li] = [round(s[1], 4), round(s[2], 4), round(e)]
    save("data/generated/elevation.json", dict(source="OpenTopoData SRTM90m (api.opentopodata.org)",
                                               nodes={n["id"]: (None if a is None else round(a)) for n, a in zip(nodes, node_alt)},
                                               profile=profile, peaks=peaks))
    hi = max(p[1] or 0 for p in profile)
    print(len(profile), "samples; max", hi, "m")


if __name__ == "__main__":
    main()
