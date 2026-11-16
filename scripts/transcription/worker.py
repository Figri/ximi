"""Public-media subtitle first, otherwise resumable <=110s DeepSeek ASR segments.
Pipeline references: DoTheWorkNow/podcast-transcriber and iBigQiang/feedgrab.
Extraction uses yt-dlp (Unlicense); no model writes/summarizes the transcript.
No user audio, keys, transcripts, signed media URLs or HTTP bodies are logged.
"""
import html,json,math,os,re,socket,ipaddress,subprocess,tempfile,time,uuid
from pathlib import Path
from urllib.parse import urlparse,urljoin
from urllib.request import Request,urlopen,HTTPRedirectHandler,build_opener
from urllib.error import HTTPError,URLError
USER_AGENT='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
SEGMENT=110
class MediaError(Exception): pass
class StaleJob(Exception): pass

def public_url(url):
    u=urlparse(url)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443):raise MediaError('来源链接不受支持')
    try:
        addresses=socket.getaddrinfo(u.hostname,443,type=socket.SOCK_STREAM)
        if any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise MediaError('来源链接不受支持')
    except socket.gaierror:raise MediaError('暂时无法连接来源网站，请稍后重试')
    return url
class PublicRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return super().redirect_request(req,fp,code,msg,headers,public_url(urljoin(req.full_url,newurl)))
opener=build_opener(PublicRedirect())
def read_public(url,limit=12*1024*1024):
    response=opener.open(Request(public_url(url),headers={'User-Agent':USER_AGENT,'Referer':'https://www.bilibili.com/'}),timeout=45)
    with response:
        if int(response.headers.get('Content-Length',0))>limit:raise MediaError('文件过大，暂时无法处理')
        data=response.read(limit+1)
        if len(data)>limit:raise MediaError('文件过大，暂时无法处理')
        return data

def resolve_link(url):
    u=urlparse(url)
    if u.hostname=='b23.tv':
        response=opener.open(Request(public_url(url),headers={'User-Agent':USER_AGENT}),timeout=30)
        with response:url=response.url
        u=urlparse(url)
    if u.hostname not in ('www.bilibili.com','bilibili.com','m.bilibili.com','www.xiaoyuzhoufm.com','xiaoyuzhoufm.com'):raise MediaError('分享链接跳到了不支持的网站')
    return url

def subtitle_text(raw,ext=''):
    try:
        obj=json.loads(raw)
        if isinstance(obj,dict) and isinstance(obj.get('body'),list):return '\n'.join(str(x.get('content','')) for x in obj['body']).strip()
        if isinstance(obj,dict) and isinstance(obj.get('events'),list):return '\n'.join(''.join(str(s.get('utf8','')) for s in e.get('segs',[])) for e in obj['events']).strip()
    except (ValueError,TypeError):pass
    lines=[]
    source_lines=raw.splitlines()
    for index,line in enumerate(source_lines):
        if not line.strip() or (line.strip().isdigit() and index+1<len(source_lines) and '-->' in source_lines[index+1]) or '-->' in line or re.match(r'^(WEBVTT|NOTE|Kind:|Language:)',line):continue
        text=html.unescape(re.sub(r'<[^>]*>','',line)).strip()
        if text:lines.append(text)
    return '\n'.join(lines).strip()

