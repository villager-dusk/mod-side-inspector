// CurseForge fingerprint: MurmurHash2, seed 1, excluding ASCII whitespace 9/10/13/32.
export function curseFingerprint(input){
 const bytes=new Uint8Array(input.length);let size=0;
 for(const b of input)if(b!==9&&b!==10&&b!==13&&b!==32)bytes[size++]=b;
 let h=(1^size)>>>0,p=0;const m=0x5bd1e995;
 while(p+4<=size){let k=(bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16|bytes[p+3]<<24)>>>0;p+=4;k=Math.imul(k,m);k^=k>>>24;k=Math.imul(k,m);h=(Math.imul(h,m)^k)>>>0;}
 const left=size-p;if(left===3)h^=bytes[p+2]<<16;if(left>=2)h^=bytes[p+1]<<8;if(left>=1){h^=bytes[p];h=Math.imul(h,m);}
 h^=h>>>13;h=Math.imul(h,m);h^=h>>>15;return h>>>0;
}
