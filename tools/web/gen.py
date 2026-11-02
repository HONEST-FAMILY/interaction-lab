import argparse, base64, json, os, subprocess, sys, uuid, mimetypes

p = argparse.ArgumentParser()
p.add_argument("--prompt", default="")
p.add_argument("--prompt-file", default="")
p.add_argument("--out", required=True)
p.add_argument("--model", default="gemini-3-pro-image")
p.add_argument("--aspect", default="16:9")
p.add_argument("--size", default="2K")
p.add_argument("--input", action="append", default=[])
a = p.parse_args()

prompt = a.prompt
if a.prompt_file:
    prompt = open(a.prompt_file, encoding="utf-8").read()
if not prompt.strip():
    sys.exit("prompt required")

parts = [{"text": prompt}]
for path in a.input:
    mime = mimetypes.guess_type(path)[0] or "image/png"
    parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(open(path, "rb").read()).decode()}})

image_config = {"aspectRatio": a.aspect}
if a.model.startswith("gemini-3"):
    image_config["imageSize"] = a.size
body = {
    "contents": [{"parts": parts}],
    "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": image_config},
}

tag = "gen_" + uuid.uuid4().hex[:10]
local_body = os.path.join(os.environ.get("TEMP", "."), tag + ".json")
with open(local_body, "w", encoding="utf-8") as f:
    json.dump(body, f)

remote = f"/tmp/{tag}"
try:
    subprocess.run(["scp", "-q", local_body, f"honest-family:{remote}.json"], check=True)
finally:
    os.remove(local_body)

extract = (
    "import json,base64,sys\n"
    f"d=json.load(open('{remote}_out.json'))\n"
    "for c in d.get('candidates',[]):\n"
    "  for pt in c.get('content',{}).get('parts',[]):\n"
    "    dt=pt.get('inlineData') or pt.get('inline_data')\n"
    "    if dt:\n"
    f"      open('{remote}.img','wb').write(base64.b64decode(dt['data'])); print('OK', dt.get('mimeType') or dt.get('mime_type')); sys.exit(0)\n"
    "print('NOIMAGE', json.dumps(d, ensure_ascii=False)[:900])\n"
)
cmd = (
    "cd /home/forge/api.honest-family.com && "
    "K=$(grep '^GEMINI_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d '\"\\r'); "
    f"curl -sS -m 240 -H \"x-goog-api-key: $K\" -H 'Content-Type: application/json' "
    f"-X POST 'https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent' "
    f"--data-binary @{remote}.json -o {remote}_out.json; unset K; "
    f"python3 - <<'PYEOF'\n{extract}PYEOF\n"
)
r = subprocess.run(["ssh", "honest-family", cmd], capture_output=True, text=True, encoding="utf-8", errors="replace")
out = (r.stdout or "") + (r.stderr or "")
print(out.strip()[:1200])
ok = out.strip().startswith("OK")
if ok:
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    subprocess.run(["scp", "-q", f"honest-family:{remote}.img", a.out], check=True)
subprocess.run(["ssh", "honest-family", f"rm -f {remote}.json {remote}_out.json {remote}.img"], capture_output=True)
if ok:
    print("saved", a.out)
else:
    sys.exit(1)
