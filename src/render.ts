import { writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Analysis } from './analysis.js';
import type { Config, ExportPreset } from './config.js';
import { run } from './media.js';
import { lettering, escapeXml, fontFamily } from './typography.js';
export function timelineSvg(a:Analysis,width:number,height:number):string {
  const stripes=Array.from({length:width},(_,x)=>`<path stroke="${a.samples[Math.min(a.samples.length-1,Math.floor((x+.5)*a.samples.length/width))]!.hex}" d="M${x+.5} 0v${height}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Film colour timeline, from start to end</title>${stripes}</svg>`;
}
export async function timelinePng(a:Analysis,output:string,c:Config) {
  const w=c.renderWidth,h=c.timelineHeight;
  if(w*h>32_000_000) throw new Error('Timeline exceeds 32 million pixels.');
  const data=Buffer.alloc(w*h*3);
  for(let x=0;x<w;x++) {const rgb=a.samples[Math.min(a.samples.length-1,Math.floor((x+.5)*a.samples.length/w))]!.rgb;for(let y=0;y<h;y++) {const i=(y*w+x)*3;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];}}
  const ppm=output+'.tmp.ppm';
  await writeFile(ppm,Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),data]));
  try {await run(c.ffmpeg,['-v','error','-nostdin','-y','-i',ppm,'-frames:v','1','-threads','1',output],c.timeoutMs);} finally {const {unlink}=await import('node:fs/promises');await unlink(ppm);}
}
export async function bannerSvg(a:Analysis,analysisPath:string,output:string,c:Config,title:string,preset?:ExportPreset) {
  const candidate=a.candidates.find(v=>v.id===a.heroCandidateId);
  if(!candidate) throw new Error('Select a hero candidate before rendering a banner.');
  const hero=(await readFile(resolve(dirname(analysisPath),candidate.file))).toString('base64');
  const w=c.renderWidth,h=c.bannerHeight,heroHeight=h-c.timelineHeight-c.paletteHeight;
  if(heroHeight<1) throw new Error('Banner height must exceed timelineHeight + paletteHeight.');
  const timeline=timelineSvg(a,w,c.timelineHeight).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
  const titleText=title.toUpperCase();
  const titleRun=await lettering(titleText,300,c.titleFontSize,w-2*c.titleInset,heroHeight-2*c.titleInset);
  const position=preset?.titlePosition??'bottom-left';
  const titleY=position.startsWith('top')?c.titleInset:heroHeight-c.titleInset-titleRun.height;
  const titleX=position.endsWith('right')?w-c.titleInset-titleRun.width:position.endsWith('centre')?(w-titleRun.width)/2:c.titleInset;
  const columns=Math.min(a.palette.colours.length,preset?.paletteColumns??a.palette.colours.length);
  const rows=Math.ceil(a.palette.colours.length/columns),rowHeight=c.paletteHeight/rows;
  let x=0;

  const blocks:string[]=[];
  for(const [i,p] of a.palette.colours.entries()) {
    const row=Math.floor(i/columns),start=row*columns;
    const widths=paletteWidths(a.palette.colours.slice(start,start+columns).map(p=>p.weight),w,c.paletteWidthExponent,c.paletteMinWidth);
    if(i%columns===0) x=0;
    const bottom=h-c.paletteHeight+(row+1)*rowHeight;
    const width=widths[i%columns]!,padding=Math.min(16,width*.1,rowHeight*.12),gap=Math.min(8,rowHeight*.08);
    const label=p.hex.toUpperCase(),percentage=`${(100*p.weight).toFixed(1)}%`;
    const availableWidth=width-2*padding,availableHeight=(rowHeight-2*padding-gap)/2;
    const hexRun=await lettering(label,400,c.paletteFontSize,availableWidth,availableHeight);
    const percentRun=await lettering(percentage,400,hexRun.size,availableWidth,availableHeight);
    const finalHex=await lettering(label,400,percentRun.size,availableWidth,availableHeight);
    const labelY=bottom-padding-percentRun.height-gap-finalHex.height;
    blocks.push(`<g class="palette-block"><title>${label} · ${percentage}${p.role==='accent'?' · accent':''}</title><rect x="${x}" y="${bottom-rowHeight}" width="${width+.1}" height="${rowHeight}" fill="${p.hex}"/><g class="palette-label" aria-label="${label}" data-font-size="${finalHex.size}" transform="translate(${x+padding} ${labelY})" fill="${labelColour(p.hex)}">${finalHex.svg}</g><g class="palette-percentage" aria-label="${percentage}" data-font-size="${percentRun.size}" transform="translate(${x+padding} ${bottom-padding-percentRun.height})" fill="${labelColour(p.hex)}">${percentRun.svg}</g></g>`);
    x+=width;
  }
  const fadeHeight=Math.min(heroHeight,titleRun.height+c.titleInset*4);
  await writeFile(output,`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="banner-title" data-font-family="${fontFamily}"><title id="banner-title">${escapeXml(title)}</title><metadata>Lettering: Barlow Semi Condensed, Jeremy Tribby, SIL Open Font License 1.1. Fontsource glyph outlines; title light 300, labels regular 400.</metadata><defs><linearGradient id="title-fade" x1="0" y1="${position.startsWith('top')?1:0}" x2="0" y2="${position.startsWith('top')?0:1}"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.72"/></linearGradient></defs><rect width="${w}" height="${h}" fill="${c.background}"/><image href="data:image/png;base64,${hero}" width="${w}" height="${heroHeight}" preserveAspectRatio="${preset?.heroPosition??'xMidYMid'} slice"/><rect x="0" y="${position.startsWith('top')?0:heroHeight-fadeHeight}" width="${w}" height="${fadeHeight}" fill="url(#title-fade)"/><g class="banner-title" aria-label="${escapeXml(titleText)}" data-font-size="${titleRun.size}" transform="translate(${titleX} ${titleY})" fill="#ffffff">${titleRun.svg}</g><g class="timeline" transform="translate(0 ${heroHeight})">${timeline}</g>${blocks.join('')}</svg>`);
}

