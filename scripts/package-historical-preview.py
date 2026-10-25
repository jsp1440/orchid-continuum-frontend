"""Package the historical Vite build as a portable HTML design review."""
from pathlib import Path
import base64
import json
import re

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
page = (dist / 'index.html').read_text()
logo = 'data:image/webp;base64,' + base64.b64encode((root / 'public/original-logo.webp').read_bytes()).decode()
for asset in dist.glob('assets/*.css'):
    pattern = r'<link[^>]+href="/assets/' + re.escape(asset.name) + r'"[^>]*>'
    page = re.sub(pattern, lambda _: '<style>' + asset.read_text() + '</style>', page)
for asset in dist.glob('assets/*.js'):
    code = asset.read_text().replace('/original-logo.webp', logo).replace('</script', '<\\/script')
    pattern = r'<script[^>]+src="/assets/' + re.escape(asset.name) + r'"[^>]*></script>'
    page = re.sub(pattern, lambda _: '<script type="module">' + code + '</script>', page)
page = page.replace("frame-src 'none'", "frame-src 'self'")
(dist / 'original-homepage.html').write_text(page)
review = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orchid Continuum — Original Homepage Review</title><style>*{box-sizing:border-box}body{margin:0;background:#dce2dc;font:14px system-ui;color:#173021}header{padding:12px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#f8f5ed;border-bottom:1px solid #b9c4b9}header strong{margin-right:auto}button{padding:9px 12px;border:1px solid #8a9c8c;border-radius:7px;background:white;color:#173021;cursor:pointer}button[aria-pressed=true]{background:#173d29;color:white}main{overflow:auto;height:calc(100dvh - 70px);padding:16px}iframe{display:block;margin:auto;border:1px solid #bdc8bd;background:white;width:100%;height:100%;min-height:500px;box-shadow:0 8px 32px #20382020}small{font-size:12px}</style></head><body><header><strong>Orchid Continuum · Original homepage <small>June 6, 2026</small></strong><button data-width="100%" aria-pressed="true">Desktop</button><button data-width="834px" aria-pressed="false">iPad portrait</button><button data-width="1194px" aria-pressed="false">iPad landscape</button><button data-width="390px" aria-pressed="false">Phone</button></header><main><iframe id="preview" title="Historical original homepage" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></main><script>const page=PAGE_JSON;const frame=document.getElementById('preview');frame.srcdoc=page;document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{frame.style.width=button.dataset.width;document.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));</script></body></html>'''
review = review.replace('PAGE_JSON', json.dumps(page).replace('</', '<\\/'))
(dist / 'review.html').write_text(review)
output = root.parent / 'Orchid_Original_Homepage.html'
output.write_text(review)
assert not re.search(r'<script[^>]+src=', page), 'External JavaScript remains'
assert "connect-src 'none'" in page
assert "form-action 'none'" in page
print(f'Created {output.name}: {output.stat().st_size} bytes')
