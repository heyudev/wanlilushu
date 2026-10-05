"""Driving routes between segment ends, for plans that reorder the segments to follow the seasons.

For every pair of segment end stops that are not already joined by a loop leg, asks the public OSRM server
for a route (cached in data/generated/.osrm_cache.json, 1 request/s). A route is stored once per pair and
driven in either direction.

Writes data/generated/transfers.json ({"a>b": {km, h, hw}}) and public/route/transfers.json (simplified
geometry per pair, loaded by the map only when a plan uses a transfer).
"""
import itertools
from _common import load, save
from fetch_legs import route

R3 = lambda c: [round(c[0], 3), round(c[1], 3)]


def segment_ends(nodes):
    ends = {}
    for n in nodes:
        first, _ = ends.get(n["seg"], (n, n))
        ends[n["seg"]] = (first, n)
    return ends


def main():
    nodes = load("data/route.json")["nodes"]
    order = {n["id"]: i for i, n in enumerate(nodes)}
    ends = [n for pair in segment_ends(nodes).values() for n in pair]
    adjacent = lambda a, b: abs(order[a["id"]] - order[b["id"]]) in (1, len(nodes) - 1)
    pairs, geom = {}, {}
    todo = [(a, b) for a, b in itertools.combinations(ends, 2) if a["seg"] != b["seg"] and not adjacent(a, b)]
    for i, (a, b) in enumerate(todo, 1):
        r = route(a["ll"], b["ll"])
        key = f'{a["id"]}>{b["id"]}'
        pairs[key] = dict(km=r["km"], h=r["h"], hw=r["hw"])
        geom[key] = [R3(c) for c in r["geom"]]
        if i % 25 == 0 or i == len(todo):
            print(f"{i}/{len(todo)} {a['n']} → {b['n']} {r['km']}km")
    save("data/generated/transfers.json",
         dict(source="OSRM demo server (router.project-osrm.org), © OpenStreetMap contributors", pairs=pairs))
    save("public/route/transfers.json", geom)


if __name__ == "__main__":
    main()
