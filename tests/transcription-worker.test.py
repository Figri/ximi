import importlib.util,json,tempfile,unittest,wave,io
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('transcribe',Path('scripts/transcription/worker.py'));W=importlib.util.module_from_spec(spec);spec.loader.exec_module(W)
class WorkerTests(unittest.TestCase):
 def test_captions(self):
  self.assertEqual(W.subtitle_text('1\n00:00:01,000 --> 00:00:02,000\n第一行\n\n2\n00:00:02,000 --> 00:00:03,000\n12345'),'第一行\n12345')
  self.assertEqual(W.subtitle_text(json.dumps({'body':[{'from':0,'to':1,'content':'完整字幕🌙'}]})),'完整字幕🌙')
 def test_xiaoyuzhou(self):
  data={'props':{'pageProps':{'episode':{'title':'公开单集','media':{'source':{'url':'https://media.xyzcdn.net/test.m4a'}},'duration':100}}}}
  info=W.xiaoyuzhou_info('<script id="__NEXT_DATA__" type="application/json">'+json.dumps(data)+'</script>');self.assertEqual(info['audio'],'https://media.xyzcdn.net/test.m4a')
 def test_caption_skips_asr(self):
  seen=[];W.process({'id':'one','lease_token':'lease','url':'fixture','platform':'bilibili'},lambda i,l,d:seen.append(d),extractor=lambda *a:('标题','逐字原文',None),recognizer=lambda *a:self.fail('caption called ASR'));self.assertEqual(seen[-1]['text'],'逐字原文')
 def test_real_ffmpeg_resume(self):
  seen=[];lengths=[]
  def extract(url,platform,folder,tick):
   target=folder/'source.wav'
   with wave.open(str(target),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16000*225)
   return '长音频',None,target
  def recognize(path,key):
   with wave.open(str(path)) as f:lengths.append(f.getnframes()/f.getframerate());self.assertEqual(f.getnchannels(),1);self.assertEqual(f.getsampwidth(),2)
   self.assertLess(path.stat().st_size,8*1024*1024);return '识别文字'
  W.process({'id':'two','lease_token':'lease','url':'fixture','platform':'xiaoyuzhou','completed_parts':[0],'api_key':'fake'},lambda i,l,d:seen.append(d),extractor=extract,recognizer=recognize)
  self.assertEqual(len(lengths),2);self.assertTrue(all(d<=110 for d in lengths));self.assertEqual([d['part'] for d in seen if 'part'in d],[1,2]);self.assertEqual(seen[-1]['action'],'done')
 def test_asr_protocol(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'test.wav';p.write_bytes(b'RIFFfixture')
   def transport(req,timeout):
    self.assertEqual(req.full_url,'https://api.deepseek.com/v1/tools/asr');self.assertIn(b'name="file"',req.data);self.assertIn('multipart/form-data',req.headers['Content-type']);return io.BytesIO(json.dumps({'text':'语音识别原文'}).encode())
   self.assertEqual(W.asr(p,'fixture',transport),'语音识别原文')
 def test_assisted_caption(self):
  with tempfile.TemporaryDirectory() as tmp:
   with patch.object(W,'public_url',side_effect=lambda u:u),patch.object(W,'read_public',return_value=b'{"body":[{"content":"actual caption"}]}'):
    title,text,audio=W.hinted_extract({'title':'sample','caption_url':'https://aisubtitle.hdslb.com/test.json'},Path(tmp),lambda data:None)
    self.assertEqual(text,'actual caption');self.assertIsNone(audio)
   with self.assertRaises(W.MediaError):W.hinted_extract({'audio_url':'https://evil.test/private'},Path(tmp),lambda data:None)
 def test_private_links_rejected(self):
  for url in ['http://127.0.0.1/x','https://127.0.0.1/x','https://a@api.deepseek.com/x']:
   with self.assertRaises(W.MediaError):W.public_url(url)
if __name__=='__main__':unittest.main()
