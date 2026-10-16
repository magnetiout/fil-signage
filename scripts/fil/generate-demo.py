#!/usr/bin/env python3
"""Original synthetic FIL demo assets; no external imagery. Requires Pillow and ffmpeg."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import argparse, subprocess
p=argparse.ArgumentParser();p.add_argument('output',type=Path);args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
scenes=[('karsilama','Hoş geldiniz','FIL Signage · Sentetik demo'),('hizmetler','Birlikte keşfedelim','Hizmetler · Ürünler · Galeri'),('duyuru','Yeni bir deneyim','Tablette menü için ekrana dokunun')]
for portrait,size in [(False,(1920,1080)),(True,(1080,1920))]:
 w,h=size
 for i,(slug,title,subtitle) in enumerate(scenes):
  out=args.output/(slug+('-portrait' if portrait else '')+'.png')
  if out.exists():continue
  im=Image.new('RGB',size,(13,30,44));d=ImageDraw.Draw(im)
  d.rounded_rectangle((w*.06,h*.08,w*.94,h*.92),radius=60,fill=(20+i*8,64+i*8,82+i*7))
  d.ellipse((w*.58,h*.05,w*1.14,h*.65),fill=(30,110,126))
  d.text((w*.12,h*.25),'FIL /',font=ImageFont.truetype(font,int(w*.10)),fill='#a4ebd8')
  words=title.split();lines=[title] if not portrait else [' '.join(words[:2]),' '.join(words[2:])]
  for j,line in enumerate(lines):d.text((w*.12,h*.44+j*w*.08),line,font=ImageFont.truetype(font,int(w*.058)),fill='white')
  subtitle_lines=[subtitle] if not portrait else subtitle.split(' · ')
  for j,line in enumerate(subtitle_lines):d.text((w*.12,h*.70+j*60),line,font=ImageFont.truetype(font,int(w*.025)),fill='#d4e8eb')
  d.text((w*.12,h*.85),'TAMAMI ÖRNEK İÇERİKTİR',font=ImageFont.truetype(font,int(w*.018)),fill='#a4ebd8');im.save(out)
for i,slug in enumerate(['tanitim','kesfet']):
 out=args.output/(slug+'.mp4')
 if out.exists():continue
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-i',str(args.output/(scenes[i][0]+'.png')),'-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','6','-vf','scale=1920:1080,fade=t=in:st=0:d=1,fade=t=out:st=5:d=1','-r','15','-c:v','libx264','-threads','2','-preset','veryfast','-crf','29','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',str(out)],check=True)
print('Generated original 6 PNG + 2 playable MP4 demo assets.')
