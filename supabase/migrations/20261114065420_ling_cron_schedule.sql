-- 调度凭证仅存在服务器Vault内；不写入代码或手机。
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'ling_worker_secret') where not exists(select 1 from vault.secrets where name='ling_worker_secret');
select cron.schedule('ling-background-v1','* * * * *',$job$
 select net.http_post(url:='https://xrnqpwwomyzekjfhjixl.supabase.co/functions/v1/ling',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='ling_worker_secret')),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=120000) where exists(select 1 from public.ling_devices where enabled);
$job$);
