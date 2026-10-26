import {zipSync,strToU8} from 'fflate';
import {verifyOnline} from './online.js';
import {verifyCurseForge} from './curseforge.js';
const $=id=>document.getElementById(id);
const labels={client:'客户端',server:'服务端',both:'双端',unknown:'待确认',error:'读取失败'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=value=>value<1024?value+' B':value<1048576?(value/1024).toFixed(1)+' KB':(value/1048576).toFixed(1)+' MB';
const fileIcon='<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M13 6h15l9 9v26H13z" stroke="currentColor" stroke-width="1.5"/><path d="M28 6v10h9M19 24h12m-12 6h12m-12 6h8" stroke="currentColor" stroke-width="1.5"/></svg>';
let rows=[],category='all',selected=-1,page=1,busy=false,scanId=0,worker=null,pending=null,isDemo=false,networkController=null;
function notify(text){$('notice').textContent=text;$('notice').hidden=!text;}
function setBusy(value){busy=value;for(const id of ['pickDirectory','pickFiles','demoButton','recursive'])$(id).disabled=value;$('clearButton').disabled=value||!rows.length;$('exportButton').disabled=value||!rows.length;$('verifyButton').disabled=value;$('cancelScan').hidden=!value;$('progress').hidden=!value;}
function render(){
  $('totalCount').textContent=rows.length;
  for(const key of Object.keys(labels)){const count=rows.filter(r=>r.category===key).length;if(key==='error')$('errorCount').textContent=count;else $('count-'+key).textContent=count;}
  document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category===category);b.setAttribute('aria-pressed',String(b.dataset.category===category));});
  const query=$('search').value.trim().toLocaleLowerCase(),loader=$('loaderFilter').value;
  const visible=rows.map((r,i)=>({...r,index:i})).filter(r=>($('includeInferred').checked||r.confidence!=='代码推断')&&(category==='all'||r.category===category)&&(loader==='all'||r.loader.split(' / ').some(x=>x===loader||(loader==='Forge'&&x==='Forge（旧版）')))&&(!query||[r.name,r.file,r.path,...r.ids].join(' ').toLocaleLowerCase().includes(query)));
  const pages=Math.max(1,Math.ceil(visible.length/50));page=Math.min(page,pages);
  if(!visible.length){$('results').innerHTML='<div class="empty">'+fileIcon+'<h3>'+(rows.length?'没有符合条件的模组':'等待你的第一批模组')+'</h3><p>'+(rows.length?'换一个关键词或筛选条件，再找找看。':'选择目录后，这里会列出每个 JAR 的运行端。点击结果，还能看到具体判断依据。')+'</p></div>';}
  else $('results').innerHTML='<div class="table-head"><span>模组 / 文件名</span><span>加载器</span><span>运行端 / 判断来源</span></div>'+visible.slice((page-1)*50,page*50).map(r=>'<button class="result-row '+(r.index===selected?'selected':'')+'" data-row="'+r.index+'" aria-label="查看 '+esc(r.name)+' 的判断详情" aria-pressed="'+(r.index===selected)+'"><span><span class="mod-name" style="display:block">'+esc(r.name)+'</span><span class="mod-file" style="display:block">'+esc(r.path)+' · '+size(r.size)+'</span></span><span class="loader-name">'+esc(r.loader)+'</span><span><span class="badge '+r.category+'">'+labels[r.category]+(r.confidence==='代码推断'?' · 推断':'')+'</span><small class="row-source">'+esc(r.confidence||'读取异常')+'</small></span></button>').join('');
  $('pagination').hidden=pages<=1;
  if(pages>1)$('pagination').innerHTML='<span>共 '+visible.length+' 项 · '+page+' / '+pages+' 页</span><div><button class="text-button" id="prevPage" '+(page===1?'disabled':'')+'>上一页</button><button class="text-button" id="nextPage" '+(page===pages?'disabled':'')+'>下一页</button></div>';
  $('clearButton').disabled=busy||!rows.length;$('exportButton').disabled=busy||!rows.length;
  $('verifyButton').disabled=busy;
  if(rows.length)$('sourceSummary').textContent=['文件匹配','明确声明','项目参考','代码推断','待确认'].map(source=>source+' '+rows.filter(r=>r.confidence===source).length).join(' · ');
  else $('sourceSummary').textContent='扫描时使用内置公开资料；需要最新结果时，可再联网核验。';
  renderDetail();
}
function renderDetail(){
  const r=rows[selected];
  if(!r){$('detailPanel').innerHTML='<div class="detail-heading">判断详情 <small>INSPECTOR</small></div><div class="detail-empty"><div class="detail-symbol">⌕</div><h3>让每一个判断有据可查</h3><p>点击左侧的模组，查看运行端声明、模组信息，以及需要注意的地方。</p><ul class="detail-checks"><li>直接读取 JAR 内的描述文件</li><li>明确区分声明与检测边界</li><li>不确定时保留，供你确认</li></ul></div>';return;}
  $('detailPanel').innerHTML='<div class="detail-heading">判断详情 <small>'+esc(r.confidence||r.loader)+'</small></div><div class="detail-body"><div><span class="badge '+r.category+'">'+labels[r.category]+(r.confidence==='代码推断'?' · 推断':'')+'</span><h3>'+esc(r.name)+'</h3><p class="path">'+esc(r.path)+'</p><dl class="properties"><dt>模组 ID</dt><dd>'+esc(r.ids.join(', ')||'未提供')+'</dd><dt>版本</dt><dd>'+esc(r.version||'未提供')+'</dd><dt>加载器</dt><dd>'+esc(r.loader)+'</dd><dt>文件大小</dt><dd>'+size(r.size)+'</dd><dt>判断方式</dt><dd>'+esc(r.method||'读取异常')+'</dd></dl>'+(r.sideSummary?'<p class="install-summary">'+esc(r.sideSummary)+'</p>':'')+(r.project?'<a class="project-link" href="'+esc(r.project.url)+'" target="_blank" rel="noreferrer">查看 Modrinth 项目 ↗</a>':'')+(r.curseforge?'<a class="project-link" href="'+esc(r.curseforge.url)+'" target="_blank" rel="noreferrer">查看 CurseForge 项目 ↗</a>':'')+'</div><h4>判断依据</h4><div>'+r.evidence.map(s=>'<p class="evidence">'+esc(s)+'</p>').join('')+'</div>'+(r.notes.length?'<h4>使用提示</h4><ul>'+r.notes.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'')+r.metadata.map(m=>'<details><summary>查看 '+esc(m.path)+'</summary><pre>'+esc(m.text)+'</pre>'+(m.truncated?'<p>内容较长，仅预览前 60,000 个字符。</p>':'')+'</details>').join('')+'<details><summary>文件指纹</summary><pre>SHA-1: '+esc(r.sha1||'未计算')+'\nCurseForge: '+esc(r.cfFingerprint??'未计算')+'</pre></details></div>';
}
function createWorker(){const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));const w=new Worker(url);URL.revokeObjectURL(url);return w;}
function inspect(file,path){
  return new Promise(resolve=>{
    const finish=value=>{clearTimeout(timer);pending=null;resolve(value);};
    const failure=message=>({file:file.name,path,size:file.size,name:file.name,version:'',loader:'未识别',category:'error',error:true,evidence:[message],notes:[],metadata:[],ids:[]});
    const timer=setTimeout(()=>{worker.terminate();worker=createWorker();finish(failure('分析超过 20 秒，已跳过此文件；请检查文件是否有效。'));},20000);
    pending=()=>finish(null);
    worker.onmessage=e=>finish(e.data);
    worker.onerror=e=>{e.preventDefault();worker.terminate();worker=createWorker();finish(failure('浏览器无法读取此文件，请检查 JAR 是否有效。'));};
    worker.postMessage({file,path});
  });
}
async function scan(files,demo=false){
  if(busy)return;
  const recursive=$('recursive').checked;
  const jars=files.filter(f=>/\.jar$/i.test(f.file.name)&&(recursive||!f.nested));
  if(!jars.length){notify('未找到 JAR 文件。请选择包含 .jar 的目录，或勾选“包含子目录”。');return;}
  const skipped=files.length-jars.length;
  rows=[];selected=-1;page=1;category='all';isDemo=demo;$('search').value='';$('loaderFilter').value='all';
  notify(demo?'示例模式：以下是工具生成的测试 JAR，用来演示分类流程，不代表你的本地文件。':'');
  const id=++scanId;setBusy(true);$('progress').max=jars.length;$('progress').value=0;render();
  const started=performance.now();let completed=0,lastRender=0;
  try{
    worker=createWorker();
    for(const f of jars){
      if(id!==scanId)break;
      $('scanStatus').textContent='正在分析 '+(completed+1)+' / '+jars.length+' · '+f.file.name;
      const result=await inspect(f.file,f.path);
      if(id!==scanId||!result)break;
      rows.push(result);completed++;$('progress').value=completed;if(selected<0)selected=0;
      if(performance.now()-lastRender>100){render();lastRender=performance.now();}
    }
    if(id===scanId)$('scanStatus').textContent=(demo?'示例分析完成':'扫描完成')+' · '+rows.length+' 个 JAR · '+((performance.now()-started)/1000).toFixed(1)+' 秒'+(skipped?' · 已忽略 '+skipped+' 个非 JAR 或未选子目录文件':'');
  }catch(e){notify('扫描无法继续：'+String(e.message||e));$('scanStatus').textContent='扫描中断 · 已保留 '+rows.length+' 条结果';}
  finally{if(worker){worker.terminate();worker=null;}setBusy(false);render();}
}
function fromInput(input){const files=Array.from(input.files||[]).map(file=>({file,path:file.webkitRelativePath||file.name,nested:(file.webkitRelativePath||'').split('/').length>2}));input.value='';scan(files);}
$('pickDirectory').onclick=()=>$('directoryInput').click();$('pickFiles').onclick=()=>$('fileInput').click();
$('directoryInput').onchange=()=>fromInput($('directoryInput'));$('fileInput').onchange=()=>fromInput($('fileInput'));
$('cancelScan').onclick=()=>{scanId++;networkController?.abort();worker?.terminate();pending?.();$('scanStatus').textContent='已停止 · 保留 '+rows.length+' 条已完成的结果';};
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;page=1;render();});
$('search').oninput=()=>{page=1;render();};$('loaderFilter').onchange=()=>{page=1;render();};
$('includeInferred').onchange=()=>{page=1;render();};
$('results').onclick=e=>{const b=e.target.closest('[data-row]');if(b){selected=Number(b.dataset.row);render();}};
$('pagination').onclick=e=>{if(e.target.id==='prevPage')page--;if(e.target.id==='nextPage')page++;render();};
$('clearButton').onclick=()=>{rows=[];selected=-1;category='all';page=1;isDemo=false;$('search').value='';$('loaderFilter').value='all';notify('');$('scanStatus').textContent='尚未选择目录 · 所有分析仅在当前浏览器进行';render();};
for(const id of ['helpButton','rulesLink'])$(id).onclick=()=>$('rulesDialog').showModal();
$('closeRules').onclick=()=>$('rulesDialog').close();$('rulesDialog').onclick=e=>{if(e.target===$('rulesDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
$('verifyButton').onclick=()=>{
 $('startVerify').disabled=busy||!rows.length||isDemo;
 $('startVerify').textContent=isDemo?'请先选择真实模组目录':!rows.length?'请先选择模组目录':'开始联网核验';
 $('cfKey').disabled=location.protocol==='file:';
 $('cfAvailability').textContent=location.protocol==='file:'?'当前为离线单文件版：可联网核验 Modrinth；CurseForge 实时核验需要在线版或使用源码中的本地服务。内置 CurseForge 资料仍可离线使用。':'Key 经当前工具转发给 CurseForge 官方接口，不写入存储。没有有效 Key 时无法验证官方实时指纹匹配。';
 $('verifyDialog').showModal();
};
$('closeVerify').onclick=()=>{$('cfKey').value='';$('verifyDialog').close();};
$('verifyDialog').addEventListener('cancel',()=>{$('cfKey').value='';});
$('startVerify').onclick=async()=>{
 if(busy||!rows.length||isDemo)return;const key=$('cfKey').disabled?'':$('cfKey').value.trim();$('cfKey').value='';$('verifyDialog').close();
 networkController=new AbortController();setBusy(true);notify('');const messages=[],errors=[];
 try{
  $('scanStatus').textContent='正在联网核验 Modrinth…';$('progress').max=rows.length;$('progress').value=0;
  try{const r=await verifyOnline(rows,{signal:networkController.signal,onProgress:p=>{$('progress').value=p.processed;$('scanStatus').textContent='Modrinth：已核验 '+p.processed+' / '+p.total+'，匹配 '+p.matched;render();}});messages.push('Modrinth 匹配 '+r.matched+' 个文件');}
  catch(error){if(networkController.signal.aborted)throw error;errors.push('Modrinth：'+String(error.message||error));}
  if(key){
   $('scanStatus').textContent='正在联网核验 CurseForge…';$('progress').value=0;
   try{const r=await verifyCurseForge(rows,key,{signal:networkController.signal,onProgress:p=>{$('progress').value=p.processed;$('scanStatus').textContent='CurseForge：已核验 '+p.processed+' / '+p.total+'，匹配 '+p.matched;render();}});messages.push('CurseForge 匹配 '+r.matched+' 个文件');}
   catch(error){if(networkController.signal.aborted)throw error;errors.push('CurseForge：'+String(error.message||error));}
  }else messages.push('CurseForge 使用内置项目资料，未调用实时 API');
  if(errors.length)notify('部分核验未完成：'+errors.join('；')+'。已有本地分析和成功匹配的结果已保留。');
  $('scanStatus').textContent='联网核验结束 · '+messages.join(' · ');
 }catch(error){if(networkController.signal.aborted)$('scanStatus').textContent='已停止联网核验 · 保留已有结果';else notify('联网核验未完成：'+String(error.message||error));}
 finally{networkController=null;setBusy(false);render();}
};
$('exportButton').onclick=()=>{
  const fields=['文件名','相对路径','模组名称','模组ID','版本','加载器','运行端','判断来源','判断方式','两端安装要求','大小(字节)','判断依据','提示','Modrinth','CurseForge','SHA-1','CurseForge指纹','数据来源'];
  const csvCell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const content=[fields,...rows.map(r=>[r.file,r.path,r.name,r.ids.join(';'),r.version,r.loader,labels[r.category],r.confidence,r.method,r.sideSummary,r.size,r.evidence.join('；'),r.notes.join('；'),r.project?.url,r.curseforge?.url,r.sha1,r.cfFingerprint,isDemo?'生成的演示样例':'本地扫描'])].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=(isDemo?'示例-':'')+'模组运行端报告-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function walkEntry(entry,prefix='',depth=0,output=[],readId=scanId){
  if(readId!==scanId)throw new DOMException('已停止读取目录','AbortError');
  if(entry.isFile){if(/\.jar$/i.test(entry.name)){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));output.push({file,path:prefix+entry.name,nested:depth>1});}return output;}
  if(entry.isDirectory){const reader=entry.createReader();while(true){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch){if(child.isDirectory&&!$('recursive').checked)continue;await walkEntry(child,prefix+entry.name+'/',depth+1,output,readId);}}}return output;
}
const drop=$('dropZone');let dragDepth=0;
window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
window.addEventListener('drop',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
drop.addEventListener('dragenter',e=>{e.preventDefault();if(!busy){dragDepth++;drop.classList.add('dragover');}});
drop.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;drop.classList.remove('dragover');}});
drop.addEventListener('dragover',e=>e.preventDefault());
drop.addEventListener('drop',async e=>{
  e.preventDefault();dragDepth=0;drop.classList.remove('dragover');if(busy)return;
  const items=Array.from(e.dataTransfer.items||[]),fallback=Array.from(e.dataTransfer.files||[]);let files=[];
  try{
    const entries=items.map(item=>item.webkitGetAsEntry?.()).filter(Boolean);
    if(entries.length){setBusy(true);const readId=++scanId;$('scanStatus').textContent='正在读取目录…';for(const entry of entries)await walkEntry(entry,'',0,files,readId);if(readId!==scanId){setBusy(false);return;}setBusy(false);}
    else files=fallback.map(file=>({file,path:file.name,nested:false}));
    await scan(files);
  }catch(error){setBusy(false);if(error.name!=='AbortError')notify('目录读取失败：'+String(error.message||error)+'。请使用“选择模组目录”重试。');}
});
$('demoButton').onclick=()=>{
  const make=(name,entries)=>({file:new File([zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(typeof v==='string'?v:JSON.stringify(v))])))],name,{type:'application/java-archive'}),path:'示例模组/'+name,nested:false});
  scan([
    make('client-hud-demo.jar',{'fabric.mod.json':{schemaVersion:1,id:'demo_hud',name:'界面增强 · 示例',version:'1.0.0',environment:'client'}}),
    make('server-tools-demo.jar',{'fabric.mod.json':{schemaVersion:1,id:'demo_server',name:'服务端管理 · 示例',version:'1.0.0',environment:'server'}}),
    make('common-library-demo.jar',{'fabric.mod.json':{schemaVersion:1,id:'demo_library',name:'通用前置 · 示例',version:'1.0.0',environment:'*'}}),
    make('quilt-client-demo.jar',{'quilt.mod.json':{schema_version:1,quilt_loader:{id:'quilt_demo',version:'1.0.0',metadata:{name:'Quilt 客户端 · 示例'}},minecraft:{environment:'client'}}}),
    make('forge-unconfirmed-demo.jar',{'META-INF/mods.toml':'modLoader="javafml"\nloaderVersion="[47,)"\nlicense="MIT"\n[[mods]]\nmodId="forge_demo"\nversion="1.0.0"\ndisplayName="Forge 待确认 · 示例"\ndisplayTest="IGNORE_ALL_VERSION"'}),
    {file:new File(['This is not a ZIP'],'broken-demo.jar'),path:'示例模组/broken-demo.jar',nested:false}
  ],true);
};
render();
