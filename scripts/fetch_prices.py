"""Local meal prices around every stop from AMap Web Service: the per-person cost (人均) of nearby restaurants.

Two samples of the ~100 most popular places (AMap sortrule=weight) within 5 km of the stop: sit-down restaurants
(中餐厅 050100 + 外国餐厅 050200) and quick meals (快餐厅 050300). Sorting by distance was tried first and skewed
low (the nearest places to a city-centre point are often snack shops). Stores 25th / 50th / 75th percentiles.
Writes data/generated/prices.json. Needs AMAP_WEB_KEY / AMAP_WEB_SECRET in .env.
"""
import datetime, hashlib, json, statistics, sys, time, urllib.parse, urllib.request
from _common import load, save
from fetch_amap_common import env, gcj

PAGES = 4  # 25 per page


def costs(e, lon, lat, types):
    vals = []
    for page in range(1, PAGES + 1):
        params = dict(key=e["AMAP_WEB_KEY"], location=f"{lon:.6f},{lat:.6f}", types=types, radius="5000",
                      offset="25", page=str(page), extensions="all", sortrule="weight")
        qs = "&".join(f"{k}={params[k]}" for k in sorted(params))
        sig = hashlib.md5((qs + e["AMAP_WEB_SECRET"]).encode()).hexdigest()
        r = json.load(urllib.request.urlopen("https://restapi.amap.com/v3/place/around?" + urllib.parse.urlencode(params) + f"&sig={sig}", timeout=30))
        time.sleep(0.35)
        if r.get("status") != "1":
            raise RuntimeError(r.get("info"))
        pois = r.get("pois", [])
        for p in pois:
            c = (p.get("biz_ext") or {}).get("cost")
            if isinstance(c, str) and c:
                v = float(c)
                if 5 <= v <= 2000:
                    vals.append(v)
        if len(pois) < 25:
            break
    return vals


def summary(vals):
    if len(vals) < 5:
        return {"n": len(vals)}
    q = statistics.quantiles(vals, n=4)
    return {"n": len(vals), "p25": round(q[0]), "p50": round(statistics.median(vals)), "p75": round(q[2])}


def main():
    e = env()
    only = set(sys.argv[1:])
    nodes = load("data/route.json")["nodes"]
    try:
        out = load("data/generated/prices.json")
    except FileNotFoundError:
        out = {}
    today = datetime.date.today().isoformat()
    for n in nodes:
        if n.get("kind") == "transit" or (only and n["id"] not in only) or (not only and n["id"] in out):
            continue
        lon, lat = gcj(n["ll"][1], n["ll"][0])
        meal = summary(costs(e, lon, lat, "050100|050200"))
        quick = summary(costs(e, lon, lat, "050300"))
        out[n["id"]] = {"meal": meal, "quick": quick, "checked": today, "method": "AMap 5km 热门前 100"}
        save("data/generated/prices.json", out, indent=1)
        print(n["id"], meal, quick)


if __name__ == "__main__":
    main()
