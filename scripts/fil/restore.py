#!/usr/bin/env python3
"""Restore only into a NEW empty isolated directory, never over production."""
import argparse,hashlib,json,sqlite3,tarfile,os
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('target',type=Path);a=p.parse_args()
if a.target.exists() and any(a.target.iterdir()):raise SystemExit('Refusing non-empty restore target')
a.target.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(a.target,0o700)
with tarfile.open(a.archive) as archive:archive.extractall(a.target,filter='data')
manifest=json.loads((a.target/'MANIFEST.json').read_text())
for name,digest in manifest.items():
 f=(a.target/name).resolve()
 if not f.is_relative_to(a.target.resolve()):raise RuntimeError('Invalid manifest path')
 if hashlib.sha256(f.read_bytes()).hexdigest()!=digest:raise RuntimeError('Checksum mismatch: '+name)
with sqlite3.connect(a.target/'db/remote_display.db') as db:
 if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('DB integrity failed')
 media=db.execute("SELECT filepath FROM content WHERE filepath<>'' AND remote_url IS NULL").fetchall()
 for (name,) in media:
  if not (a.target/'uploads/content'/Path(name).name).is_file():raise RuntimeError('Media missing: '+name)
 print(json.dumps({'integrity':'ok','checksums':len(manifest),'media_verified':len(media),'restored':str(a.target)}))
