import sys, asyncio, json, time
from playwright.async_api import async_playwright

ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
RECORDER = """
window.__frames = [];
(function () {
  var last = null;
  var tick = function (t) { if (last !== null) window.__frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();
"""
SCROLL_BY = """
([dy, ms]) => new Promise((resolve) => {
  var from = window.scrollY, to = dy === null ? document.documentElement.scrollHeight - window.innerHeight : from + dy, start = performance.now();
  var step = function (t) {
    var p = Math.min(1, (t - start) / ms);
    window.scrollTo(0, from + (to - from) * p);
    if (p < 1) requestAnimationFrame(step); else resolve();
  };
  requestAnimationFrame(step);
})
"""
KEYS = ["LayoutCount", "RecalcStyleCount", "LayoutDuration", "RecalcStyleDuration", "ScriptDuration", "TaskDuration"]


def summarize(deltas, seconds):
    s = sorted(deltas)
    at = lambda p: round(s[min(len(s) - 1, int(p * len(s)))], 1)
    avg = sum(deltas) / len(deltas)
    over = len([d for d in deltas if d > 33.4])
    return {"frames": len(deltas), "fps": round(1000 / avg, 1), "p50": at(0.5), "p90": at(0.9), "p99": at(0.99), "max": round(s[-1], 1), "over33": over, "over33_per10s": round(over * 10 / max(seconds, 0.1), 1)}


async def label(cdp, node_id):
    try:
        d = await cdp.send("DOM.describeNode", {"backendNodeId": node_id})
        n = d["node"]
        a = n.get("attributes", [])
        attrs = {a[i]: a[i + 1] for i in range(0, len(a), 2)}
        name = n["nodeName"].lower()
        if attrs.get("id"):
            name += "#" + attrs["id"]
        if attrs.get("class"):
            name += "." + ".".join(attrs["class"].split()[:3])
        return name
    except Exception:
        return "node" + str(node_id)


async def main(url, script_path, seconds):
    sys.stdout.reconfigure(encoding="utf-8")
    steps = None if script_path == "-" else [["wait", int(seconds * 1000)]] if script_path == "idle" else json.load(open(script_path, encoding="utf-8"))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        await cdp.send("Performance.enable")
        await cdp.send("LayerTree.enable")
        layers = {"list": []}
        cdp.on("LayerTree.layerTreeDidChange", lambda e: layers.__setitem__("list", e.get("layers") or layers["list"]))
        await pg.add_init_script(RECORDER)
        await pg.goto(url, wait_until="load")
        await pg.wait_for_timeout(300)
        mark = {}

        async def begin():
            mark["before"] = {m["name"]: m["value"] for m in (await cdp.send("Performance.getMetrics"))["metrics"]}
            mark["base"] = {l["layerId"]: l.get("paintCount", 0) for l in layers["list"]}
            await pg.evaluate("window.__frames = []")
            mark["start"] = time.time()

        await begin()
        if steps is None:
            await pg.wait_for_timeout(2500)
            await pg.evaluate(SCROLL_BY, [None, int(max(1.0, seconds - 3.5) * 1000)])
            await pg.wait_for_timeout(1000)
        else:
            for s in steps:
                k = s[0]
                if k == "wait": await pg.wait_for_timeout(s[1])
                elif k == "scroll": await pg.evaluate(SCROLL_BY, [s[1], s[2] if len(s) > 2 else 600])
                elif k == "scrollTo": await pg.evaluate(f"window.scrollTo(0,{s[1]})")
                elif k == "scrollAll": await pg.evaluate(SCROLL_BY, [None, s[1]])
                elif k == "sel": await pg.evaluate(f"document.querySelector({json.dumps(s[1])}).scrollIntoView({{block:'start'}})")
                elif k in ("tap", "click"): await pg.touchscreen.tap(s[1], s[2])
                elif k == "press": await pg.evaluate(f"document.querySelector({json.dumps(s[1])}).click()")
                elif k == "js": await pg.evaluate(s[1])
                elif k == "mark": await begin()
            rest = seconds - (time.time() - mark["start"])
            if rest > 0:
                await pg.wait_for_timeout(int(rest * 1000))
        span = time.time() - mark["start"]
        before, base = mark["before"], mark["base"]
        deltas = await pg.evaluate("window.__frames")
        after = {m["name"]: m["value"] for m in (await cdp.send("Performance.getMetrics"))["metrics"]}
        for l in layers["list"]:
            l["fresh"] = l.get("paintCount", 0) - base.get(l["layerId"], 0)
        top = sorted([l for l in layers["list"] if l["fresh"] > 2], key=lambda l: -l["fresh"] * l["width"] * l["height"])[:8]
        painted = []
        for l in top:
            name = await label(cdp, l["backendNodeId"]) if l.get("backendNodeId") else "이름 없는 층(가상요소 등) " + l["layerId"]
            painted.append({"layer": name, "paints": l["fresh"], "size": f"{round(l['width'])}x{round(l['height'])}", "area": round(l["width"] * l["height"]), "per10s": round(l["fresh"] * 10 / max(span, 0.1), 1)})
        await b.close()
    result = {"url": url, "seconds": round(span, 1), "frames": summarize(deltas, span), "work": {k: round(after.get(k, 0) - before.get(k, 0), 3) for k in KEYS}, "repainted": painted, "errors": errs[:8]}
    print(json.dumps(result, ensure_ascii=False, indent=1))
    f = result["frames"]
    print("판정:", "통과" if f["over33_per10s"] <= 6 and f["p90"] <= 17 else "렉 의심", f"(33ms 넘는 장면 10초당 {f['over33_per10s']}번 · p90 {f['p90']}ms)")
    for l in painted:
        if l["per10s"] > 20 and l["area"] >= 40000:
            print("다시 그리기 많음:", l["layer"], l["size"], f"10초당 {l['per10s']}번")


asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "-", float(sys.argv[3]) if len(sys.argv) > 3 else 10))
