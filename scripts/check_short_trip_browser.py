"""Isolated UI regression with an explicitly mocked AMap SDK; no live route claims."""
import json
import urllib.parse
from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:5180/"
NATIONAL_KEY = "wanlilushu.input.v2"
SHORT_KEY = "wanlilushu.short.v1"
MOCK = """
window.__driveCalls = [];
window.AMap = {
  plugin: (_plugins, cb) => cb(),
  LngLat: class { constructor(lng, lat) { this.lng = lng; this.lat = lat; } },
  DrivingPolicy: { LEAST_TIME: 0, LEAST_FEE: 1, LEAST_DISTANCE: 2 },
  PlaceSearch: class {
    search(query, cb) {
      const index = query.includes('出发') ? 0 : query.includes('目的') ? 1 : query.includes('甲') ? 2 : 3;
      const poi = {name: query, pname: '测试省', cityname: '测试市', address: '仅用于测试', location: {lng: 120 + index * 0.1, lat: 30 + index * 0.1}};
      setTimeout(() => cb('complete', {poiList: {pois: [poi]}}), window.__searchDelay || 0);
    }
  },
  Driving: class {
    constructor(options) { this.options = options; }
    search(from, to, cb) {
      window.__driveCalls.push({from, to, policy: this.options.policy});
      if (window.__failDrive) return cb('error', 'NO_ROUTE');
      cb('complete', {routes: [{distance: 100000, time: 7200, tolls: 20, steps: [{path: [from, to]}]}]});
    }
  },
  Map: class { add() {} setFitView() {} destroy() {} },
  Marker: class {}, Polyline: class {}
};
window.___onAPILoaded();
"""


def local_context(browser, viewport=None, missing_key=False, storage=None):
    context = browser.new_context(viewport=viewport or {"width": 1280, "height": 900}, accept_downloads=True)
    def route_request(route):
        url = urllib.parse.urlparse(route.request.url)
        if url.hostname == "127.0.0.1":
            if url.path == "/src/components/amapLoader.ts":
                if missing_key:
                    body = "export const AMAP_ENABLED=false; export function loadAMap(){return Promise.reject(new Error('Missing key'));}"
                else:
                    # The UI fixture does not depend on .env or send a real credential anywhere.
                    body = """export const AMAP_ENABLED=true;
                    let sdk;
                    export function loadAMap() {
                      if (!sdk) sdk = new Promise((resolve, reject) => {
                        window.___onAPILoaded = () => resolve(window.AMap);
                        const script = document.createElement('script');
                        script.src = 'https://webapi.amap.com/maps?fixture=short-trip';
                        script.onerror = () => reject(new Error('Mock SDK unavailable'));
                        document.head.appendChild(script);
                      });
                      return sdk;
                    }"""
                route.fulfill(content_type="text/javascript", body=body)
            else:
                route.continue_()
        elif url.hostname == "webapi.amap.com" and url.path == "/maps":
            route.fulfill(content_type="text/javascript", body=MOCK)
        else:
            route.abort()
    context.route("**/*", route_request)
    context.add_init_script("localStorage.clear();" + ("localStorage.setItem(%s,%s);" % (json.dumps(NATIONAL_KEY), json.dumps(storage)) if storage else ""))
    return context


