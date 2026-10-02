import { readFile } from 'node:fs/promises';
export interface ExportPreset {
  name:string; width:number; height:number;
  paletteColumns?:number; timelineHeight?:number; paletteHeight?:number;
  titlePosition?:'bottom-left'|'bottom-centre'|'bottom-right'|'top-left'|'top-centre'|'top-right';
  heroPosition?:'xMinYMin'|'xMidYMin'|'xMaxYMin'|'xMinYMid'|'xMidYMid'|'xMaxYMid'|'xMinYMax'|'xMidYMax'|'xMaxYMax';
}
export const socialPresets:ExportPreset[] = [
  {name:'1x1',width:1080,height:1080},
  {name:'4x5',width:1080,height:1350,paletteColumns:2},
  {name:'9x16',width:1080,height:1920,paletteColumns:2},
  {name:'40x21',width:1200,height:630},
  {name:'851x315',width:851,height:315},
  {name:'3x1',width:1500,height:500},
  {name:'16x9',width:1920,height:1080},
  {name:'4x1',width:1600,height:400},
];
export const defaults = {
  samples:480, analysisWidth:96, frameClusters:6, iterations:24, start:0, end:null as number|null,
  crop:'auto' as 'auto'|'none'|{x:number;y:number;width:number;height:number},
  blackThreshold:20, edgeCoverage:.98, maxCropFraction:.25,
  paletteMin:3,paletteMax:8,paletteImprovement:.15,paletteErrorFloor:.0001,
  accentMax:2,accentDistance:.12,accentMinSamples:2,accentMinFrameWeight:.05,accentMinWeight:.002,
  paletteWidthExponent:.5,paletteMinWidth:80,
  candidateCount:12,candidateWidth:960,renderWidth:1920,timelineHeight:180,bannerHeight:1080,paletteHeight:130,
  titleFontSize:84,paletteFontSize:36,titleInset:16,
  exports:[] as ExportPreset[],
  background:'#10151a',ffmpeg:'ffmpeg',ffprobe:'ffprobe',timeoutMs:120000,
};
export type Config = typeof defaults;
export async function config(path?: string, base: Partial<Config> = {}): Promise<Config> {
  const supplied: unknown = path ? JSON.parse(await readFile(path,'utf8')) : {};
  if(!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Configuration must be a JSON object.');
  for (const key of Object.keys(supplied)) if (!(key in defaults)) throw new Error(`Unknown configuration key: ${key}`);
  const c = {...defaults,...base,...supplied} as Config;
  for (const key of ['samples','analysisWidth','frameClusters','iterations','paletteMin','paletteMax','candidateCount','candidateWidth','renderWidth','timelineHeight','bannerHeight','paletteHeight','timeoutMs'] as const) {
    if(!Number.isSafeInteger(c[key]) || c[key] < 1) throw new Error(`${key} must be a positive integer.`);
  }
  if(c.samples>100000 || c.analysisWidth>512 || c.frameClusters>32 || c.iterations>200 || c.paletteMax>32 || c.renderWidth>16384 || c.bannerHeight>16384 || c.timelineHeight>16384 || c.candidateWidth>8192 || c.candidateCount>200) throw new Error('Configuration exceeds resource limits.');
  if(!Number.isSafeInteger(c.accentMax) || c.accentMax<0 || c.accentMax>8 || !Number.isSafeInteger(c.accentMinSamples) || c.accentMinSamples<1) throw new Error('Invalid accent count or sample support.');
  for(const key of ['accentDistance','accentMinFrameWeight','accentMinWeight','paletteWidthExponent','paletteMinWidth','titleFontSize','paletteFontSize','titleInset'] as const) if(typeof c[key]!=='number' || !Number.isFinite(c[key]) || c[key]<0) throw new Error(`${key} must be a finite non-negative number.`);
  if(c.accentMinFrameWeight>1 || c.accentMinWeight>1 || c.paletteWidthExponent>1 || c.paletteMinWidth>16384) throw new Error('Invalid accent or palette width settings.');
  if(c.titleFontSize<=0 || c.paletteFontSize<=0 || c.titleFontSize>1024 || c.paletteFontSize>1024 || c.titleInset>16384) throw new Error('Invalid typography settings.');
  if(c.paletteMin>c.paletteMax) throw new Error('paletteMin must not exceed paletteMax.');
  for(const key of ['blackThreshold','edgeCoverage','maxCropFraction','paletteImprovement','paletteErrorFloor','start'] as const) if(typeof c[key] !== 'number' || !Number.isFinite(c[key]) || c[key]<0) throw new Error(`${key} must be a finite non-negative number.`);
  if(c.blackThreshold>255 || c.edgeCoverage>1 || c.edgeCoverage<.5 || c.maxCropFraction>=.5 || c.paletteImprovement>1) throw new Error('Invalid crop or palette thresholds.');
  if(c.end !== null && (typeof c.end !== 'number' || !Number.isFinite(c.end) || c.end<=c.start)) throw new Error('end must be null or greater than start.');
  if(c.crop !== 'auto' && c.crop !== 'none') {
    const rect=c.crop;
    if(!rect || typeof rect!=='object' || !(['x','y','width','height'] as const).every(k => Number.isSafeInteger(rect[k])) || rect.x<0 || rect.y<0 || rect.width<1 || rect.height<1) throw new Error('crop must be auto, none, or a valid pixel rectangle.');
  }
  if(!/^#[0-9a-f]{6}$/i.test(c.background)) throw new Error('background must be a six-digit hex colour.');
  for(const key of ['ffmpeg','ffprobe'] as const) if(typeof c[key]!=='string' || !c[key]) throw new Error(`${key} must be a command or executable path.`);
  if(!Array.isArray(c.exports) || c.exports.length>32) throw new Error('exports must be an array of at most 32 presets.');
  const names=new Set<string>();
  for(const preset of c.exports) {
    if(!preset || typeof preset!=='object' || Array.isArray(preset)) throw new Error('Each export must be an object.');
    for(const key of Object.keys(preset)) if(!['name','width','height','paletteColumns','timelineHeight','paletteHeight','titlePosition','heroPosition'].includes(key)) throw new Error(`Unknown export key: ${key}`);
    if(typeof preset.name!=='string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(preset.name) || names.has(preset.name.toLowerCase())) throw new Error('Export names must be unique, safe filename stems.');
    names.add(preset.name.toLowerCase());
    for(const key of ['width','height'] as const) if(!Number.isSafeInteger(preset[key]) || preset[key]<64 || preset[key]>16384) throw new Error(`Export ${key} must be an integer from 64 to 16384.`);
    if(preset.width*preset.height>32_000_000) throw new Error('Export exceeds 32 million pixels.');
    for(const key of ['paletteColumns','timelineHeight','paletteHeight'] as const) if(preset[key]!==undefined && (!Number.isSafeInteger(preset[key]) || preset[key]!<1 || preset[key]!>16384)) throw new Error(`Export ${key} must be a positive integer within resource limits.`);
    if(preset.titlePosition!==undefined && !/^(top|bottom)-(left|centre|right)$/.test(preset.titlePosition)) throw new Error('Invalid export titlePosition.');
    if(preset.heroPosition!==undefined && !/^x(Min|Mid|Max)Y(Min|Mid|Max)$/.test(preset.heroPosition)) throw new Error('Invalid export heroPosition.');
    if((preset.timelineHeight??Math.round(preset.height/6))+(preset.paletteHeight??Math.round(preset.height*.12))>=preset.height) throw new Error('Export strips must leave space for the hero.');
  }
  return c;
}
