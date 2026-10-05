"""Merge hand-maintained route data, research findings and generated geodata into src/data/*.json for the app.

Inputs:  data/route.json, data/research/*.json, data/generated/{legs,elevation,images,starts,transfers}.json
Outputs: src/data/{route,attractions,policy,elevation,starts,transfers}.json
"""
import glob, json, os
from _common import load, save, path

R3 = lambda c: [round(c[0], 3), round(c[1], 3)]
# research files used a few different ids/groupings than route.json
NODE_ALIAS = {"bangong": "ritu", "zhufeng": "dingri"}
NAME_TO_NODE = {"室韦": "shiwei", "乌拉盖": "wulagai"}


def resolve_node(a):
    for key, nid in NAME_TO_NODE.items():
        if key in (a.get("name") or ""):
            return nid
    return NODE_ALIAS.get(a.get("node"), a.get("node"))


def norm_attraction(a):
    return dict(node=resolve_node(a), name=a["name"], level=a.get("level"), peak=a.get("peak"), off=a.get("off"),
                season=a.get("season_rule"), extras=[e for e in (a.get("extras") or []) if isinstance(e, dict)],
                reserve=a.get("reserve"), pets=a.get("pets") or "未查到", petsNote=a.get("pets_note"),
                discounts=a.get("discounts"), open=a.get("open"), src=a.get("src") or [],
                conf=a.get("confidence") or "low", note=a.get("note"),
                checked=a.get("checked"), reviewBy=a.get("review_by"), reviewNote=a.get("review_note"))


def main():
    route = load("data/route.json")
    legs = load("data/generated/legs.json")
    elev = load("data/generated/elevation.json")
    images = load("data/generated/images.json") if os.path.exists(path("data/generated/images.json")) else {}
    node_ids = {n["id"] for n in route["nodes"]}

    attractions, campsites, policy, ferry = [], [], [], None
    for f in sorted(glob.glob(path("data/research/*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        for a in d.get("attractions", []):
            if resolve_node(a) in node_ids:
                attractions.append(norm_attraction(a))
            else:
                print("unknown node in", os.path.basename(f), a.get("node"), a.get("name"))
        for c in d.get("campsites", []):
            c = dict(c, node=resolve_node(c))
            campsites.append({k: c.get(k) for k in ("node", "name", "location", "price", "pets", "src", "confidence", "note", "checked")})
        for r in d.get("roads", []):
            policy.append(dict(key="road", title=r.get("title") or r.get("topic"), topic=r.get("topic"), finding=r.get("finding"),
                               src=r.get("src") or [], conf=r.get("confidence") or "low", asOf=r.get("as_of"),
                               checked=r.get("checked"), reviewBy=r.get("review_by"), reviewNote=r.get("review_note")))
        for it in d.get("items", []):
            policy.append(dict(key=it.get("key"), title=it.get("title"), topic=it.get("topic"), finding=it.get("finding"),
                               data=it.get("data"), src=it.get("src") or [], conf=it.get("confidence") or "low",
                               asOf=it.get("as_of"), checked=it.get("checked"), reviewBy=it.get("review_by"),
                               reviewNote=it.get("review_note")))
        if d.get("ferry"):
            ferry = d["ferry"]

    nodes = []
    for n in route["nodes"]:
        m = dict(n)
        m["alt"] = elev["nodes"].get(n["id"])
        if n["id"] in images:
            im = images[n["id"]]
            m["img"] = dict(src=f"img/{n['id']}.webp", title=im.get("title", ""), author=im["author"], license=im["license"], page=im["page"],
                            generic=bool(im.get("generic")))
        if m.get("ferry") and ferry:
            m["ferry"] = dict(m["ferry"], research=ferry)
        nodes.append(m)

    out_legs = [dict({k: v for k, v in l.items() if k != "geom"}, geom=[R3(c) for c in l["geom"]]) for l in legs["legs"]]
    out_exs = [dict({k: v for k, v in e.items() if k != "geom"}) for e in legs["exs"]]
    save("src/data/route.json", dict(segs=route["segs"], nodes=nodes, legs=out_legs, exs=out_exs, legSource=legs["source"]))
    save("src/data/attractions.json", dict(attractions=attractions, campsites=campsites))
    save("src/data/policy.json", dict(items=policy))
    save("src/data/elevation.json", dict(source=elev["source"], profile=elev["profile"], peaks=elev.get("peaks", {})))
    save("src/data/starts.json", load("data/generated/starts.json"))
    clim = load("data/generated/climate.json") if os.path.exists(path("data/generated/climate.json")) else {}
    save("src/data/climate.json", {k: v["months"] for k, v in clim.items()})
    prices = load("data/generated/prices.json") if os.path.exists(path("data/generated/prices.json")) else {}
    save("src/data/prices.json", prices)
    pet = load("data/generated/pet_friendly.json") if os.path.exists(path("data/generated/pet_friendly.json")) else {}
    save("src/data/pet_friendly.json", pet)
    transfers = path("data/generated/transfers.json")
    save("src/data/transfers.json", load("data/generated/transfers.json")["pairs"] if os.path.exists(transfers) else {})
    save("src/data/roads.json", [{k: r[k] for k in ("id", "name", "legs", "best", "about")} for r in load("data/roads.json")["roads"]])
    print(f"nodes {len(nodes)} legs {len(out_legs)} attractions {len(attractions)} campsites {len(campsites)} policy {len(policy)} images {len(images)}")


if __name__ == "__main__":
    main()
