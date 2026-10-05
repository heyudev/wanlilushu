"""Helpers for AMap Web Service scripts: read keys from .env, convert WGS84 to GCJ-02."""
import math
from _common import path


def env():
    vals = {}
    with open(path(".env"), encoding="utf-8") as f:
        for line in f:
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                vals[k] = v
    if not vals.get("AMAP_WEB_KEY"):
        raise SystemExit("AMAP_WEB_KEY missing in .env")
    return vals


def gcj(lon, lat):
    """WGS84 → GCJ-02, same formula as src/lib/coords.ts."""
    a, ee = 6378245.0, 0.00669342162296594

    def tlat(x, y):
        r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
        r += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
        r += (20 * math.sin(y * math.pi) + 40 * math.sin(y / 3 * math.pi)) * 2 / 3
        r += (160 * math.sin(y / 12 * math.pi) + 320 * math.sin(y * math.pi / 30)) * 2 / 3
        return r

    def tlon(x, y):
        r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
        r += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
        r += (20 * math.sin(x * math.pi) + 40 * math.sin(x / 3 * math.pi)) * 2 / 3
        r += (150 * math.sin(x / 12 * math.pi) + 300 * math.sin(x / 30 * math.pi)) * 2 / 3
        return r

    dlat, dlon = tlat(lon - 105, lat - 35), tlon(lon - 105, lat - 35)
    rad = lat / 180 * math.pi
    magic = 1 - ee * math.sin(rad) ** 2
    sq = math.sqrt(magic)
    dlat = dlat * 180 / ((a * (1 - ee)) / (magic * sq) * math.pi)
    dlon = dlon * 180 / (a / sq * math.cos(rad) * math.pi)
    return lon + dlon, lat + dlat
