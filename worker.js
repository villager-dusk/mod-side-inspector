import {analyzeFile} from './analyzer.js';
self.onmessage=async e=>{try{self.postMessage(await analyzeFile(e.data.file,e.data.path));}catch(error){self.postMessage({file:e.data.file.name,path:e.data.path,size:e.data.file.size,name:e.data.file.name,loader:'未识别',category:'error',error:true,evidence:[String(error)],notes:[],metadata:[],ids:[]});}};
