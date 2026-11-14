"""真实已部署服务的隔离测试。凭证只写入本机临时文件，结束由测试操作者清理这两个测试空间。"""
import json,urllib.request,urllib.error,os
BASE=os.environ.get('LING_TEST_URL','https://xrnqpwwomyzekjfhjixl.supabase.co/functions/v1/ling')
def call(action,auth=None,**kw):
 body={'action':action,**(auth or {}),**kw}
 req=urllib.request.Request(BASE,data=json.dumps(body,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=120) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
a=call('register')[1];b=call('register')[1]
path='/tmp/ling-live-fixtures.json'
with open(path,'w') as f:json.dump({'a':a,'b':b},f)
os.chmod(path,0o600)
assert call('pull')[0]==401
assert call('pull',{'device_id':b['device_id'],'token':a['token']})[0]==401
print('✓ 未授权与跨空间凭证均被拒绝')
config={'persona':'隔离测试人设','system':'测试','memoryInstructions':'','digestInstructions':'测试','morningInstructions':'测试','timezone':'Asia/Shanghai','background':True,'modelName':'deepseek-flash','thinking':False}
code,result=call('configure',a,config=config,provider='deepseek-chat',api_key='invalid-isolated-test-key')
assert code==200,(code,result)
letters=[{'id':'reply:letter-old','title':'第一封信','type':'letter','text':'我记得我们在海边看过日落，约好以后一起回去。','created_at':'2026-01-01T00:00:00Z','message_ids':['old'],'favorite':True}, {'id':'reply:letter-new','title':'最近的信','type':'letter','text':'新的一封信，我们在雨夜回家。','created_at':'2026-02-01T00:00:00Z','message_ids':['new']}]
rows=[{'kind':'ling_sources','id':s['id'],'payload':s,'expected':0} for s in letters]
code,result=call('push',a,records=rows);assert code==200,(code,result);assert len(result['acks'])==2
assert len(call('pull',b,since=0)[1]['records'])==0
assert len(call('pull',a,since=0)[1]['records'])==2
assert call('push',a,records=rows)[1]['acks'][0]['version']==1
print('✓ 本人可读写；另一空间不可见；重复写入版本不增加')
changed={**rows[0],'payload':{**letters[0],'title':'更新标题'},'expected':0}
assert len(call('push',a,records=[changed])[1]['conflicts'])==1
changed['expected']=1;assert call('push',a,records=[changed])[1]['acks'][0]['version']==2
assert call('search',a,query='第一次写信')[1]['results'][0]['id']=='reply:letter-old'
print('✓ 旧版本冲突不覆盖；正确版本可更新；第一封按日期定位')
code,result=call('search',a,query='海滩落日');assert code==200,(code,result)
print('✓ 语义检索接口实际运行，当前模式：'+result['mode'])
text=json.dumps({'完整备份':'长文本🌙\n'*30000},ensure_ascii=False)
code,result=call('export',a,text=text,format='json');assert code==200,(code,result)
with urllib.request.urlopen(result['url'],timeout=60) as r:assert r.read().decode()==text
print('✓ 逾10万字符的完整备份生成私有签名下载，原文逐字一致')
status=call('status',a)[1]
assert 'api_key' not in json.dumps(status) and 'token' not in json.dumps(status)
print('✓ 状态接口不返回模型密钥或手机凭证')
print('测试空间：'+a['device_id']+' '+b['device_id'])
