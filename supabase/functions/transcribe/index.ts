import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {verifyWorker} from './auth.ts';
import {transcriptionHandler} from './handler.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return new Response('{}',{status:405,headers});try{const data=await transcriptionHandler(db,await req.json(),verifyWorker),{status=200,...out}=data;return new Response(JSON.stringify(out),{status,headers});}catch(e){const detail=typeof (e as any)?.message==='string'?(e as any).message:'';const message=detail==='no speech'?'没有识别到可读语音，请确认音频内容。':'后台暂时无法处理，请稍后重试';return new Response(JSON.stringify({error:message}),{status:400,headers});}});
