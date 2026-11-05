import base64, json, time, urllib.request, os, sys

IMG = r"C:\Users\masca\work\timeto-gen\hy_input.png"
OUT = r"C:\Users\masca\work\timeto-3d\viewer\hy.glb"
API = "http://127.0.0.1:8081"

# 1) 서버 뜰 때까지 (모델 자동 다운로드 포함). 최대 40분
t0 = time.time()
while time.time() - t0 < 2400:
    try:
        urllib.request.urlopen(API + "/docs", timeout=3)
        print("SERVER_UP after", int(time.time() - t0), "s", flush=True)
        break
    except Exception:
        time.sleep(10)
else:
    print("SERVER_TIMEOUT", flush=True); sys.exit(1)

# 2) 이미지 투입
payload = {
    "image": base64.b64encode(open(IMG, "rb").read()).decode(),
    "octree_resolution": 128,
    "num_inference_steps": 8,
    "guidance_scale": 5.0,
    "face_count": 6000,
    "texture": False,
    "seed": 1234,
    "type": "glb",
}
req = urllib.request.Request(API + "/generate", data=json.dumps(payload).encode(),
                             headers={"Content-Type": "application/json"})
t1 = time.time()
with urllib.request.urlopen(req, timeout=1800) as r:
    data = r.read()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "wb").write(data)
print("GLB_SAVED", OUT, len(data), "bytes in", int(time.time() - t1), "s", flush=True)
