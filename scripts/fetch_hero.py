"""Download large versions of the welcome-page photos.

Uses the same Commons files (and therefore the same credits) as data/generated/images.json,
saved as public/hero/<id>-1920.webp and <id>-960.webp. The ids must match HERO in src/components/Welcome.tsx.
"""
import io, sys, time, urllib.parse, urllib.request
from PIL import Image
from _common import get_json, load, path, UA

HERO = ["xinduqiao", "yuanyang", "luoping", "zhangye", "nalati", "dingri"]


def main(ids):
    images = load("data/generated/images.json")
    for id in ids:
        name = images[id]["file"]
        q = urllib.parse.urlencode(dict(action="query", titles=f"File:{name}", prop="imageinfo",
                                        iiprop="url|size", iiurlwidth=1920, format="json"))
        info = next(iter(get_json(f"https://commons.wikimedia.org/w/api.php?{q}")["query"]["pages"].values()))["imageinfo"][0]
        url = info.get("thumburl") or info["url"]
        raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120).read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        for w in (1920, 960):
            im = img.copy()
            im.thumbnail((w, w))
            im.save(path(f"public/hero/{id}-{w}.webp"), "WEBP", quality=72, method=6)
        print(id, "original", info["width"], "x", info["height"])
        time.sleep(1)


if __name__ == "__main__":
    main(sys.argv[1:] or HERO)
