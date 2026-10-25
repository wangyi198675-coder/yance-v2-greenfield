// Deterministic 32x32 nonproduction Windows .ico for tauri-build.
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const w=32,h=32;
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc(buf){let c=0xffffffff;for(const x of buf)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function chunk(type,data){const tag=Buffer.from(type),sz=Buffer.alloc(4),checksum=Buffer.alloc(4);sz.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([sz,tag,data,checksum])}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
const rows=[];for(let y=0;y<h;y++){const row=Buffer.alloc(1+w*4);for(let x=0;x<w;x++){const i=1+x*4,inner=x>7&&x<24&&y>7&&y<24;row[i]=inner?199:20;row[i+1]=inner?210:28;row[i+2]=inner?254:48;row[i+3]=255;}rows.push(row)}
const png=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),chunk("IHDR",ihdr),chunk("IDAT",zlib.deflateSync(Buffer.concat(rows))),chunk("IEND",Buffer.alloc(0))]);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=w;ico[7]=h;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
const dest=path.join(__dirname,"icons","icon.ico");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,Buffer.concat([ico,png]));console.log("ICO_BYTES="+(ico.length+png.length));