export async function bannerPng(input:string,output:string,c:Config) {
  await run(c.ffmpeg,['-v','error','-nostdin','-y','-i',input,'-frames:v','1','-threads','1',output],c.timeoutMs);
}


/** Reserve label space, then distribute the remaining width by frequency exponent. */
export function paletteWidths(weights:number[],width:number,exponent=.5,minimum=80):number[] {
  if(!weights.length || !weights.every(v=>Number.isFinite(v)&&v>0) || !Number.isFinite(width) || width<=0 || !Number.isFinite(exponent) || exponent<0 || !Number.isFinite(minimum) || minimum<0) throw new Error('Invalid palette layout values.');
  const floor=Math.min(minimum,width/weights.length),remaining=width-floor*weights.length;
  const scores=weights.map(v=>v**exponent),total=scores.reduce((s,v)=>s+v,0);
  return scores.map(v=>floor+remaining*v/total);
}
function labelColour(hex:string):string {
  const [r,g,b]=[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const luminance=.2126*r!+.7152*g!+.0722*b!;
  return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
}

/** Scale composition settings to each export, while keeping the canonical analysis intact. */
export function exportConfig(c:Config,preset:ExportPreset):Config {
  const scale=Math.min(preset.width/c.renderWidth,preset.height/c.bannerHeight);
  return {...c,renderWidth:preset.width,bannerHeight:preset.height,
    timelineHeight:preset.timelineHeight??Math.max(1,Math.round(preset.height/6)),
    paletteHeight:preset.paletteHeight??Math.max(1,Math.round(preset.height*.12)),
    titleFontSize:c.titleFontSize*scale,paletteFontSize:c.paletteFontSize*scale,
    titleInset:c.titleInset*scale,paletteMinWidth:c.paletteMinWidth*scale};
}
