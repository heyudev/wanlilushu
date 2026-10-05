"""Full-resolution route geometry for the zoomable map, one file per segment.

OSRM overview=full, simplified to ~30 m with Douglas–Peucker, coordinates WGS84 [lon, lat] rounded to 5 decimals.
Writes public/route/<segment>.json: {"legs": {"<leg index>": [[lon, lat], ...]}}
"""
import json, os, time
from shapely.geometry import LineString
from _common import get_json, load, path

CACHE = "data/generated/.osrm_full_cache.json"


def main():
    route = load("data/route.json")
    nodes = route["nodes"]
    cache = load(CACHE) if os.path.exists(path(CACHE)) else {}
    vias = {}
    for r in load("data/roads.json")["roads"]:
        vias.update(r.get("via", {}))
    by_seg = {}
    for i, a in enumerate(nodes):
        b = nodes[(i + 1) % len(nodes)]
        via = vias.get(f"{a['id']}>{b['id']}", [])
        # coordinates are part of the key so a moved stop is fetched again
        key = f"{a['id']}>{b['id']}|" + ";".join(f"{la:.4f},{lo:.4f}" for la, lo in [a["ll"], *via, b["ll"]])
        if key not in cache:
            if b.get("ferry"):
                pa, pb = b["ferry"]["from_ll"], b["ferry"]["to_ll"]
                parts = [(a["ll"], pa), (pb, b["ll"])]
            else:
                parts = [(a["ll"], *via, b["ll"])]
            coords = []
            for part in parts:
                d = get_json("https://router.project-osrm.org/route/v1/driving/" + ";".join(f"{lo},{la}" for la, lo in part)
                             + "?overview=full&geometries=geojson&steps=false")
                coords += d["routes"][0]["geometry"]["coordinates"]
                time.sleep(1.0)
            line = LineString(coords).simplify(0.0003, preserve_topology=False)
            cache[key] = [[round(x, 5), round(y, 5)] for x, y in line.coords]
            json.dump(cache, open(path(CACHE), "w"))
            print(key, len(coords), "→", len(cache[key]))
        by_seg.setdefault(a["seg"], {})[str(i)] = cache[key]
    os.makedirs(path("public/route"), exist_ok=True)
    for seg, legs in by_seg.items():
        json.dump({"legs": legs}, open(path(f"public/route/{seg}.json"), "w"), separators=(",", ":"))
    total = sum(os.path.getsize(path(f"public/route/{s}.json")) for s in by_seg)
    print("segments", len(by_seg), "bytes", total)


if __name__ == "__main__":
    main()
