"""Fetch one freely licensed photo per node from Wikipedia/Wikimedia Commons.

For each node, tries the titles in node["wiki"] on zh.wikipedia, takes the page image,
checks its Commons license, downloads a 640px thumbnail into public/img/<id>.webp (re-encoded),
and records author + license in data/generated/images.json so the UI can credit it.
"""
import io, os, re, time, urllib.parse, urllib.request
from PIL import Image
from _common import get_json, load, save, path, UA

FREE = re.compile(r"^(CC0|CC BY|CC-BY|Public domain|PD|GFDL|CC BY-SA|Attribution)", re.I)


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def page_image(title):
    q = urllib.parse.urlencode(dict(action="query", titles=title, prop="pageimages", piprop="name",
                                    format="json", redirects=1))
    d = get_json(f"https://zh.wikipedia.org/w/api.php?{q}")
    for p in d["query"]["pages"].values():
        if "pageimage" in p:
            return p["pageimage"]
    return None


def commons_search(query):
    q = urllib.parse.urlencode(dict(action="query", list="search", srsearch=f"{query} filetype:bitmap", srnamespace=6,
                                    srlimit=8, format="json"))
    d = get_json(f"https://commons.wikimedia.org/w/api.php?{q}")
    return [h["title"].removeprefix("File:") for h in d["query"]["search"]]


def file_info(name):
    q = urllib.parse.urlencode(dict(action="query", titles=f"File:{name}", prop="imageinfo",
                                    iiprop="url|extmetadata", iiurlwidth=640, format="json"))
    d = get_json(f"https://commons.wikimedia.org/w/api.php?{q}")
    for p in d["query"]["pages"].values():
        if "imageinfo" in p:
            return p["imageinfo"][0]
    return None


def main():
    nodes = load("data/route.json")["nodes"]
    out = load("data/generated/images.json") if os.path.exists(path("data/generated/images.json")) else {}
    for n in nodes:
        if n["id"] in out and os.path.exists(path(f"public/img/{n['id']}.webp")):
            continue
        candidates = [(t, None) for t in n["wiki"]] + [(q, "search") for q in n.get("commons", [])]
        names = []
        for title, kind in candidates:
            if kind == "search":
                names = [(title, f) for f in commons_search(title)]
            else:
                names = [(title, page_image(title))]
            time.sleep(0.5)
            if fetch_one(n, names, out):
                break
        else:
            print("MISSING", n["id"], n["wiki"])
    save("data/generated/images.json", out, indent=1)


def fetch_one(n, names, out):
    """Download the first freely licensed bitmap among `names`; returns True on success."""
    for title, name in names:
        if not name or name.lower().endswith((".svg", ".png", ".gif", ".tif", ".tiff")):
            continue
        info = file_info(name)
        time.sleep(0.5)
        if not info or "thumburl" not in info:
            continue
        meta = info.get("extmetadata", {})
        lic = strip_html(meta.get("LicenseShortName", {}).get("value"))
        if not FREE.match(lic):
            print("skip non-free", n["id"], name, lic)
            continue
        req = urllib.request.Request(info["thumburl"], headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=60).read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((640, 640))
        img.save(path(f"public/img/{n['id']}.webp"), "WEBP", quality=74, method=6)
        out[n["id"]] = dict(title=title, file=name, author=strip_html(meta.get("Artist", {}).get("value"))[:120],
                            license=lic, license_url=meta.get("LicenseUrl", {}).get("value", ""),
                            page=info.get("descriptionurl", ""))
        print("ok", n["id"], title, name, lic)
        save("data/generated/images.json", out, indent=1)
        return True
    return False


if __name__ == "__main__":
    main()
