"""Dog-friendliness around every stop from AMap Web Service place search (keyword matches within 15 km):
hotels that accept pets, dog-friendly restaurants or dog cafés, and pet clinics.

Counts are keyword matches, useful for comparing places; whether a given hotel takes a dog of your size
still has to be confirmed with the hotel. Only counts are stored, no business names (AMap data is not
redistributed); the page links to a live AMap search instead. Needs AMAP_WEB_KEY / AMAP_WEB_SECRET in .env; never prints them.
Writes data/generated/pet_friendly.json.
"""
import datetime, hashlib, json, time, urllib.parse, urllib.request
from _common import load, save, path
from fetch_amap_common import env, gcj

QUERIES = {
    "hotels": dict(keywords="可带宠物", types="100000"),
    "dining": dict(keywords="宠物餐厅|狗咖"),
    "vets": dict(keywords="宠物医院"),
}


def around(key, secret, lon, lat, extra):
    params = dict(key=key, location=f"{lon:.6f},{lat:.6f}", radius="15000", offset="25", page="1", **extra)
    qs = "&".join(f"{k}={params[k]}" for k in sorted(params))
    sig = hashlib.md5((qs + secret).encode()).hexdigest()
    url = "https://restapi.amap.com/v3/place/around?" + urllib.parse.urlencode(params) + f"&sig={sig}"
    r = json.load(urllib.request.urlopen(url, timeout=30))
    if r.get("status") != "1":
        raise RuntimeError(r.get("info"))
    return int(r.get("count", 0))


def main():
    e = env()
    nodes = load("data/route.json")["nodes"]
    today = datetime.date.today().isoformat()
    out = {}
    for n in nodes:
        if n.get("kind") == "transit":
            continue
        lon, lat = gcj(n["ll"][1], n["ll"][0])
        rec = {"checked": today}
        for k, q in QUERIES.items():
            rec[k] = {"count": around(e["AMAP_WEB_KEY"], e["AMAP_WEB_SECRET"], lon, lat, q)}
            time.sleep(0.35)
        out[n["id"]] = rec
        print(n["id"], rec["hotels"]["count"], rec["dining"]["count"], rec["vets"]["count"])
    save("data/generated/pet_friendly.json", out, indent=1)


if __name__ == "__main__":
    main()
