// Read class-level JVM annotations and constant-pool UTF8 values. Never execute bytecode.
export function readClass(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=0;
 const need=n=>{if(p+n>bytes.length)throw Error('class 文件截断');};
 const u1=()=>{need(1);return view.getUint8(p++);};
 const u2=()=>{need(2);const n=view.getUint16(p);p+=2;return n;};
 const u4=()=>{need(4);const n=view.getUint32(p);p+=4;return n;};
 const skip=n=>{need(n);p+=n;};
 if(u4()!==0xcafebabe)throw Error('无效 class');skip(4);
 const count=u2(),pool=new Array(count);
 for(let i=1;i<count;i++){
  const tag=u1();
  if(tag===1){const length=u2();need(length);pool[i]=new TextDecoder().decode(bytes.subarray(p,p+length));skip(length);}
  else if(tag===3){pool[i]=u4();}
  else if([4,9,10,11,12,17,18].includes(tag))skip(4);
  else if(tag===5||tag===6){skip(8);i++;}
  else if([7,8,16,19,20].includes(tag))skip(2);
  else if(tag===15)skip(3);
  else throw Error('不支持的常量池类型 '+tag);
 }
 skip(6);skip(u2()*2);
 const skipAttributes=()=>{const n=u2();for(let i=0;i<n;i++){skip(2);skip(u4());}};
 for(let section=0;section<2;section++){const n=u2();for(let i=0;i<n;i++){skip(6);skipAttributes();}}
 function value(depth=0){
  if(depth>16)throw Error('注解嵌套过深');
  const tag=String.fromCharCode(u1());
  if('BCDFIJSZs'.includes(tag))return pool[u2()];
  if(tag==='e')return {enumType:pool[u2()],value:pool[u2()]};
  if(tag==='c')return pool[u2()];
  if(tag==='@')return annotation(depth+1);
  if(tag==='['){const n=u2(),a=[];for(let i=0;i<n;i++)a.push(value(depth+1));return a;}
  throw Error('无效注解值');
 }
 function annotation(depth=0){const type=pool[u2()],n=u2(),values={};for(let i=0;i<n;i++){const key=pool[u2()];values[key]=value(depth+1);}return {type,values};}
 const attributes=u2(),annotations=[];
 for(let i=0;i<attributes;i++){
  const name=pool[u2()],length=u4(),end=p+length;need(length);
  if(name==='RuntimeVisibleAnnotations'||name==='RuntimeInvisibleAnnotations'){const n=u2();for(let j=0;j<n;j++)annotations.push(annotation());}
  p=end;
 }
 return {strings:pool.filter(x=>typeof x==='string'),annotations};
}
