const validSide=new Set(['required','optional','unsupported','unknown']);
export function projectCategory(client,server){
 if(!validSide.has(client)||!validSide.has(server)||client==='unknown'||server==='unknown')return 'unknown';
 if(client==='unsupported'&&server==='unsupported')return 'unknown';
 if(server==='unsupported')return 'client';
 if(client==='unsupported')return 'server';
 // Optional support is useful on both ends, even when one end requires it.
 return 'both';
}
const words={required:'需要安装',optional:'可选安装',unsupported:'不支持',unknown:'未标注'};
export function applyProject(result,project,match='hash'){
 const category=projectCategory(project.client,project.server);
 if(category==='unknown')return false;
 result.notes=result.notes.filter(x=>!x.startsWith('这是静态代码推断')&&!x.startsWith('此项仅匹配到相同源代码仓库'));
 const explicit=result.explicitSide;
 result.project={id:project.id,slug:project.slug,title:project.title,client:project.client,server:project.server,url:'https://modrinth.com/mod/'+encodeURIComponent(project.slug),match,date:project.date};
 result.sideSummary='客户端'+words[project.client]+' · 服务端'+words[project.server];
 result.evidence.push('Modrinth '+(match==='hash'?'文件 SHA-1 精确匹配':'同源项目资料参考')+' → '+project.title+'；'+result.sideSummary+'（资料日期 '+project.date+'）');
 if(explicit&&explicit!==category){result.notes.push('发布平台的项目级标签与此文件的专用端声明不同；优先保留文件自身的明确声明。');return true;}
 result.category=category;result.confidence=match==='hash'?'文件匹配':'项目参考';result.method=match==='hash'?'JAR 指纹匹配发布记录':'相同源代码仓库的项目资料';
 if(match==='reference')result.notes.push('此项仅匹配到相同源代码仓库的项目，未匹配到该 JAR 的发布文件，修改版和旧版本可能存在差异。');
 else result.notes.push('文件哈希确认所属发布项目；端信息来自项目级标签，个别版本仍可能与标签不同。');
 return true;
}
export function summarizeLocal(result){
 if(result.category==='error')return;
 if(result.confidence==='代码推断')result.notes.unshift('这是静态代码推断，可能包含可选兼容代码；未证明联机必须安装，也不能据此自动删除文件。');
 else if(result.category==='both')result.notes.unshift(result.sideSummary||'声明可在双端加载；不代表双端必须安装。');
 else if(result.category==='client')result.notes.unshift(result.sideSummary||'模组明确声明用于客户端。');
 else if(result.category==='server')result.notes.unshift(result.sideSummary||'模组明确声明用于专用服务端。');
}