def xiaoyuzhou_info(page):
    match=re.search(r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',page,re.S)
    data=json.loads(html.unescape(match.group(1))) if match else {}
    episode=data.get('props',{}).get('pageProps',{}).get('episode',{})
    media=episode.get('media') or {};source=media.get('source') or {}
    audio=source.get('url')
    if not audio:
        audio=next(iter(re.findall(r'https://(?:media\.)?[^\s<>"\']+\.(?:mp3|m4a|aac)(?:\?[^\s<>"\']*)?',page)),None)
    if not audio:raise MediaError('这期节目没有公开可读取的音频，暂时无法转文字')
    return {'title':episode.get('title','小宇宙文字稿'),'audio':html.unescape(audio).replace('\\u0026','&'),'duration':episode.get('duration',0)}

def download(url,path):
    with opener.open(Request(public_url(url),headers={'User-Agent':USER_AGENT,'Referer':'https://www.bilibili.com/'}),timeout=90) as r,path.open('wb') as f:
        maximum=512*1024*1024
        if int(r.headers.get('Content-Length',0))>maximum:raise MediaError('音频超过512MB，暂时无法处理')
        size=0
        while True:
            block=r.read(1024*1024)
            if not block:break
            size+=len(block)
            if size>maximum:raise MediaError('音频超过512MB，暂时无法处理')
            f.write(block)

def extract(url,platform,folder,tick):
    url=resolve_link(url)
    if platform=='xiaoyuzhou':
        info=xiaoyuzhou_info(read_public(url).decode('utf-8'))
        tick({'title':info['title'],'stage':'正在读取音频'})
        audio=folder/'audio.m4a';download(info['audio'],audio)
        return info['title'],None,audio
    import yt_dlp
    class Quiet:
        def debug(self,*a,**k):pass
        def info(self,*a,**k):pass
        def warning(self,*a,**k):pass
        def error(self,*a,**k):pass
    opts={'quiet':True,'no_warnings':True,'logger':Quiet(),'noplaylist':True,'socket_timeout':30,'retries':2,'skip_download':True,'http_headers':{'User-Agent':USER_AGENT,'Referer':'https://www.bilibili.com/'},'outtmpl':str(folder/'audio.%(ext)s'),'format':'bestaudio/best','max_filesize':512*1024*1024}
    with yt_dlp.YoutubeDL(opts) as dl:
        info=dl.extract_info(url,download=False)
        if info.get('entries'):
            entries=[e for e in info['entries'] if e]
            if not entries:raise MediaError('未找到可读取的视频分集')
            info=entries[0]
        title=info.get('title','B站文字稿');tick({'title':title,'stage':'正在读取字幕'})
        tracks={**(info.get('automatic_captions') or {}),**(info.get('subtitles') or {})}
        languages=sorted(tracks,key=lambda x:(not ('zh' in x.lower() or 'cn' in x.lower()),x))
        for language in languages:
            for track in tracks[language]:
                try:
                    text=subtitle_text(read_public(track['url']).decode('utf-8'),track.get('ext',''))
                    if text:return title,text,None
                except (HTTPError,URLError,MediaError,UnicodeError):continue
        tick({'stage':'没有可用字幕，正在读取音频'})
        # Let the mature extractor select public audio and handle Bilibili fragments.
        opts['skip_download']=False
        with yt_dlp.YoutubeDL(opts) as audio_dl:
            audio_info=audio_dl.extract_info(url,download=True)
        files=[p for p in folder.glob('audio.*') if not p.name.endswith(('.part','.ytdl'))]
        if not files:raise MediaError('未能读取视频音频，来源可能需要登录或限制了后台访问')
        return title,None,max(files,key=lambda p:p.stat().st_size)

def hinted_extract(hint,folder,tick):
    def checked(url):
        host=urlparse(url).hostname or ''
        if not any(host==h or host.endswith('.'+h) for h in ['bilivideo.com','bilivideo.cn','hdslb.com']):raise MediaError('公开媒体地址校验未通过')
        return public_url(url)
    title=hint.get('title') or 'B站文字稿';tick({'title':title,'stage':'正在读取公开媒体'})
    if hint.get('caption_url'):
        try:
            text=subtitle_text(read_public(checked(hint['caption_url'])).decode('utf-8'))
            if text:return title,text,None
        except (HTTPError,URLError,MediaError):pass
    if not hint.get('audio_url'):raise MediaError('字幕地址已失效，可点重试重新解析链接')
    audio=folder/'audio.m4a';download(checked(hint['audio_url']),audio);return title,None,audio

def run_tool(args):
    r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=240)
    if r.returncode:raise MediaError('音频格式无法解码，未生成文字稿')
    return r.stdout.decode('utf-8','replace').strip()

def asr(path,key,transport=None):
    if not key:raise MediaError('视频没有公开字幕，需要先在灵的设定填写DeepSeek密钥。')
    boundary='ximi'+uuid.uuid4().hex
    audio=path.read_bytes()
    if len(audio)>8*1024*1024:raise MediaError('音频分段超过识别接口上限')
    payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()+audio+f'\r\n--{boundary}--\r\n'.encode())
    req=Request('https://api.deepseek.com/v1/tools/asr',data=payload,headers={'Authorization':'Bearer '+key,'Content-Type':'multipart/form-data; boundary='+boundary})
    for attempt in range(3):
        try:
            with (transport or urlopen)(req,timeout=150) as r:response=json.load(r)
            if not isinstance(response.get('text'),str):raise MediaError('识别接口没有返回文字，可稍后重试')
            return response['text'].strip()
        except HTTPError as e:
            if e.code in (429,503,504) and attempt<2:time.sleep(2**attempt);continue
            raise MediaError({401:'DeepSeek密钥无效，请在灵的设定检查。',402:'DeepSeek余额不足，请充值后重试。',413:'音频分段超过识别接口上限。',429:'DeepSeek请求较多，请稍后重试。'}.get(e.code,f'DeepSeek识别未完成（HTTP {e.code}），可稍后重试。'))
        except (TimeoutError,URLError):
            if attempt<2:time.sleep(2**attempt);continue
            raise MediaError('DeepSeek连接中断，已完成的段落保留，可重试继续。')

