import test from 'node:test';
import assert from 'node:assert/strict';
import { toLab, fromLab, cluster, palette } from '../dist/colour.js';
import { detectEdges } from '../dist/media.js';
import { defaults, config } from '../dist/config.js';
import { timelineSvg } from '../dist/render.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('OKLab primaries, white, and round trips',()=>{
  const white=toLab([255,255,255]);assert.ok(Math.abs(white[0]-1)<1e-7);assert.ok(Math.abs(white[1])<1e-7);
  for(const rgb of [[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[93,147,201]]) assert.deepEqual(fromLab(toLab(rgb)),rgb);
});
test('dominant cluster preserves majority and is deterministic',()=>{
  const red=toLab([255,0,0]),blue=toLab([0,0,255]);const points=[...Array(70).fill(red),...Array(30).fill(blue)];
  const a=cluster(points,6);assert.equal(a.clusters.length,2);assert.equal(a.clusters[0].count,70);assert.deepEqual(fromLab(a.clusters[0].lab),[255,0,0]);assert.deepEqual(a,cluster(points,6));
});
test('natural palette stops at exact modes, including fewer than minimum',()=>{
  const points=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]].flatMap(rgb=>Array(10).fill(toLab(rgb)));
  assert.equal(palette(points,3,8,.15,.0001,24).colours.length,4);
  assert.equal(palette(Array(10).fill(toLab([0,0,0])),3,8,.15,.0001,24).colours.length,1);
});
test('black edges crop but an all-black frame remains complete',()=>{
  const data=Buffer.alloc(20*20*3);for(let y=3;y<17;y++) for(let x=0;x<20;x++) data.fill(220,(y*20+x)*3,(y*20+x)*3+3);
  assert.deepEqual(detectEdges(data,20,20,defaults),{x:0,y:3,width:20,height:14});
  assert.deepEqual(detectEdges(Buffer.alloc(1200),20,20,defaults),{x:0,y:0,width:20,height:20});
});
test('arbitrary width timeline keeps chronological samples',()=>{
  const a={samples:[{hex:'#ff0000'},{hex:'#00ff00'},{hex:'#0000ff'}]};
  const svg=timelineSvg(a,6,20);assert.equal((svg.match(/stroke=/g)||[]).length,6);assert.ok(svg.indexOf('#ff0000')<svg.indexOf('#0000ff'));
});
test('config rejects unknown keys and invalid ranges',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'movie-config-'));const path=join(dir,'config.json');
  try {for(const data of [{samples:0},{paletteMin:8,paletteMax:3},{crop:{x:-1,y:0,width:2,height:2}},{oops:1},{end:0},{accentMax:-1},{accentDistance:-1},{paletteWidthExponent:2},{paletteMinWidth:-1},{titleFontSize:0},{paletteFontSize:-1},{titleInset:-1}]) {await writeFile(path,JSON.stringify(data));await assert.rejects(config(path));}} finally {await rm(dir,{recursive:true,force:true});}
});

test('supported within-frame red becomes an accent; isolated red is rejected',async()=>{
  const { artPalette }=await import('../dist/colour.js');
  const browns=[[45,28,20],[95,65,40],[150,120,80]].map(toLab),red=toLab([255,0,0]);
  const make=(redFrames)=>Array.from({length:60},(_,i)=>({oklab:browns[i%3],clusters:i<redFrames?[{oklab:browns[i%3],weight:.8},{oklab:red,weight:.2}]:[{oklab:browns[i%3],weight:1}]}));
  const settings={accentMax:2,accentDistance:.12,accentMinSamples:2,accentMinFrameWeight:.05,accentMinWeight:.002};
  const a=artPalette(make(3),3,8,.15,.1,24,settings);
  const accent=a.colours.find(p=>p.role==='accent');assert.ok(accent);assert.deepEqual(accent.rgb,[255,0,0]);assert.ok(Math.abs(accent.weight-.01)<1e-10);
  assert.ok(Math.abs(a.colours.reduce((s,p)=>s+p.weight,0)-1)<1e-10);assert.equal(a.weightBasis,'pixel-time');
  assert.equal(artPalette(make(1),3,8,.15,.1,24,settings).colours.filter(p=>p.role==='accent').length,0);
  assert.equal(artPalette(make(3),3,8,.15,.1,24,{...settings,accentMax:0}).colours.length,3);
  assert.ok(a.colours.length<=8);assert.deepEqual(a,artPalette(make(3),3,8,.15,.1,24,settings));
});
test('square-root widths preserve order, total width, and minimum label space',async()=>{
  const { paletteWidths }=await import('../dist/render.js');
  const widths=paletteWidths([.64,.16,.16,.04],900,.5,0);assert.deepEqual(widths,[400,200,200,100]);
  const bounded=paletteWidths([.95,.04,.01],900,.5,80);assert.ok(bounded[0]>bounded[1]&&bounded[1]>bounded[2]);assert.ok(bounded[2]>=80);assert.ok(Math.abs(bounded.reduce((a,b)=>a+b)-900)<1e-8);
  assert.deepEqual(paletteWidths([.9,.1],100,.5,80),[50,50]);assert.deepEqual(paletteWidths([.9,.1],100,0,0),[50,50]);
});