def pick(page, label, query):
    field = page.locator(".trip-place").filter(has=page.get_by_label(label, exact=True))
    page.get_by_label(label, exact=True).fill(query)
    field.get_by_role("button", name="搜索", exact=True).click()
    field.get_by_role("button").filter(has_text=query).click()
    expect(field).to_contain_text("已选择：" + query)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    national = json.dumps({"start": "成都", "routeOrder": "loop"}, ensure_ascii=False)
    for viewport in [{"width": 1280, "height": 900}, {"width": 390, "height": 844}]:
        context = local_context(browser, viewport, storage=national)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until="domcontentloaded")
        page.get_by_role("button", name="短途自驾", exact=True).click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "form horizontal overflow"
        page.screenshot(path=f"/private/tmp/wanlilushu-short-form-{viewport['width']}.png", full_page=True)
        pick(page, "出发点", "测试出发点")
        pick(page, "目的地", "测试目的地")
        page.get_by_label("总天数（包含出发和返程日）").fill("1")
        page.get_by_role("button", name="生成短途路书").click()
        expect(page.get_by_role("heading", name="测试出发点 → 测试目的地", exact=True)).to_be_visible()
        assert len(page.evaluate("window.__driveCalls")) == 2
        calls = page.evaluate("window.__driveCalls")
        assert calls[0]["from"] == calls[1]["to"] and calls[0]["to"] == calls[1]["from"]
        page.get_by_role("button", name="每日行程", exact=True).click()
        if viewport["width"] < 760:
            tabs = page.get_by_role("navigation", name="短途页签").bounding_box()
            assert abs(tabs["y"] + tabs["height"] - viewport["height"]) < 2, "mobile navigation overlaps the header"
        expect(page.locator(".short-day")).to_have_count(1)
        expect(page.locator(".short-day")).to_contain_text("回到出发点，行程结束")
        page.get_by_text("导出路书", exact=True).click()
        with page.expect_download() as download:
            page.get_by_role("button", name="导出 GPX", exact=True).click()
        assert download.value.suggested_filename.endswith(".gpx")
        page.get_by_role("button", name="调整条件", exact=True).click()
        page.get_by_label("目的地", exact=True).fill("未选择的新目的地")
        page.get_by_role("button", name="生成短途路书").click()
        expect(page.get_by_role("alert")).to_contain_text("选择出发点和目的地")
        assert len(page.evaluate("window.__driveCalls")) == 2
        pick(page, "目的地", "测试目的地")
        page.get_by_label("每天最多驾驶几小时（纯驾驶）").fill("1")
        page.get_by_role("button", name="生成短途路书").click()
        expect(page.get_by_role("alert")).to_contain_text("至少需要 4 天")
        page.get_by_label("总天数（包含出发和返程日）").fill("5")
        page.get_by_role("button", name="生成短途路书").click()
        page.get_by_role("button", name="每日行程", exact=True).click()
        expect(page.locator(".short-day")).to_have_count(5)
        expect(page.locator(".short-day").first).to_contain_text("住宿地点待选")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "horizontal overflow"
        page.screenshot(path=f"/private/tmp/wanlilushu-short-{viewport['width']}.png", full_page=True)
        page.get_by_role("button", name="返回全国路书", exact=True).click()
        expect(page.get_by_role("navigation", name="页签", exact=True)).to_be_visible()
        assert json.loads(page.evaluate("localStorage.getItem(%s)" % json.dumps(NATIONAL_KEY)))["start"] == "成都"
        page.get_by_role("button", name="短途自驾", exact=True).click()
        expect(page.get_by_label("总天数（包含出发和返程日）")).to_have_value("5")
        assert not errors, errors
        print("PASS mocked route generation, return direction, exports, stale selection, daily limit, storage isolation", viewport["width"])
        context.close()

    context = local_context(browser)
    page = context.new_page()
    page.goto(BASE + "#short", wait_until="domcontentloaded")
    pick(page, "出发点", "测试出发点")
    pick(page, "目的地", "测试目的地")
    page.get_by_text("途经点（按到访顺序，可选）", exact=True).click()
    page.get_by_role("button", name="＋ 添加途经点").click()
    pick(page, "途经点 1", "测试甲")
    page.get_by_role("button", name="＋ 添加途经点").click()
    pick(page, "途经点 2", "测试乙")
    page.get_by_role("button", name="移除途经点 1", exact=True).click()
    expect(page.get_by_label("途经点 1", exact=True)).to_have_value("测试乙")
    page.evaluate("window.__searchDelay = 300")
    field = page.locator(".trip-place").filter(has=page.get_by_label("途经点 1", exact=True))
    page.get_by_label("途经点 1", exact=True).fill("过期查询")
    field.get_by_role("button", name="搜索", exact=True).click()
    page.get_by_label("途经点 1", exact=True).fill("当前查询")
    page.wait_for_timeout(400)
    expect(field.locator(".ap-list li")).to_have_count(0)
    page.get_by_role("button", name="移除途经点 1", exact=True).click()
    page.evaluate("window.__failDrive = true")
    page.get_by_role("button", name="生成短途路书").click()
    expect(page.get_by_role("alert")).to_contain_text("没有查到驾车路线")
    expect(page.get_by_role("navigation", name="短途页签")).to_have_count(0)
    assert page.evaluate("localStorage.getItem(%s)" % json.dumps(SHORT_KEY)) is None
    print("PASS waypoint deletion, late search results, route failure and no partial save")
    context.close()

    context = local_context(browser, missing_key=True)
    page = context.new_page()
    page.goto(BASE + "#short", wait_until="domcontentloaded")
    expect(page.get_by_role("status")).to_contain_text("未配置高德地图 Key")
    expect(page.get_by_role("button", name="生成短途路书")).to_be_disabled()
    print("PASS missing key shows actionable text and prevents generation")
    context.close()
    browser.close()