def process(job,checkpoint,extractor=extract,recognizer=asr):
    def tick(data):checkpoint(job['id'],job['lease_token'],data)
    with tempfile.TemporaryDirectory(prefix='ximi-transcribe-') as work:
        folder=Path(work)
        if job.get('source_hint') and job['platform']=='bilibili':
            try:title,caption,audio=hinted_extract(job['source_hint'],folder,tick)
            except (HTTPError,URLError,MediaError):title,caption,audio=extractor(job['url'],job['platform'],folder,tick)
        else:title,caption,audio=extractor(job['url'],job['platform'],folder,tick)
        if caption:
            tick({'action':'done','method':'captions','text':caption});return
        duration=float(run_tool(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(audio)]))
        if not math.isfinite(duration) or duration<=0:raise MediaError('没有读到有效音频')
        if duration>6*3600:raise MediaError('当前支持六小时以内的单集，请选择具体分集')
        if job.get('duration_seconds') and abs(float(job['duration_seconds'])-duration)>1:raise MediaError('来源音频已发生变化，请删除旧任务后重新添加。')
        total=math.ceil(duration/SEGMENT)
        tick({'title':title,'stage':'正在识别语音','method':'deepseek','total_parts':total,'duration_seconds':duration})
        done=set(job.get('completed_parts',[]))
        for part in range(total):
            if part in done:continue
            wav=folder/'speech.wav'
            run_tool(['ffmpeg','-v','error','-y','-ss',str(part*SEGMENT),'-i',str(audio),'-t',str(SEGMENT),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',str(wav)])
            tick({'stage':f'正在识别第 {part+1}/{total} 段'})
            text=recognizer(wav,job.get('api_key'))
            tick({'part':part,'text':text,'stage':f'已完成 {part+1}/{total} 段'})
            wav.unlink(missing_ok=True)
        tick({'action':'done','method':'deepseek'})

_oidc_cache=None
def github_token():
    global _oidc_cache
    if _oidc_cache and time.monotonic()-_oidc_cache[0]<150:return _oidc_cache[1]
    url=os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'];url+=('&' if '?' in url else '?')+'audience=ximi-transcription'
    request=Request(url,headers={'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urlopen(request,timeout=30) as response:token=json.load(response)['value']
    _oidc_cache=(time.monotonic(),token);return token

class Backend:
    def __init__(self,endpoint,token):self.endpoint=endpoint;self.token=token
    def call(self,action,**data):
        request=Request(self.endpoint,data=json.dumps({'worker_token':self.token() if callable(self.token) else self.token,'action':action,**data},ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
        for attempt in range(3):
            try:
                with urlopen(request,timeout=45) as response:return json.load(response)
            except HTTPError as e:
                if e.code in (404,409):raise StaleJob()
                if e.code<500:
                    try:message=json.load(e).get('error','')
                    except Exception:message=''
                    raise MediaError(message if '没有识别到' in message else '后台任务校验未通过，请稍后重试')
            except (TimeoutError,URLError):pass
            if attempt<2:time.sleep(2**attempt)
        raise MediaError('后台连接中断，任务稍后会继续处理')
    def checkpoint(self,id,lease,data):return self.call('checkpoint',id=id,lease_token=lease,data=data)

def main():
    endpoint=os.environ['XIMI_TRANSCRIBE_ENDPOINT']
    backend=Backend(endpoint,github_token)
    for _ in range(3):
        job=backend.call('claim').get('job')
        if not job:break
        try:process(job,backend.checkpoint)
        except StaleJob:continue
        except Exception as e:
            message=str(e) if isinstance(e,MediaError) else '暂时无法读取来源。来源可能需要登录、限制了后台访问，或连接中断，可稍后重试。'
            try:backend.checkpoint(job['id'],job['lease_token'],{'action':'failed','error':message})
            except StaleJob:pass
    probe=os.environ.get('XIMI_TRANSCRIBE_PROBE_URL')
    if probe:
        platform='xiaoyuzhou' if urlparse(probe).hostname in ('www.xiaoyuzhoufm.com','xiaoyuzhoufm.com') else 'bilibili'
        with tempfile.TemporaryDirectory(prefix='ximi-probe-') as work:
            try:
                _,text,audio=extract(probe,platform,Path(work),lambda data:None)
                print(json.dumps({'public_source_verified':True,'captions_available':bool(text),'audio_readable':bool(audio)},ensure_ascii=False))
            except Exception as error:
                codes=re.findall(r'HTTP Error (\d{3})',str(error))
                print(json.dumps({'public_source_error':type(error).__name__,'http_codes':codes}))
                print('Public source unavailable from this runner; no transcription was fabricated.')
                raise SystemExit(1)
if __name__=='__main__':main()
