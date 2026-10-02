import { spawn } from 'node:child_process';
import type { Config } from './config.js';
import type { Vec } from './colour.js';
export interface Rect { x:number;y:number;width:number;height:number }
export async function run(executable:string,args:string[],timeout:number): Promise<Buffer> {
  return new Promise((resolve,reject) => {
    const child=spawn(executable,args,{stdio:['ignore','pipe','pipe']}); const out:Buffer[]=[]; let err='', size=0, failure:Error|undefined;
    const timer=setTimeout(() => { failure=new Error(`${executable} exceeded ${timeout}ms.`); child.kill('SIGKILL'); },timeout);
    child.stdout.on('data',(data:Buffer) => { size+=data.length; if(size>128*1024*1024) {failure=new Error('Media output exceeds 128 MiB.');child.kill('SIGKILL');} else out.push(data); });
    child.stderr.on('data',(data:Buffer) => {err=(err+data.toString()).slice(-8000);});
    child.on('error',error => {clearTimeout(timer);reject(new Error(`Cannot run ${executable}: ${error.message}`));});
    child.on('close',code => { clearTimeout(timer); if(failure) reject(failure); else if(code!==0) reject(new Error(`${executable} failed (${code}): ${err.trim()}`)); else resolve(Buffer.concat(out)); });
  });
}
export async function probe(input:string,c:Config) {
  const data=JSON.parse((await run(c.ffprobe,['-v','error','-show_streams','-show_format','-of','json',input],c.timeoutMs)).toString()) as {streams:Array<{codec_type:string;width:number;height:number;duration?:string;sample_aspect_ratio?:string;tags?:{rotate?:string};side_data_list?:Array<{rotation?:number}>}>;format:{duration?:string}};
  const stream=data.streams.find(s => s.codec_type==='video');
  if(!stream || !stream.width || !stream.height) throw new Error('Input has no supported video stream.');
  const duration=Number(stream.duration ?? data.format.duration);
  if(!Number.isFinite(duration) || duration<=0) throw new Error('Cannot determine a finite video duration.');
  const rotation=Number(stream.tags?.rotate??stream.side_data_list?.find(s=>s.rotation!==undefined)?.rotation??0);
  if(rotation%90!==0) throw new Error('Video rotation must be a multiple of 90 degrees.');
  const sampleAspectRatio=stream.sample_aspect_ratio??'1:1';
  const [sn,sd]=sampleAspectRatio.split(':').map(Number);
  const sar=sn && sd ? sn/sd : 1;
  const swapped=Math.abs(rotation%180)===90;
  return {width:Math.round(swapped?stream.height/sar:stream.width*sar),height:swapped?stream.width:stream.height,duration,sampleAspectRatio,rotation};
}
export async function frame(input:string,time:number,width:number,c:Config,crop?:Rect): Promise<{data:Buffer;width:number;height:number}> {
  const filters=['scale=round(iw*sar):ih','setsar=1',...(crop?[`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`]:[]),`scale=${width}:-1`, 'setsar=1'];
  const output=await run(c.ffmpeg,['-v','error','-nostdin','-ss',String(time),'-i',input,'-map','0:v:0','-frames:v','1','-vf',filters.join(','),'-threads','1','-f','image2pipe','-vcodec','ppm','pipe:1'],c.timeoutMs);
  const match=/^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(output.toString('ascii',0,100));
  if(!match) throw new Error(`No decodable frame at ${time.toFixed(3)}s.`);
  const w=Number(match[1]), h=Number(match[2]), data=output.subarray(match[0].length);
  if(data.length!==w*h*3) throw new Error('Unexpected frame byte count.');
  return {data,width:w,height:h};
}
/** Only remove contiguous near-black edges, and never crop an entirely dark frame. */
export function detectEdges(data:Buffer,width:number,height:number,c:Config): Rect {
  const dark=(x:number,y:number) => {const i=(y*width+x)*3; return Math.max(data[i]!,data[i+1]!,data[i+2]!)<=c.blackThreshold;};
  const row=(y:number) => {let n=0; for(let x=0;x<width;x++) if(dark(x,y)) n++; return n/width>=c.edgeCoverage;};
  const col=(x:number) => {let n=0; for(let y=0;y<height;y++) if(dark(x,y)) n++; return n/height>=c.edgeCoverage;};
  let top=0,bottom=0,left=0,right=0;
  while(top<height && row(top)) top++;
  while(bottom<height && row(height-1-bottom)) bottom++;
  while(left<width && col(left)) left++;
  while(right<width && col(width-1-right)) right++;
  if(top>height*c.maxCropFraction || bottom>height*c.maxCropFraction) top=bottom=0;
  if(left>width*c.maxCropFraction || right>width*c.maxCropFraction) left=right=0;
  return {x:left,y:top,width:width-left-right,height:height-top-bottom};
}
export function pixels(data:Buffer,width:number,height:number,rect:Rect): Vec[] {
  const out:Vec[]=[];
  for(let y=rect.y;y<Math.min(height,rect.y+rect.height);y++) for(let x=rect.x;x<Math.min(width,rect.x+rect.width);x++) {const i=(y*width+x)*3;out.push([data[i]!,data[i+1]!,data[i+2]!]);}
  return out;
}
export async function png(input:string,time:number,output:string,width:number,c:Config,crop?:Rect) {
  await run(c.ffmpeg,['-v','error','-nostdin','-y','-ss',String(time),'-i',input,'-map','0:v:0','-frames:v','1','-vf',['scale=round(iw*sar):ih','setsar=1',...(crop?[`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`]:[]),`scale=${width}:-1`,'setsar=1'].join(','),'-threads','1',output],c.timeoutMs);
}
