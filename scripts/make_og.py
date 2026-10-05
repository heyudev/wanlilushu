"""Share card (public/og.png, 1200×630): the loop drawn as a line, without borders or boundaries, plus the title."""
import json, math
from PIL import Image, ImageDraw, ImageFont
from _common import path

FONT_TITLE = "/System/Library/Fonts/Supplemental/Songti.ttc"   # macOS; replace on other systems
FONT_BODY = "/System/Library/Fonts/Hiragino Sans GB.ttc"


def main():
    r = json.load(open(path("src/data/route.json"), encoding="utf-8"))
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (17, 22, 20))
    d = ImageDraw.Draw(img)
    pts = [c for l in r["legs"] for c in l["geom"]]
    lons = [p[0] for p in pts]; lats = [p[1] for p in pts]
    merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    x0, x1, y0, y1 = min(lons), max(lons), merc(min(lats)), merc(max(lats))
    box = (610, 40, 1170, 590)
    s = min((box[2] - box[0]) / (x1 - x0), (box[3] - box[1]) / ((y1 - y0) * 180 / math.pi))
    ox = ((box[2] - box[0]) - (x1 - x0) * s) / 2
    oy = ((box[3] - box[1]) - (y1 - y0) * 180 / math.pi * s) / 2
    xy = lambda lon, lat: (box[0] + ox + (lon - x0) * s, box[3] - oy - (merc(lat) - y0) * 180 / math.pi * s)
    for l in r["legs"]:
        d.line([xy(*c) for c in l["geom"]], fill=(76, 192, 139), width=5, joint="curve")
    for n in r["nodes"]:
        if n["star"] == 3:
            x, y = xy(n["ll"][1], n["ll"][0])
            d.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(230, 235, 232))
    title, body, small = ImageFont.truetype(FONT_TITLE, 104), ImageFont.truetype(FONT_BODY, 30), ImageFont.truetype(FONT_BODY, 26)
    km = round(sum(l["km"] for l in r["legs"]) / 1000)
    d.text((60, 160), "万里路书", font=title, fill=(255, 255, 255))
    for i, line in enumerate([f"全国自驾环线规划 · 约 {km} 千公里", f"{len(r['nodes'])} 个城镇村落与风景地", "带狗慢游 · 旅居 · 每日行程与花费"]):
        d.text((64, 300 + i * 50), line, font=body, fill=(178, 188, 183))
    d.text((64, 530), "wanlilushu.cn", font=small, fill=(76, 192, 139))
    img.save(path("public/og.png"), optimize=True)


if __name__ == "__main__":
    main()
