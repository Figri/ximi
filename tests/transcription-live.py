"""Live API isolation smoke; creates two disabled fixture devices, no real model keys.
Deletes its own test jobs. Never copies credentials from any existing device.
"""
import json,urllib.request,urllib.error,os
from pathlib import Path
BASE='https://xrnqpwwomyzekjfhjixl.supabase.co/functions/v1/'
def call(fn,body):
 try:
  with urllib.request.urlopen(urllib.request.Request(BASE+fn,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}),timeout=30) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
path=Path('/tmp/ximi-transcription-live-fixtures.json')
if path.exists():fixtures=json.loads(path.read_text())
else:
 fixtures=[call('ling',{'action':'register'})[1] for _ in range(2)];path.write_text(json.dumps(fixtures));os.chmod(path,0o600)
a,b=fixtures
assert call('transcribe',{'action':'list'})[0]==401
status,first=call('transcribe',{**a,'action':'create','url':'https://www.bilibili.com/video/BV17x411w7KC','api_key':'fixture-not-real'})
assert status==200,(status,first)
id=first['job']['id']
try:
 assert 'api_key' not in first['job']
 assert call('transcribe',{**a,'action':'create','url':'https://www.bilibili.com/video/BV17x411w7KC?share_source=copy'})[1]['job']['id']==id
 assert call('transcribe',{**b,'action':'get','id':id})[0]==404
 assert call('transcribe',{**b,'action':'delete','id':id})[0]==404
 assert call('transcribe',{**a,'action':'get','id':id})[0]==200
 assert call('transcribe',{'action':'claim','worker_token':'x'*64})[0]==401
finally:assert call('transcribe',{**a,'action':'delete','id':id})[0]==200
assert call('transcribe',{**a,'action':'get','id':id})[0]==404
print('PASS: live create/get/deduplicate, key redaction, owner isolation, deletion and unsigned worker rejection; fixture jobs removed, no paid ASR call.')
