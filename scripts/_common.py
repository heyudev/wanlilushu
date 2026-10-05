"""Shared helpers for the data pipeline scripts."""
import json, math, os, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
GEN = os.path.join(DATA, "generated")
UA = "wanlilushu-data/0.1 (https://wanlilushu.cn)"


def path(*p):
    return os.path.join(ROOT, *p)


def load(p):
    with open(path(p), encoding="utf-8") as f:
        return json.load(f)


def save(p, obj, indent=None):
    os.makedirs(os.path.dirname(path(p)), exist_ok=True)
    with open(path(p), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":"))


def get_json(url, retries=6, timeout=60):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return json.load(urllib.request.urlopen(req, timeout=timeout))
        except Exception as e:  # network hiccups on public endpoints are common
            last = e
            time.sleep(3 + 3 * i)
    raise RuntimeError(f"GET failed after {retries} tries: {url}: {last}")


def haversine(a, b):
    """Great-circle distance in km between (lat, lon) pairs."""
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))
