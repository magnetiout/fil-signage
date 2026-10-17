#!/usr/bin/env python3
"""Low-rate public discovery; caches API pages and linked first-party image URLs."""
import argparse,json,pathlib,time,urllib.request,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--cache',type=pathlib.Path,required=True);a=p.parse_args();h=a.cache;h.mkdir(parents=True,exist_ok=True)
def read(name,route):
 f=h/name
 if f.exists():return json.loads(f.read_text())
 time.sleep(1)
 with urllib.request.urlopen('https://etiliseramik.com/?rest_route='+route,timeout=40)as r:
  assert 'json'in r.headers.get('Content-Type','');data=json.load(r)
 f.write_text(json.dumps(data,ensure_ascii=False,indent=2));return data
products=[]
for page in range(1,100):
 rows=read(f'products-{page}.json',f'/wc/store/v1/products&per_page=100&page={page}');products.extend(rows)
 if len(rows)<100:break
categories=[]
for page in range(1,100):
 rows=read('categories'+(''if page==1 else str(page))+'.json',f'/wc/store/v1/products/categories&per_page=100&page={page}');categories.extend(rows)
 if len(rows)<100:break
images={}
def add(url,role,kind=None):
 assert urllib.parse.urlparse(url).hostname=='etiliseramik.com'
 row=images.setdefault(url,{'url':url,'roles':[],'type':kind});row['roles'].append(role)
for product in products:
 for i,image in enumerate(product['images']):add(image['src'],{'product_id':product['id'],'position':i,'source_role':'product_gallery'})
for c in categories:
 if c.get('image'):add(c['image']['src'],{'series_id':c['id'],'source_role':'series_cover'})
for color in ['black','white']:add('https://etiliseramik.com/media/2025/09/etili_seramik_'+color+'.png',{'source_role':'official_logo'},'corporate_logo')
(h/'image-sources.json').write_text(json.dumps(list(images.values()),ensure_ascii=False,indent=2));print(json.dumps({'products':len(products),'series':len(categories),'image_urls':len(images)}))
