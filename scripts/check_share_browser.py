import base64
import json
import urllib.parse
import zlib
from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:5180/"
KEY = "wanlilushu.input.v2"


def code(value):
    compressor = zlib.compressobj(wbits=-15)
    raw = json.dumps(value, ensure_ascii=False).encode()
    packed = compressor.compress(raw) + compressor.flush()
    return base64.urlsafe_b64encode(packed).decode().rstrip("=")


def check(browser, name, saved, query, expected, started=False, extra_script=""):
    context = browser.new_context()
    context.route("**/*", lambda route: route.continue_() if urllib.parse.urlparse(route.request.url).hostname == "127.0.0.1" else route.abort())
    script = "localStorage.clear();"
    if saved is not None:
        script += "localStorage.setItem(%s, %s);" % (json.dumps(KEY), json.dumps(saved))
    context.add_init_script(script + extra_script)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + query, wait_until="domcontentloaded")
    page.get_by_role("status").filter(has_text=expected).wait_for(timeout=15000)
    if started:
        page.get_by_role("navigation", name="页签").wait_for()
    else:
        page.get_by_role("button", name="生成我的路书").wait_for()
    if "plan=" in query:
        page.wait_for_function("!new URLSearchParams(location.search).has('plan')")
        assert urllib.parse.parse_qs(urllib.parse.urlparse(page.url).query) == {"source": ["smoke"]}, page.url
        assert urllib.parse.urlparse(page.url).fragment == "days", page.url
    stored = page.evaluate("localStorage.getItem(%s)" % json.dumps(KEY)) if not extra_script else None
    assert not errors, errors
    print("PASS", name)
    context.close()
    return stored


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    damaged = '{"custom":null}'
    assert check(browser, "damaged saved fields stay intact on the welcome screen", damaged, "", "本地保存的路书已损坏") == damaged
    assert check(browser, "broken saved JSON stays intact on the welcome screen", "{broken", "", "本地保存的路书已损坏") == "{broken"
    check(browser, "bad share without a saved plan shows welcome feedback", None, "?plan=not-a-plan&source=smoke#days", "分享链接已损坏，请重新设置")
    check(browser, "empty share is rejected and other URL parts survive", None, "?plan=&source=smoke#days", "分享链接已损坏，请重新设置")
    saved = json.dumps({"start": "成都", "routeOrder": "loop"}, ensure_ascii=False)
    kept = check(browser, "bad share retains a valid saved plan", saved, "?plan=" + code({"startDate": "2027-02-30"}) + "&source=smoke#days", "打开的是你自己的路书", started=True)
    assert json.loads(kept)["start"] == "成都"
    shared = {"start": "广州", "routeOrder": "loop", "dog": False, "hotelPerRoom": 300}
    restored = check(browser, "old partial share restores and saves the selected plan", saved, "?plan=" + code(shared) + "&source=smoke#days", "已打开分享的路书", started=True)
    assert json.loads(restored)["start"] == "广州"
    assert json.loads(restored)["hotelPerRoom"] == 300
    check(browser, "nested invalid custom stop is rejected without a page error", None, "?plan=" + code({"custom": [{"id": "broken"}]}) + "&source=smoke#days", "分享链接已损坏，请重新设置")
    check(browser, "denied storage reads show feedback", None, "", "浏览器无法读取本地路书", extra_script="Storage.prototype.getItem = function() { throw new Error('denied read'); };")
    check(browser, "failed saves keep the current plan visible and show feedback", saved, "", "路书暂时无法保存在浏览器里", started=True, extra_script="Storage.prototype.setItem = function() { throw new Error('denied write'); };")
    browser.close()
