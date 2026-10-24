import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
// Render our simple geometric mark without a runtime image dependency.
const crcTable = Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0})
function crc(b){let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function chunk(type,data){const t=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return out}
for(const size of [192,512]){
  const raw=Buffer.alloc((size*3+1)*size)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=x/size*512,py=y/size*512
    let color=[23,45,37]
    if(py>=116+Math.abs(px-220)*1.69&&py<=356&&px<365)color=[229,178,122]
    if(py>=171+Math.abs(px-319)*1.6&&py<=356)color=[229,178,122]
    if((px-365)**2+(py-126)**2<25**2)color=[244,243,235]
    const pos=y*(size*3+1)+1+x*3
    for(let c=0;c<3;c++)raw[pos+c]=color[c]
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2
  writeFileSync(new URL(`../public/icon-${size}.png`,import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]))
}
