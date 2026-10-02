#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { artPalette } from './colour.js';
import { config, socialPresets } from './config.js';
import { analyse, load, save } from './analysis.js';
import { timelineSvg, timelinePng, bannerSvg, bannerPng, exportConfig } from './render.js';
const help=`Movie colour timeline

  analyse VIDEO --out DIRECTORY [--config FILE]
  select ANALYSIS.json --candidate ID
  repalette ANALYSIS.json [--config FILE]
  render ANALYSIS.json --out DIRECTORY [--config FILE] [--title TEXT] [--social]

Analyse writes canonical JSON, candidate PNGs, and candidates.html.
Select stores your chosen hero ID. Render writes timeline.svg and timeline.png;
it also writes banner.svg and banner.png when a hero has been selected. SVG embeds the hero.
Render settings are configurable separately from analysis settings.
--social adds eight aspect-ratio banners; config exports can define individual layouts.
`;
async function main() {
  const args=process.argv.slice(2);
  if(!args.length || args.includes('--help') || args[0]==='help') {console.log(help);return;}
  const command=args.shift(),input=args.shift();
  if(!input || input.startsWith('--')) throw new Error('Provide an input path. Use --help for examples.');
  const options=new Map<string,string>();
  const allowed=command==='analyse'?['--out','--config']:command==='select'?['--candidate']:command==='repalette'?['--config']:command==='render'?['--out','--config','--title','--social']:[];
  if(!allowed.length) throw new Error(`Unknown command: ${command}`);
  while(args.length) {const key=args.shift()!;if(key==='--social' && command==='render' && !options.has(key)) {options.set(key,'true');continue;}const value=args.shift();if(!allowed.includes(key) || !value || value.startsWith('--') || options.has(key)) throw new Error(`Invalid or duplicate option: ${key}`);options.set(key,value);}
  if(command==='select') {
    const value=options.get('--candidate'); if(value===undefined || !/^\d+$/.test(value)) throw new Error('--candidate must be an integer ID.');
    const a=await load(input),id=Number(value); if(!a.candidates.some(v=>v.id===id)) throw new Error(`No candidate ${id}. Open candidates.html to see the available IDs.`);
    a.heroCandidateId=id;await save(input,a);console.log(`Selected hero candidate ${id}.`);return;
  }
  if(command==='repalette') {
    const a=await load(input),c=await config(options.get('--config'),a.config);
    a.palette=artPalette(a.samples,c.paletteMin,c.paletteMax,c.paletteImprovement,c.paletteErrorFloor,c.iterations,c);
    a.config={...await config(undefined,a.config)};
    for(const key of ['paletteMin','paletteMax','paletteImprovement','paletteErrorFloor','accentMax','accentDistance','accentMinSamples','accentMinFrameWeight','accentMinWeight'] as const) a.config[key]=c[key];
    await save(input,a);
    console.log(`Updated palette: ${a.palette.colours.length} colours (${a.palette.weightBasis}).`);
    if(!a.samples[0]!.clusters) console.error('Legacy analysis: accents can use dominant sample colours only. Reanalyse the video to retain within-frame colours.');
    return;
  }
  const directory=options.get('--out');if(!directory) throw new Error('--out DIRECTORY is required.');
  const c=await config(options.get('--config'));
  if(command==='analyse') {const a=await analyse(input,directory,c);console.log(`Saved ${a.samples.length} samples and ${a.palette.colours.length} palette colours to ${resolve(directory)}.`);return;}
  const presets=c.exports.length?c.exports:options.has('--social')?socialPresets:[];
  const a=await load(input);await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'timeline.svg'),timelineSvg(a,c.renderWidth,c.timelineHeight));
  await timelinePng(a,join(directory,'timeline.png'),c);
  if(a.heroCandidateId!==null) {
    const banner=join(directory,'banner.svg');
    await bannerSvg(a,input,banner,c,options.get('--title')??'Film colour study');
    await bannerPng(banner,join(directory,'banner.png'),c);
    for(const preset of presets) {
      const settings=exportConfig(c,preset),svg=join(directory,`banner-${preset.name}.svg`);
      await bannerSvg(a,input,svg,settings,options.get('--title')??'Film colour study',preset);
      await bannerPng(svg,join(directory,`banner-${preset.name}.png`),settings);
    }
  }
  console.log(`Rendered artwork to ${resolve(directory)}.${a.heroCandidateId===null?' Select a hero candidate to add a banner.':''}`);
}
main().catch((error:unknown)=>{console.error(`Error: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});
