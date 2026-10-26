async function boundedText(response,max){
 const reader=response.body?.getReader();if(!reader)return '';const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('上游响应过大');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createHandler(html,upstreamFetch=fetch){return {async fetch(request){
 const url=new URL(request.url);
 if(url.pathname!=='/api/curseforge'){
  if(url.pathname==='/favicon.ico')return new Response(null,{status:204});
  if(url.pathname!=='/'&&url.pathname!=='/index.html')return new Response('Not found',{status:404});
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 }
 if(request.method!=='POST')return json({error:'请使用 POST 请求'},405);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'不接受跨站请求'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'只支持 JSON 请求'},415);
 let input;try{input=JSON.parse(await boundedText(request,20000));}catch{return json({error:'请求格式无效或过大'},400);}
 const {key,fingerprints}=input||{};
 if(typeof key!=='string'||key.length<10||key.length>500||/[\r\n]/.test(key))return json({error:'请先在核验设置中填写有效的 CurseForge API Key'},400);
 if(!Array.isArray(fingerprints)||!fingerprints.length||fingerprints.length>20||fingerprints.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))return json({error:'指纹参数无效'},400);
 const headers={'Content-Type':'application/json','Accept':'application/json','x-api-key':key};
 async function api(path,body){
  const response=await upstreamFetch('https://api.curseforge.com/v1/'+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok){const error=Error(response.status===401||response.status===403?'CurseForge API Key 无效或无权访问':response.status===429?'CurseForge 请求限流，请稍后重试':'CurseForge 暂时无法响应');error.status=response.status;throw error;}
  return JSON.parse(await boundedText(response,6*1024*1024));
 }
 try{
  const matches=(await api('fingerprints/432',{fingerprints})).data?.exactMatches||[];
  const ids=[...new Set(matches.map(x=>x.id))];
  if(!ids.length)return json({matches:[]});
  const projects=(await api('mods',{modIds:ids,filterPcOnly:true})).data||[],byId=new Map(projects.map(p=>[p.id,p]));
  const output=[];
  // Sequential bounded requests avoid burst traffic and cross-request shared state.
  for(const m of matches){
   const p=byId.get(m.id);if(!p)continue;
   let description='';try{description=String((await api('mods/'+p.id+'/description')).data||'').slice(0,200000);}catch{}
   output.push({file:{id:m.file.id,fileFingerprint:m.file.fileFingerprint,hashes:m.file.hashes||[]},project:{id:p.id,slug:p.slug,name:p.name},description});
  }
  return json({matches:output});
 }catch(error){return json({error:error.message||'CurseForge 核验失败'},error.status===401||error.status===403?401:error.status===429?429:502);}
}};}
