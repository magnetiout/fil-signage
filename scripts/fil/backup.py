#!/usr/bin/env python3
"""Consistent project-only cold backup using SQLite backup, checksums and bounded rotation."""
import argparse, datetime, hashlib, json, os, shutil, sqlite3, subprocess, tarfile, tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--env',type=Path);p.add_argument('--service',required=True);p.add_argument('--user-service',action='store_true');a=p.parse_args()
if not a.service.startswith('fil-signage') or '/' in a.service:raise SystemExit('Only a dedicated fil-signage service is accepted')
a.output.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(a.output,0o700)
ctl=['systemctl']+(['--user'] if a.user_service else [])
was_running=subprocess.run(ctl+['is-active','--quiet',a.service]).returncode==0
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
dest=a.output/('fil-signage-'+stamp+'.tar.gz')
try:
 if was_running:subprocess.run(ctl+['stop',a.service],check=True)
 with tempfile.TemporaryDirectory(prefix='fil-backup-',dir=a.output) as temp:
  root=Path(temp);(root/'db').mkdir()
  with sqlite3.connect(a.data/'db/remote_display.db') as src,sqlite3.connect(root/'db/remote_display.db') as target:
   src.backup(target)
   if target.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Database integrity failed')
  for name in ['uploads','fil-kiosk','certs']:
   if (a.data/name).exists():shutil.copytree(a.data/name,root/name)
  if a.env:shutil.copyfile(a.env,root/'runtime.env')
  manifest={str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in root.rglob('*') if f.is_file()}
  (root/'MANIFEST.json').write_text(json.dumps(manifest,indent=2))
  partial=dest.with_suffix('.partial')
  with tarfile.open(partial,'w:gz') as archive:
   for child in root.iterdir():archive.add(child,arcname=child.name,recursive=True)
  os.chmod(partial,0o600);partial.rename(dest)
 for old in sorted(a.output.glob('fil-signage-*.tar.gz'))[:-7]:old.unlink()
 if datetime.datetime.now(datetime.timezone.utc).weekday()==6:
  weekly=a.output/('fil-weekly-'+stamp+'.tar.gz');shutil.copyfile(dest,weekly);os.chmod(weekly,0o600)
  for old in sorted(a.output.glob('fil-weekly-*.tar.gz'))[:-4]:old.unlink()
 print(json.dumps({'archive':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'files':len(manifest),'integrity':'ok'}))
finally:
 if was_running:subprocess.run(ctl+['start',a.service],check=True)
