import { readFile, mkdir, writeFile, rename, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Config } from './config.js';
import { cluster, toLab, fromLab, hex, artPalette, type Vec, type FrameColour } from './colour.js';
import { probe, frame, detectEdges, pixels, png, type Rect } from './media.js';
export interface Sample { index:number;time:number;rgb:Vec;hex:string;oklab:Vec;dominance:number;crop:Rect;clusters?:FrameColour[] }
export interface Candidate { id:number;sampleIndex:number;time:number;file:string;crop:Rect }
export interface Analysis {
  schemaVersion:1|2; algorithm:'oklab-kmeans-v1'|'oklab-kmeans-v2'; source:{path:string;sha256:string;bytes:number;width:number;height:number;duration:number;sampleAspectRatio:string;rotation:number};
  config:Config; range:{start:number;end:number}; samples:Sample[];palette:ReturnType<typeof artPalette>;candidates:Candidate[];heroCandidateId:number|null;
}
export async function save(path:string,data:unknown) {const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(data,null,2)+'\n');await rename(tmp,path);}
export async function fingerprint(path:string): Promise<string> {
  const hash=createHash('sha256');for await(const part of createReadStream(path)) hash.update(part);return hash.digest('hex');
}
export async function analyse(input:string,directory:string,c:Config):Promise<Analysis> {
  input=resolve(input); directory=resolve(directory);
  const info=await stat(input);if(!info.isFile()) throw new Error('Input must be a local video file.');
  const metadata=await probe(input,c);
  const end=c.end??metadata.duration;
  if(c.start>=metadata.duration || end>metadata.duration) throw new Error('Analysis range exceeds the video duration.');
  if(typeof c.crop==='object' && (c.crop.x+c.crop.width>metadata.width || c.crop.y+c.crop.height>metadata.height)) throw new Error('Manual crop exceeds video dimensions.');
  await mkdir(directory,{recursive:true});
  // Refuse to overwrite an existing canonical run. Failed runs can use a new directory.
  try {await stat(join(directory,'analysis.json'));throw new Error('Output already contains analysis.json; choose a new directory.');} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
  const samples:Sample[]=[];
  for(let i=0;i<c.samples;i++) {
    const time=c.start+(i+.5)*(end-c.start)/c.samples;
    const image=await frame(input,time,c.analysisWidth,c,typeof c.crop==='object'?c.crop:undefined);
    const rect=c.crop==='auto'?detectEdges(image.data,image.width,image.height,c):{x:0,y:0,width:image.width,height:image.height};
    const result=cluster(pixels(image.data,image.width,image.height,rect).map(toLab),c.frameClusters,c.iterations);
    const main=result.clusters[0]!;const rgb=fromLab(main.lab);
    const crop=typeof c.crop==='object'?c.crop:{x:Math.round(rect.x*metadata.width/image.width),y:Math.round(rect.y*metadata.height/image.height),width:Math.round(rect.width*metadata.width/image.width),height:Math.round(rect.height*metadata.height/image.height)};
    samples.push({index:i,time,rgb,hex:hex(rgb),oklab:main.lab,dominance:main.count/(rect.width*rect.height),crop,clusters:result.clusters.map(v=>({oklab:v.lab,weight:v.count/(rect.width*rect.height)}))});
    if(i===0 || (i+1)%25===0 || i===c.samples-1) console.error(`Analysed ${i+1}/${c.samples} frames`);
  }
  const candidates:Candidate[]=[];await mkdir(join(directory,'candidates'),{recursive:true});
  const count=Math.min(c.candidateCount,c.samples);
  for(let id=0;id<count;id++) {
    const sample=samples[Math.min(samples.length-1,Math.floor((id+.5)*samples.length/count))]!;
    const file=`candidates/${String(id).padStart(3,'0')}.png`;
    await png(input,sample.time,join(directory,file),c.candidateWidth,c,sample.crop);
    candidates.push({id,sampleIndex:sample.index,time:sample.time,file,crop:sample.crop});
  }
  const data:Analysis={schemaVersion:2,algorithm:'oklab-kmeans-v2',source:{path:input,sha256:await fingerprint(input),bytes:info.size,...metadata},config:c,range:{start:c.start,end},samples,palette:artPalette(samples,c.paletteMin,c.paletteMax,c.paletteImprovement,c.paletteErrorFloor,c.iterations,c),candidates,heroCandidateId:null};
  await save(join(directory,'analysis.json'),data);
  await writeFile(join(directory,'candidates.html'),gallery(data));return data;
}
function gallery(a:Analysis):string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Choose a hero frame</title><style>body{background:#10151a;color:white;font:16px system-ui;margin:2rem}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}img{width:100%}figure{margin:0}figcaption{padding:.5rem}</style><h1>Choose a hero frame</h1><p>Use the candidate ID with the select command.</p><main>${a.candidates.map(c=>`<figure><img src="${c.file}" alt="Candidate ${c.id}"><figcaption>ID ${c.id} · ${c.time.toFixed(2)} seconds</figcaption></figure>`).join('')}</main></html>`;
}
export async function load(path:string):Promise<Analysis> {
  const a:Analysis=JSON.parse(await readFile(path,'utf8'));
  if(!a || ![1,2].includes(a.schemaVersion) || !['oklab-kmeans-v1','oklab-kmeans-v2'].includes(a.algorithm) || !Array.isArray(a.samples) || !a.samples.length || !a.palette || !Array.isArray(a.palette.colours) || !a.palette.colours.length || !Array.isArray(a.candidates)) throw new Error('Invalid or unsupported analysis JSON.');
  for(const s of a.samples) if(!s || !/^#[0-9a-f]{6}$/i.test(s.hex) || !Array.isArray(s.rgb) || s.rgb.length!==3 || !s.rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255) || !Number.isFinite(s.time) || !Array.isArray(s.oklab) || s.oklab.length!==3 || !s.oklab.every(Number.isFinite)) throw new Error('Invalid sample in analysis JSON.');
  for(const s of a.samples) if(s.clusters!==undefined && (!Array.isArray(s.clusters) || !s.clusters.length || s.clusters.some(c=>!c || !Array.isArray(c.oklab) || c.oklab.length!==3 || !c.oklab.every(Number.isFinite) || !Number.isFinite(c.weight) || c.weight<=0) || Math.abs(s.clusters.reduce((sum,c)=>sum+c.weight,0)-1)>1e-6)) throw new Error('Invalid frame clusters in analysis JSON.');
  if(a.samples.some(s=>s.clusters!==undefined) && !a.samples.every(s=>s.clusters!==undefined)) throw new Error('Frame clusters must be present for all samples or none.');
  for(const p of a.palette.colours) if(!/^#[0-9a-f]{6}$/i.test(p.hex) || !Number.isFinite(p.weight) || p.weight<=0 || !Array.isArray(p.oklab) || p.oklab.length!==3 || !p.oklab.every(Number.isFinite)) throw new Error('Invalid palette in analysis JSON.');
  if(Math.abs(a.palette.colours.reduce((sum,p)=>sum+p.weight,0)-1)>1e-6) throw new Error('Palette weights must sum to one.');
  if(a.heroCandidateId!==null && (!Number.isInteger(a.heroCandidateId) || !a.candidates.some(v=>v.id===a.heroCandidateId))) throw new Error('Invalid hero candidate ID.');
  for(const candidate of a.candidates) if(!/^candidates\/\d+\.png$/.test(candidate.file) || !Number.isInteger(candidate.id)) throw new Error('Invalid candidate in analysis JSON.');
  return a;
}
