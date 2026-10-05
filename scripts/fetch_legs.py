"""Compute driving legs for the loop with the public OSRM server (OpenStreetMap data).

Reads data/route.json; writes data/generated/legs.json.
Expressway km is estimated from OSRM step refs: G1–G99, G1xxx (4 digits), S1–S99 or a road name containing 高速.
A node with "ferry" set is reached by ship from the previous node; OSRM is only used for the land alternative.
"""
import json, os, re, time
from _common import get_json, load, save, path, haversine

CACHE = "data/generated/.osrm_cache.json"
EXP = re.compile(r"^(G\d{1,2}|G\d{4}|S\d{1,2})$")
cache = load(CACHE) if os.path.exists(path(CACHE)) else {}


def route(a, b, via=()):
    pts = [a, *via, b]
    key = ";".join(f"{p[1]:.4f},{p[0]:.4f}" for p in pts) + ";True"
    if key in cache:
        return cache[key]
    url = ("https://router.project-osrm.org/route/v1/driving/" + ";".join(f"{p[1]},{p[0]}" for p in pts)
           + "?overview=simplified&geometries=geojson&steps=true")
    r = get_json(url)["routes"][0]
    hw = 0.0
    for leg in r["legs"]:
        for s in leg["steps"]:
            refs = [x.strip() for x in (s.get("ref") or "").replace(",", ";").split(";") if x.strip()]
            if any(EXP.match(x) for x in refs) or "高速" in (s.get("name") or ""):
                hw += s["distance"]
    out = dict(km=round(r["distance"] / 1000, 1), h=round(r["duration"] / 3600, 2), hw=round(hw / 1000, 1),
               ferry=0.0, geom=r["geometry"]["coordinates"])
    cache[key] = out
    save(CACHE, cache)
    time.sleep(1.0)  # OSRM demo server usage policy: max 1 req/s
    return out


def road_vias():
    """{'from>to': [[lat, lon], ...]} forced waypoints from data/roads.json"""
    vias = {}
    for r in load("data/roads.json")["roads"]:
        vias.update(r.get("via", {}))
    return vias


def main():
    D = load("data/route.json")
    vias = road_vias()
    nodes = D["nodes"]
    seq = nodes + [nodes[0]]
    legs = []
    for a, b in zip(seq, seq[1:]):
        r = dict(route(a["ll"], b["ll"], vias.get(f"{a['id']}>{b['id']}", [])))
        f = b.get("ferry")
        if f:
            land = r
            port_a, port_b = f["from_ll"], f["to_ll"]
            d1, d2 = route(a["ll"], port_a), route(port_b, b["ll"])
            r = dict(km=round(d1["km"] + d2["km"], 1), h=round(d1["h"] + d2["h"] + f["hours"], 2),
                     hw=round(d1["hw"] + d2["hw"], 1), ferry=round(haversine(port_a, port_b)),
                     geom=d1["geom"] + [[port_b[1], port_b[0]]] + d2["geom"],
                     land_km=land["km"], land_h=land["h"], land_hw=land["hw"])
        legs.append(dict(frm=a["id"], to=b["id"], **r))
        print(f'{a["n"]:>10} → {b["n"]:<10} {r["km"]:7.1f}km {r["h"]:5.1f}h hw {r["hw"]:6.1f}')
    exs = []
    for n in nodes:
        for name, la, lo in n["ex"]:
            r1, r2 = route(n["ll"], [la, lo]), route([la, lo], n["ll"])
            exs.append(dict(node=n["id"], name=name, ll=[la, lo], km=round(r1["km"] + r2["km"], 1),
                            h=round(r1["h"] + r2["h"], 2), hw=round(r1["hw"] + r2["hw"], 1), geom=r1["geom"]))
    save("data/generated/legs.json", dict(source="OSRM demo server (router.project-osrm.org), © OpenStreetMap contributors",
                                          legs=legs, exs=exs))
    print("legs km", round(sum(l["km"] for l in legs)), "excursions km", round(sum(e["km"] for e in exs)))


if __name__ == "__main__":
    main()
