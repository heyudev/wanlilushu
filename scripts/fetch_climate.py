"""Monthly climate normals for every stop from Open-Meteo's historical archive (ERA5-based).

Open-Meteo counts long requests as many calls, so the period is configurable; each entry records its period.
Writes data/generated/climate.json: {id: {"elev": m, "period": "2022–2025", "months": [[tmax, tmin, rh, rainy_days], ... 12]}}
"""
START, END = "2022-01-01", "2025-12-31"
import os, statistics as st, time, urllib.parse
from collections import defaultdict
from _common import get_json, load, save, path

OUT = "data/generated/climate.json"


def main():
    nodes = load("data/route.json")["nodes"]
    out = load(OUT) if os.path.exists(path(OUT)) else {}
    for n in nodes:
        if n["id"] in out:
            continue
        q = urllib.parse.urlencode(dict(latitude=n["ll"][0], longitude=n["ll"][1], start_date=START, end_date=END,
                                        daily="temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum",
                                        timezone="Asia/Shanghai"))
        d = get_json(f"https://archive-api.open-meteo.com/v1/archive?{q}", timeout=120)
        m = defaultdict(list)
        dd = d["daily"]
        for t, a, b, h, p in zip(dd["time"], dd["temperature_2m_max"], dd["temperature_2m_min"],
                                 dd["relative_humidity_2m_mean"], dd["precipitation_sum"]):
            if None in (a, b, h, p):
                continue
            m[int(t[5:7])].append((a, b, h, p))
        months = []
        for k in range(1, 13):
            v = m[k]
            months.append([round(st.mean(x[0] for x in v), 1), round(st.mean(x[1] for x in v), 1),
                           round(st.mean(x[2] for x in v)), round(sum(1 for x in v if x[3] >= 1) / len(v) * 30, 1)])
        out[n["id"]] = {"elev": d.get("elevation"), "period": f"{START[:4]}–{END[:4]}", "months": months}
        save(OUT, out, indent=None)
        print(n["id"], months[0][:2], months[6][:2])
        time.sleep(4)  # the archive API rate-limits multi-year requests
    save(OUT, out, indent=None)


if __name__ == "__main__":
    main()
