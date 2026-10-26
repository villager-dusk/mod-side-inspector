import {applyProject} from './classification.js';
async function getJSON(url,options,signal){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 if(signal?.aborted)controller.abort();
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 try{const response=await fetch(url,{...options,signal:controller.signal});if(!response.ok)throw Error(response.status===429?'Modrinth 请求过于频繁，请稍后重试':'Modrinth 返回 HTTP '+response.status);return await response.json();}
 finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
export async function verifyOnline(rows,{signal,onProgress=()=>{}}={}){
 const eligible=rows.filter(r=>!r.error&&r.sha1);let matched=0,updated=0;
 for(let offset=0;offset<eligible.length;offset+=100){
  if(signal?.aborted)throw new DOMException('已停止联网核验','AbortError');
  const batch=eligible.slice(offset,offset+100),hashes=[...new Set(batch.map(r=>r.sha1))];
  const versions=await getJSON('https://api.modrinth.com/v2/version_files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hashes,algorithm:'sha1'})},signal);
  const ids=[...new Set(Object.values(versions).map(v=>v.project_id))];
  const projects=ids.length?await getJSON('https://api.modrinth.com/v2/projects?ids='+encodeURIComponent(JSON.stringify(ids)),{},signal):[];
  const byId=new Map(projects.map(p=>[p.id,p]));
  for(const row of batch){
   const version=versions[row.sha1],p=version&&byId.get(version.project_id);if(!p)continue;matched++;
   const before=row.category;
   // Replace old external evidence so repeated verification does not duplicate notes.
   row.evidence=row.evidence.filter(x=>!x.startsWith('Modrinth '));
   row.notes=row.notes.filter(x=>!x.includes('项目级标签')&&!x.includes('相同源代码仓库'));
   if(applyProject(row,{id:p.id,slug:p.slug,title:p.title,client:p.client_side,server:p.server_side,date:new Date().toISOString().slice(0,10)},'hash')){row.onlineVerified=true;if(before!==row.category)updated++;}
  }
  onProgress({processed:Math.min(offset+100,eligible.length),total:eligible.length,matched,updated});
 }
 return {matched,updated,total:eligible.length};
}
