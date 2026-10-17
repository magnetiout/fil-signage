#!/usr/bin/env python3
"""Read-only public Etili catalog capture, two connections, globally <=1.25 requests/s.
No authentication, dealer area, cart, private account or third-party host requests.
Raw originals stay outside Git; cache makes restart incremental.
"""
import argparse,concurrent.futures,datetime,hashlib,html,json,pathlib,re,threading,time,urllib.request,urllib.parse,xml.etree.ElementTree as ET
from html.parser import HTMLParser
class Node:
 def __init__(self,tag='',attrs=()):self.tag=tag;self.attrs=dict(attrs);self.children=[]
 def text(self):return ' '.join((x.text()if isinstance(x,Node)else x).strip()for x in self.children).strip()
 def all(self,predicate):
  out=[]
  for c in self.children:
   if isinstance(c,Node):
    if predicate(c):out.append(c)
    out.extend(c.all(predicate))
  return out
class Document(HTMLParser):
 def __init__(self,s):super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root];self.feed(s)
 def handle_starttag(self,tag,attrs):
  n=Node(tag,attrs);self.stack[-1].children.append(n)
  if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(n)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==tag:self.stack=self.stack[:i];break
 def handle_data(self,data):self.stack[-1].children.append(data)
def cls(n,c):return c in n.attrs.get('class','').split()
def parse_detail(s):
 d=Document(s).root;spec=d.all(lambda n:cls(n,'seramik-ozellikler'));specs={}
 if spec:
  fields=[n.text()for n in spec[0].children if isinstance(n,Node)and n.tag=='div'];specs=dict(zip(fields[::2],fields[1::2]))
 galleries=d.all(lambda n:cls(n,'woocommerce-product-gallery__wrapper'));images=[]
 if galleries:
  for n in galleries[0].all(lambda n:n.tag=='img'):
   url=n.attrs.get('data-large_image')or n.attrs.get('data-src')or n.attrs.get('src')
   if url and url not in [i['url']for i in images]:images.append({'url':url,'alt':n.attrs.get('alt',''),'source_role':'product_gallery','type':None})
 return {'specifications':specs,'gallery':images,'videos':[n.attrs.get('src')for n in d.all(lambda n:n.tag in {'video','source'})if n.attrs.get('src')]}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--cache',type=pathlib.Path,required=True);a=ap.parse_args();h=a.cache;(h/'pages').mkdir(exist_ok=True,parents=True)
 products=[p for f in sorted(h.glob('products-[0-9]*.json'))for p in json.loads(f.read_text())];assert len({p['id']for p in products})==len(products)
 lock=threading.Lock();last=[0.0]
 def fetch(p):
  dest=h/'pages'/f"{p['id']}.html"
  if not dest.exists():
   for attempt in range(2):
    with lock:
     time.sleep(max(0,.8-(time.monotonic()-last[0])));last[0]=time.monotonic()
    try:
     assert urllib.parse.urlparse(p['permalink']).hostname=='etiliseramik.com'
     req=urllib.request.Request(p['permalink'],headers={'User-Agent':'FILSign-Etili-authorized-demo/1.0'})
     with urllib.request.urlopen(req,timeout=30)as r:b=r.read();assert 'text/html'in r.headers.get('content-type','')
     dest.write_bytes(b);break
    except Exception as e:
     if attempt==1:return {'id':p['id'],'url':p['permalink'],'error':type(e).__name__}
     time.sleep(3)
  b=dest.read_bytes();detail=parse_detail(b.decode('utf-8','replace'));return {'id':p['id'],'url':p['permalink'],'name':html.unescape(p['name']),'sku':p['sku']or None,'source_type':p['type'],'source_parent':p['parent'],'source_variation':p['variation'],'series':p['categories'],'source_description':html.unescape(re.sub('<[^>]+>',' ',p['description'])).strip(),**detail,'store_images':p['images'],'html_sha256':hashlib.sha256(b).hexdigest(),'downloaded_at':datetime.datetime.fromtimestamp(dest.stat().st_mtime,datetime.timezone.utc).isoformat(),'missing_fields':[k for k,v in [('sku',p['sku']),('description',p['description']),('technical_specifications',detail['specifications'])]if not v]}
 rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
  for row in pool.map(fetch,products):
   rows.append(row)
   if len(rows)%25==0:print(f'{len(rows)}/{len(products)} captured; errors {sum("error"in r for r in rows)}',flush=True);(h/'catalog-progress.json').write_text(json.dumps(rows,ensure_ascii=False))
 (h/'catalog-raw.json').write_text(json.dumps({'source':'https://etiliseramik.com/','captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'records':rows},ensure_ascii=False,indent=2));print('COMPLETE',len(rows),flush=True)
if __name__=='__main__':main()
