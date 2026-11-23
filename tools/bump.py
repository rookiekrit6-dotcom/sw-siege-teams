"""เปลี่ยนเลขเวอร์ชันเว็บ ให้มือถือที่เปิดค้าง/แคชไว้รีเฟรชเป็นเวอร์ชันใหม่เอง
ใช้ทุกครั้งที่แก้ app.js / style.css / index.html:  python tools/bump.py
"""
import json, os, re, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = time.strftime("%Y%m%d%H%M%S")
for name in ("index.html", "guide.html"):
  p = os.path.join(ROOT, name)
  h = open(p, encoding="utf-8").read()
  h = re.sub(r'window\.APP_V = "[^"]*"', f'window.APP_V = "{v}"', h)
  h = re.sub(r'(app\.js|style\.css)\?v=[\w.]+', lambda m: f"{m.group(1)}?v={v}", h)
  open(p, "w", encoding="utf-8").write(h)
json.dump({"v": v}, open(os.path.join(ROOT, "version.json"), "w"))
print("version", v)
