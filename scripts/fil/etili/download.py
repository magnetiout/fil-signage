#!/usr/bin/env python3
"""Cache only linked first-party public images; originals never uploaded to VPS."""
import argparse,hashlib,json,pathlib,time,urllib.request,urllib.parse,datetime
p=argparse.ArgumentParser();p.add_argument('--cache',type=pathlib.Path,required=True);a=p.parse_args();h=a.cache;rows=json.loads((h/'image-sources.json').read_text());(h/'originals').mkdir(exist_ok=True)
for i,row in enumerate(rows):
 url=row['url'];assert urllib.parse.urlparse(url).hostname=='etiliseramik.com';ext=pathlib.Path(urllib.parse.urlparse(url).path).suffix.lower();name=hashlib.sha256(url.encode()).hexdigest()+ext;dest=h/'originals'/name
 if not dest.exists():
  time.sleep(1)
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'FILSign-Etili-authorized-demo/1.0'}),timeout=30)as r:
    assert urllib.parse.urlparse(r.geturl()).hostname=='etiliseramik.com';b=r.read();assert len(b)<40*1024*1024
   dest.write_bytes(b)
  except Exception as e:row['error']=type(e).__name__;continue
 row.update(original_file=str(dest),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),bytes=dest.stat().st_size,downloaded_at=datetime.datetime.fromtimestamp(dest.stat().st_mtime,datetime.timezone.utc).isoformat())
 if i%25==0:print(f'{i+1}/{len(rows)} images; cached bytes '+str(sum(r.get('bytes',0)for r in rows)),flush=True);(h/'images-progress.json').write_text(json.dumps(rows,ensure_ascii=False))
(h/'images.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));print('COMPLETE',len(rows),'errors',sum('error'in r for r in rows))
