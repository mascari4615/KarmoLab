import {inflateSync,gzipSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Terrarium의 RGB는 사진 색상이 아닌 미터 단위 고도 정수와 소수
function decode(bytes){
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('PNG signature');
  let width,height,channels,offset=8;const chunks=[];
  while(offset<bytes.length){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);offset+=length+12;
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===2?3:data[9]===6?4:0;if(data[8]!==8||!channels||data[12]!==0||width>512||height>512)throw new Error('Unsupported DEM encoding');}
    if(type==='IDAT')chunks.push(data);if(type==='IEND')break;
  }
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(width*height*channels);
  if(raw.length!==(stride+1)*height)throw new Error('DEM byte count');
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
    const filter=raw[y*(stride+1)],value=raw[y*(stride+1)+x+1],a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;
    const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c),predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?(pa<=pb&&pa<=pc?a:pb<=pc?b:c):NaN;
    if(!Number.isFinite(predict))throw new Error('PNG filter');pixels[y*stride+x]=(value+predict)&255;
  }
  const heights=new Int16Array(width*height);
  for(let i=0;i<heights.length;i++)heights[i]=Math.round(pixels[i*channels]*256+pixels[i*channels+1]+pixels[i*channels+2]/256-32768);
  return{width,height,heights};
}

const zoom=12,longitude=6.865,latitude=45.833,side=process.argv.includes('--probe')?1:8,n=2**zoom;
const centerX=Math.floor((longitude+180)/360*n),centerY=Math.floor((1-Math.asinh(Math.tan(latitude*Math.PI/180))/Math.PI)/2*n);
const firstX=centerX-Math.floor(side/2),firstY=centerY-Math.floor(side/2),width=side*256,height=side*256,result=new Int16Array(width*height),sources=[];
const jobs=Array.from({length:side*side},(_,i)=>({x:firstX+i%side,y:firstY+Math.floor(i/side)}));
let index=0,completed=0;
await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
  while(index<jobs.length){
    const {x,y}=jobs[index++],url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`,response=await fetch(url);
    if(!response.ok)throw new Error(`${response.status}: ${url}`);
    const bytes=Buffer.from(await response.arrayBuffer()),tile=decode(bytes);if(tile.width!==256||tile.height!==256)throw new Error('Tile dimensions');
    for(let row=0;row<256;row++)result.set(tile.heights.subarray(row*256,(row+1)*256),((y-firstY)*256+row)*width+(x-firstX)*256);
    sources.push({url,sha256:createHash('sha256').update(bytes).digest('hex'),source:response.headers.get('x-imagery-sources')||response.headers.get('x-amz-meta-x-imagery-sources')});
    if(++completed%8===0)console.log(`고도 타일 ${completed}/${jobs.length}`);
  }
}));
let maximum=-32768,minimum=32767,peak=0;for(let i=0;i<result.length;i++){if(result[i]>maximum){maximum=result[i];peak=i;}minimum=Math.min(minimum,result[i]);}
const metadata={id:'alpine-v1',format:'uint32le width,height; int16le row deltas in meters; gzip',width,height,zoom,firstX,firstY,minimum,maximum,peak:[peak%width,Math.floor(peak/width)],sources:sources.sort((a,b)=>a.url.localeCompare(b.url)),attribution:'Mapzen. Produced using Copernicus data and information funded by the European Union - EU-DEM layers.',sourcePage:'https://registry.opendata.aws/terrain-tiles/',licensePage:'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',transformation:'Elevation values rounded to one meter. World placement, elevation scale and boundary blend are fictional.'};
if(side>1){
  const directory=fileURLToPath(new URL('../public/data/',import.meta.url));await mkdir(directory,{recursive:true});
  const binary=Buffer.alloc(8+result.byteLength);binary.writeUInt32LE(width,0);binary.writeUInt32LE(height,4);for(let i=0;i<result.length;i++)binary.writeInt16LE(result[i]-(i%width?result[i-1]:0),8+i*2);
  await writeFile(directory+'alpine-v1.terrain',gzipSync(binary,{level:9}));await writeFile(directory+'alpine-v1.json',JSON.stringify(metadata,null,2)+'\n');
}
console.log(JSON.stringify({...metadata,sources:metadata.sources.slice(0,1)},null,2));
