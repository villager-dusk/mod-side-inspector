import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {curseFingerprint} from './fingerprint.js';
import {projectCategory,applyProject} from './classification.js';
import {parseDescription,applyCurseReference,verifyCurseForge} from './curseforge.js';
import {createHandler} from './server-handler.js';
import {verifyOnline} from './online.js';
let passed=0;
for(const [c,s,expect]of [['required','unsupported','client'],['optional','unsupported','client'],['unsupported','required','server'],['unsupported','optional','server'],['required','required','both'],['optional','optional','both'],['required','optional','both'],['optional','required','both'],['unknown','required','unknown']]){assert.equal(projectCategory(c,s),expect);passed++;}
assert.equal(curseFingerprint(new TextEncoder().encode('hello')),2788266382);passed++;
assert.equal(curseFingerprint(new TextEncoder().encode('he l\tlo\n\r')),curseFingerprint(new TextEncoder().encode('hello')));passed++;
assert.ok(curseFingerprint(new Uint8Array([255,255,255]))>=0);passed++;
assert.equal(parseDescription('This mod is client-side only.'),'client');passed++;
assert.equal(parseDescription('This mod is server-only.'),'server');passed++;
assert.equal(parseDescription('The mod needs to be on both server and client to work.'),'both');passed++;
assert.equal(parseDescription('This mod is not client-only. It has client and server code.'),'unknown');passed++;
assert.equal(parseDescription('Optional client-only versions exist, but the main version is unknown.'),'unknown');passed++;
const template=()=>({category:'unknown',confidence:'待确认',ids:['test'],version:'1',notes:[],evidence:[],sha1:'abc',cfFingerprint:123});
const explicit={...template(),explicitSide:'client',category:'client'};
applyProject(explicit,{id:'x',slug:'x',title:'X',client:'required',server:'required',date:'2026-10-26'});assert.equal(explicit.category,'client');passed++;
const cf={...template(),ids:['damagetilt'],version:'1.19'};applyCurseReference(cf);assert.equal(cf.category,'both');assert.equal(cf.confidence,'项目参考');passed++;
const key='test-only-key-123456';let calls=[];
const mockFetch=async(url,init)=>{calls.push({url,init});if(url.endsWith('/fingerprints/432'))return Response.json({data:{exactMatches:[{id:549225,file:{id:42,fileFingerprint:123,hashes:[{algo:1,value:'abc'}]}}]}});if(url.endsWith('/mods'))return Response.json({data:[{id:549225,slug:'framework',name:'Framework'}]});return Response.json({data:'This mod is client-side only.'});};
const handler=createHandler('<h1>test</h1>',mockFetch);
const request=(data,origin='https://example.com')=>new Request('https://example.com/api/curseforge',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});
assert.equal((await handler.fetch(request({fingerprints:[123]}))).status,400);passed++;
assert.equal((await handler.fetch(request({key,fingerprints:[123]},'https://other.com'))).status,403);passed++;
assert.equal((await handler.fetch(request({key,fingerprints:[-1]}))).status,400);passed++;
const response=await handler.fetch(request({key,fingerprints:[123]})),body=await response.text();assert.equal(response.status,200);assert.ok(!body.includes(key));assert.equal(calls.length,3);assert.ok(calls.every(c=>c.url.startsWith('https://api.curseforge.com/v1/')));passed++;
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>Response.json(JSON.parse(body));const r=template();const report=await verifyCurseForge([r],key);assert.equal(report.matched,1);assert.equal(r.category,'both');assert.equal(r.confidence,'文件匹配');passed++;
 const collision={...template(),sha1:'different'};const rejected=await verifyCurseForge([collision],key);assert.equal(rejected.matched,0);assert.equal(collision.category,'unknown');passed++;
 const secretSafe=createHandler('',async()=>new Response('upstream token '+key,{status:401}));const denied=await secretSafe.fetch(request({key,fingerprints:[1]}));assert.equal(denied.status,401);assert.ok(!(await denied.text()).includes(key));passed++;
 // A successful first chunk is retained even if a later network request fails.
 const many=Array.from({length:101},(_,i)=>({...template(),sha1:'hash'+i}));let n=0;
 globalThis.fetch=async url=>{n++;if(n===1)return Response.json({hash0:{project_id:'p'}});if(n===2)return Response.json([{id:'p',slug:'p',title:'P',client_side:'required',server_side:'unsupported'}]);throw Error('offline');};
 await assert.rejects(()=>verifyOnline(many),/offline/);assert.equal(many[0].category,'client');assert.equal(many[100].category,'unknown');passed++;
}finally{globalThis.fetch=originalFetch;}
if(existsSync('test-results/pack-v2.json')){
const pack=JSON.parse(readFileSync('test-results/pack-v2.json'));
assert.equal(pack.length,141);assert.equal(pack.filter(r=>r.error).length,0);
assert.equal(pack.find(r=>r.ids.includes('embeddium')).category,'client');
assert.equal(pack.find(r=>r.ids.includes('servercore')).category,'server');
assert.equal(pack.find(r=>r.ids.includes('ftblibrary')).category,'both');
assert.equal(pack.find(r=>r.ids.includes('damagetilt')).category,'both');
assert.equal(pack.find(r=>r.ids.includes('buxin')).confidence,'代码推断');passed++;
}
console.log(JSON.stringify({passed,checks:'SHA-1 类别映射、CurseForge 指纹向量、项目参考、注解优先、说明保守解析、API 同源与参数校验、密钥不回显、SHA-1 防碰撞校验、网络部分失败保留、141 个真实文件代表性分类'}));
