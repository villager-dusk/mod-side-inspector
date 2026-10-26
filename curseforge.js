import catalog from './curseforge-catalog.json' with {type:'json'};
export function applyCurseProject(result,project,match='reference'){
 const url='https://www.curseforge.com/minecraft/mc-mods/'+encodeURIComponent(project.slug);
 result.curseforge={id:project.id,slug:project.slug,title:project.title,url,match,date:catalog.updated};
 result.evidence=result.evidence.filter(x=>!x.startsWith('CurseForge '));
 result.evidence.push('CurseForge '+(match==='hash'?'文件指纹及 SHA-1 匹配':'项目资料参考')+' → '+project.title+'；'+project.summary+'（'+catalog.updated+'）');
 if(!project.category||project.category==='unknown')return false;
 result.notes=result.notes.filter(x=>!x.startsWith('这是静态代码推断'));
 if(result.explicitSide&&result.explicitSide!==project.category){result.notes.push('CurseForge 项目标注与文件的专用端声明不同，优先保留文件声明。');return true;}
 result.category=project.category;result.confidence=match==='hash'?'文件匹配':'项目参考';result.method=match==='hash'?'CurseForge 文件指纹及 SHA-1':'CurseForge 公开项目资料';result.sideSummary=project.summary;
 if(match!=='hash')result.notes.push('CurseForge 项目资料按模组 ID 参考，未确认此 JAR 与该平台的发布文件相同；修改版与旧版可能不同。');
 return true;
}
export function applyCurseReference(result){
 const project=catalog.projects.find(p=>result.ids.includes(p.modId)&&(!p.excludeVersions||!p.excludeVersions.some(v=>result.version.includes(v))));
 return project?applyCurseProject(result,project,'reference'):false;
}
export function parseDescription(description){
 const text=String(description).replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp);/g,' ').replace(/\s+/g,' ');
 const both=/\b(?:mod\s+)?(?:needs?|requires?|must)\s+(?:to\s+be\s+)?(?:installed\s+|be\s+|on\s+)*(?:both\s+(?:the\s+)?)?(?:server\s+and\s+client|client\s+and\s+server|both\s+sides)\b/i.test(text);
 const client=/\b(?:this\s+(?:mod|project)|it)\s+is\s+(?:a\s+|strictly\s+|purely\s+)*(?:client[- ]side[- ]only|client[- ]only)\b/i.test(text);
 const server=/\b(?:this\s+(?:mod|project)|it)\s+is\s+(?:a\s+|strictly\s+|purely\s+)*(?:server[- ]side[- ]only|server[- ]only)\b/i.test(text);
 const conclusions=[both&&'both',client&&'client',server&&'server'].filter(Boolean);
 return conclusions.length===1?conclusions[0]:'unknown';
}
export async function verifyCurseForge(rows,key,{signal,onProgress=()=>{}}={}){
 const eligible=rows.filter(r=>!r.error&&r.sha1&&Number.isInteger(r.cfFingerprint));let matched=0,classified=0;
 for(let offset=0;offset<eligible.length;offset+=20){
  const batch=eligible.slice(offset,offset+20),response=await fetch('/api/curseforge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,fingerprints:[...new Set(batch.map(r=>r.cfFingerprint))]}),signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'CurseForge 核验失败');
  for(const result of batch){
   const record=data.matches.find(m=>m.file?.fileFingerprint===result.cfFingerprint&&m.file?.hashes?.some(h=>h.algo===1&&h.value.toLowerCase()===result.sha1));
   if(!record)continue;matched++;
   const cached=catalog.projects.find(p=>p.id===record.project.id),category=cached?.category!=='unknown'&&cached?cached.category:parseDescription(record.description);
   const project=cached||{id:record.project.id,slug:record.project.slug,title:record.project.name,category,summary:category==='unknown'?'已匹配发布文件，但项目说明未提供可明确解析的运行端。':'作者说明可识别为'+({client:'客户端专用',server:'服务端专用',both:'双端需要'}[category])+'。'};
   result.curseforge={id:project.id,slug:project.slug,title:project.title,url:'https://www.curseforge.com/minecraft/mc-mods/'+encodeURIComponent(project.slug),match:'hash'};
   if(result.confidence!=='文件匹配'||result.category==='unknown'){
    if(applyCurseProject(result,{...project,category},'hash'))classified++;
   }else result.evidence.push('CurseForge 文件指纹与 SHA-1 同时匹配项目 '+project.title+'；保留已有发布平台的运行端结论。');
  }
  onProgress({processed:Math.min(offset+20,eligible.length),total:eligible.length,matched,classified});
 }
 return {matched,classified};
}
