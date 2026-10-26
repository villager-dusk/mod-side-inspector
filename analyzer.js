import { inflateSync } from 'fflate';
import parseTOML from '@iarna/toml/parse-string.js';
import {readClass} from './class-file.js';
import {applyProject,summarizeLocal} from './classification.js';
import catalog from './catalog.json' with {type:'json'};
import {curseFingerprint} from './fingerprint.js';
import {applyCurseReference} from './curseforge.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const wanted = ['fabric.mod.json', 'quilt.mod.json', 'META-INF/mods.toml', 'META-INF/neoforge.mods.toml', 'mcmod.info'];
const crcTable = Array.from({length:256}, (_, n) => { for(let k=0;k<8;k++) n = n&1 ? 0xedb88320^(n>>>1) : n>>>1; return n>>>0; });
function crc32(data) { let c=0xffffffff; for(const b of data)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
const clean = value => typeof value === 'string' ? value.slice(0,2000) : typeof value === 'number' ? String(value) : '';
async function read(file, start, length) {
  if(start<0 || length<0 || start+length>file.size) throw Error('JAR 数据不完整或目录偏移无效');
  return new Uint8Array(await file.slice(start,start+length).arrayBuffer());
}
async function indexZip(file) {
  const tail = await read(file, Math.max(0,file.size-65557),Math.min(file.size,65557));
  const t = new DataView(tail.buffer); let end=-1;
  for(let i=tail.length-22;i>=0;i--) if(t.getUint32(i,true)===0x06054b50 && i+22+t.getUint16(i+20,true)===tail.length){end=i;break;}
  if(end<0)throw Error('不是有效的 ZIP / JAR 文件，或文件已损坏');
  const count=t.getUint16(end+10,true), size=t.getUint32(end+12,true), offset=t.getUint32(end+16,true);
  if(t.getUint16(end+4,true)||t.getUint16(end+6,true)||t.getUint16(end+8,true)!==count)throw Error('暂不支持分卷 JAR');
  if(count===65535||size===0xffffffff||offset===0xffffffff)throw Error('暂不支持 ZIP64 JAR');
  if(size>16*1024*1024)throw Error('JAR 目录超过 16 MB 安全读取上限');
  const bytes=await read(file,offset,size), v=new DataView(bytes.buffer), entries=new Map();
  let p=0;
  for(let i=0;i<count;i++){
    if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)throw Error('JAR 中央目录损坏');
    const nl=v.getUint16(p+28,true), el=v.getUint16(p+30,true), cl=v.getUint16(p+32,true);
    if(p+46+nl+el+cl>bytes.length)throw Error('JAR 文件条目不完整');
    // Metadata paths are ASCII; non-UTF8 legacy asset names do not affect classification.
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+nl));
    {
      if(entries.has(name)&&wanted.includes(name))throw Error('存在重复的模组描述文件：'+name);
      entries.set(name,{name,flags:v.getUint16(p+8,true),method:v.getUint16(p+10,true),crc:v.getUint32(p+16,true),compressed:v.getUint32(p+20,true),size:v.getUint32(p+24,true),offset:v.getUint32(p+42,true)});
    }
    p+=46+nl+el+cl;
  }
  return {entries,count};
}
async function extractBytes(file,e){
  if(e.size>2*1024*1024||e.compressed>2*1024*1024)throw Error(e.name+' 超过 2 MB 读取上限');
  if(e.flags&1)throw Error('无法分析加密的模组描述文件');
  const head=await read(file,e.offset,30),v=new DataView(head.buffer);
  if(v.getUint32(0,true)!==0x04034b50)throw Error('JAR 本地文件头损坏');
  const nl=v.getUint16(26,true),el=v.getUint16(28,true);
  const name=decoder.decode(await read(file,e.offset+30,nl));
  if(name!==e.name||v.getUint16(8,true)!==e.method)throw Error('JAR 文件头与目录不匹配');
  const packed=await read(file,e.offset+30+nl+el,e.compressed);
  let unpacked;
  if(e.method===0)unpacked=packed;
  else if(e.method===8)unpacked=inflateSync(packed,{out:new Uint8Array(e.size)});
  else throw Error('不支持的 JAR 压缩方式：'+e.method);
  if(unpacked.length!==e.size||crc32(unpacked)!==e.crc)throw Error(e.name+' 校验失败，文件可能已损坏');
  return unpacked;
}
async function extract(file,e){return decoder.decode(await extractBytes(file,e)).replace(/^\uFEFF/,'');}
function repository(url){
 try{const u=new URL(url);if(u.hostname.toLowerCase()!=='github.com')return '';return u.hostname+'/'+u.pathname.split('/').filter(Boolean).slice(0,2).join('/').replace(/\.git$/,'').toLowerCase();}catch{return '';}
}
async function inspectClasses(file,entries,result){
 const signals={client:0,server:0,content:0,network:0,scanned:0,skipped:0,bytes:0},mods=[];
 for(const [path,e]of entries){
  if(!path.endsWith('.class')||path.startsWith('META-INF/')||/^(org\/|kotlin\/|com\/google\/)/.test(path))continue;
  if(e.size>2*1024*1024||signals.bytes+e.size>48*1024*1024||signals.scanned>=4000){signals.skipped++;continue;}
  try{
   const bytes=await extractBytes(file,e),info=readClass(bytes),text=info.strings.join('\n');signals.scanned++;signals.bytes+=e.size;
   if(text.includes('net/minecraft/client/'))signals.client++;
   if(text.includes('net/minecraft/server/'))signals.server++;
   if(/net\/(?:minecraftforge|neoforged\/neoforge)\/registries\/DeferredRegister/.test(text)&&/net\/(?:minecraftforge|neoforged\/neoforge)\/registries\/ForgeRegistries/.test(text)&&info.strings.some(s=>['ITEMS','BLOCKS','ENTITY_TYPES','ENTITIES'].includes(s)))signals.content++;
   if(/net\/minecraftforge\/network\/simple\/SimpleChannel|registerMessage|messageBuilder/.test(text))signals.network++;
   for(const a of info.annotations){
    if(!['Lnet/minecraftforge/fml/common/Mod;','Lcpw/mods/fml/common/Mod;','Lnet/neoforged/fml/common/Mod;'].includes(a.type))continue;
    const v=a.values,id=v.value||v.modid;if(typeof id!=='string'||!result.ids.includes(id))continue;
    let side='unknown';
    if(v.clientSideOnly===1&&v.serverSideOnly!==1)side='client';
    if(v.serverSideOnly===1&&v.clientSideOnly!==1)side='server';
    if(a.type==='Lnet/neoforged/fml/common/Mod;'&&Array.isArray(v.dist)&&v.dist.length){const values=new Set(v.dist.map(x=>x.value));if(values.size===1&&values.has('CLIENT'))side='client';if(values.size===1&&values.has('DEDICATED_SERVER'))side='server';}
    mods.push({id,path,side});
   }
  }catch{signals.skipped++;}
 }
 result.signals=signals;
 const complete=signals.skipped===0;
 if(mods.length&&complete&&result.ids.every(id=>mods.some(m=>m.id===id))&&mods.every(m=>m.side===mods[0].side)&&mods[0].side!=='unknown'){
  result.category=mods[0].side;result.explicitSide=result.category;result.confidence='明确声明';result.method='入口类的 @Mod 运行端注解';
  result.evidence.push('读取 '+mods.map(m=>m.path).join('、')+' 的类级 @Mod 注解，所有入口均明确限制为'+(result.category==='client'?'客户端':'专用服务端'));return;
 }
 // References and registrations provide suggestions, never installation requirements.
 if(complete&&signals.content>=1&&mods.length){
  result.category='both';result.confidence='代码推断';result.method='内容注册代码分析';
  result.evidence.push('静态分析 '+signals.scanned+' 个类：'+signals.content+' 个类同时包含模组注册器和物品/方块/实体类型引用，推断含有双端游戏内容。');
 }else if(complete&&signals.client>0&&signals.client>=Math.max(1,signals.server)*3&&signals.content===0&&signals.network===0){
  result.category='client';result.confidence='代码推断';result.method='客户端功能代码分析';
  result.evidence.push('静态分析 '+signals.scanned+' 个类：客户端引用 '+signals.client+'，服务端引用 '+signals.server+'，未发现内容注册或 Forge 网络通道，推断以客户端功能为主。');
 }else if(complete&&signals.server>0&&signals.client===0&&signals.content===0&&![...entries.keys()].some(path=>result.ids.some(id=>path.startsWith('assets/'+id+'/')&&!path.startsWith('assets/'+id+'/lang/')))){
  result.category='server';result.confidence='代码推断';result.method='服务端功能代码分析';
  result.evidence.push('静态分析 '+signals.scanned+' 个类：发现 '+signals.server+' 个类引用服务端代码，未发现客户端类或内容注册，推断以服务端功能为主；不排除客户端可选安装。');
 }else result.evidence.push('静态分析 '+signals.scanned+' 个类，代码信号不足以可靠分端'+(signals.skipped?'；另有 '+signals.skipped+' 个类未能完整分析':'')+'。');
}
function json(text){return JSON.parse(text);}
function environment(value,server='server'){
  if(value===undefined||value==='*')return 'both';
  if(value==='client')return 'client';
  if(value===server)return 'server';
  throw Error('无法识别的 environment 值：'+String(value));
}
export async function analyzeFile(file,path=file.name){
  const result={file:file.name,path,size:file.size,category:'unknown',loader:'未识别',name:file.name,ids:[],version:'',evidence:[],notes:[],metadata:[],error:false,confidence:'待确认',method:'证据不足'};
  try{
    const {entries,count}=await indexZip(file); result.entryCount=count;
    const declarations=[];
    for(const key of wanted){
      if(!entries.has(key))continue;
      const text=await extract(file,entries.get(key));
      result.metadata.push({path:key,text:text.slice(0,60000),truncated:text.length>60000});
      if(key==='fabric.mod.json'){
        const m=json(text); if(!m||typeof m!=='object'||typeof m.id!=='string')throw Error('fabric.mod.json 缺少有效的模组 ID');
        const category=environment(m.environment);
        declarations.push({loader:'Fabric',category,name:clean(m.name)||m.id,ids:[m.id],version:clean(m.version)});
        result.evidence.push('fabric.mod.json → environment = '+(m.environment===undefined?'*（省略时的默认值）':JSON.stringify(m.environment)));
        const ep=m.entrypoints;
        if(ep&&typeof ep==='object')result.notes.push('入口类型：'+Object.keys(ep).join('、')+'；入口类型不单独决定运行端。');
        if(Array.isArray(m.jars)&&m.jars.length)result.notes.push('声明了 '+m.jars.length+' 个内嵌 JAR；本次只按外层模组声明分类，未展开内嵌依赖。');
      }else if(key==='quilt.mod.json'){
        const m=json(text),q=m?.quilt_loader; if(!q||typeof q.id!=='string')throw Error('quilt.mod.json 缺少有效的 quilt_loader.id');
        const env=m.minecraft?.environment, category=environment(env,'dedicated_server');
        declarations.push({loader:'Quilt',category,name:clean(q.metadata?.name)||q.id,ids:[q.id],version:clean(q.version)});
        result.evidence.push('quilt.mod.json → minecraft.environment = '+(env===undefined?'*（默认）':JSON.stringify(env)));
        if(q.jars?.length)result.notes.push('包含内嵌 JAR；本次未展开内嵌依赖。');
      }else if(key.endsWith('.toml')){
        const m=parseTOML(text),neo=key.includes('neoforge'),mods=m.mods;
        if(!Array.isArray(mods)||!mods.length||mods.some(x=>typeof x.modId!=='string'))throw Error(key+' 缺少有效的 [[mods]] 声明');
        const category=!neo&&m.clientSideOnly===true?'client':'unknown';
        declarations.push({loader:neo?'NeoForge':'Forge',category,name:mods.map(x=>clean(x.displayName)||x.modId).join(' / '),ids:mods.map(x=>x.modId),version:mods.map(x=>clean(x.version)).join(' / ')});
        result.evidence.push(key+(category==='client'?' → clientSideOnly = true':' → 没有可直接确定运行端的模组级声明'));
        for(const mod of mods){if(mod.displayTest)result.notes.push(mod.modId+' 的 displayTest = '+clean(mod.displayTest)+'，它用于联机兼容显示，不等于运行端。');}
        if(m.dependencies)result.notes.push('dependencies 中的 side 只约束对应依赖，不能用于判定整个模组的运行端。');
      }else if(key==='mcmod.info'){
        const m=json(text),mods=Array.isArray(m)?m:m.modList;
        if(!Array.isArray(mods)||!mods.length)throw Error('mcmod.info 格式无法识别');
        declarations.push({loader:'Forge（旧版）',category:'unknown',name:mods.map(x=>clean(x.name)||clean(x.modid)).join(' / '),ids:mods.map(x=>clean(x.modid)).filter(Boolean),version:mods.map(x=>clean(x.version)).join(' / ')});
        result.evidence.push('mcmod.info → 已识别旧版模组信息，未据此推定运行端');
      }
    }
    if(declarations.length){
      // mcmod.info is a legacy fallback and must not override modern metadata.
      const modern=declarations.filter(x=>x.loader!=='Forge（旧版）');const active=modern.length?modern:declarations;
      result.loader=active.map(x=>x.loader).join(' / ');result.name=active[0].name;result.ids=[...new Set(active.flatMap(x=>x.ids))];result.version=active[0].version;
      const cats=new Set(active.map(x=>x.category));
      if(cats.size===1)result.category=active[0].category;
      else result.notes.unshift('此 JAR 的多个加载器描述存在不同或不完整的端声明，整体标为待确认；请逐项查看判断依据。');
    }else result.evidence.push('未发现支持的模组描述文件；可能是普通库、插件或其他加载器的模组。');
    if(result.category!=='unknown'){result.confidence='明确声明';result.method='JAR 内的运行环境声明';if(result.category!=='both')result.explicitSide=result.category;}
    if(file.size<=512*1024*1024&&globalThis.crypto?.subtle){
      const bytes=new Uint8Array(await file.arrayBuffer());result.cfFingerprint=curseFingerprint(bytes);
      const digest=await globalThis.crypto.subtle.digest('SHA-1',bytes);result.sha1=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    }else result.notes.push('当前环境不支持文件哈希，或文件超过 512 MB；已跳过指纹匹配。');
    const fingerprint=catalog.fingerprints[result.sha1];
    let applied=fingerprint?applyProject(result,fingerprint,'hash'):false;
    if(!applied&&!result.explicitSide){
      applied=applyCurseReference(result);
    }
    if(!applied&&!result.explicitSide){
      const urls=result.metadata.flatMap(m=>m.text.match(/https?:[^\s"<>]+/g)||[]).map(repository).filter(Boolean);
      const references=result.ids.map(id=>catalog.references[id]).filter(Boolean);
      const reference=references.find(p=>urls.some(url=>url===repository(p.sourceUrl)||url===repository(p.issuesUrl)));
      if(reference)applied=applyProject(result,reference,'reference');
    }
    if(!applied&&result.category==='unknown'&&/Forge/.test(result.loader))await inspectClasses(file,entries,result);
    summarizeLocal(result);
  }catch(e){result.category='error';result.error=true;result.confidence='读取失败';result.method='文件读取或校验异常';result.evidence.push('读取失败：'+String(e.message||e).slice(0,500));}
  return result;
}
