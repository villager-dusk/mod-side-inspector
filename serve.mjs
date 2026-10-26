import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createHandler} from './server-handler.js';
createServer(async(req,res)=>{
 try{
  const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})});
  const response=await createHandler(readFileSync('dist/index.html','utf8')).fetch(request);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Local preview error');}
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
