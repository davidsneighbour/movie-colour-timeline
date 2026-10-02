import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,readFile,rm,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec=promisify(execFile);
test('full CLI: video → JSON → manual hero → resized artwork and errors',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'movie-pipeline-'));
  try {
    const video=join(dir,'three colours.mkv'),cfg=join(dir,'config.json'),art=join(dir,'art'),render=join(dir,'render');
    await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:s=160x90:r=10:d=1','-f','lavfi','-i','color=green:s=160x90:r=10:d=1','-f','lavfi','-i','color=blue:s=160x90:r=10:d=1','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0,pad=160:120:0:15:black[v]','-map','[v]','-c:v','ffv1',video]);
    await writeFile(cfg,JSON.stringify({samples:9,analysisWidth:80,candidateCount:3,candidateWidth:160,renderWidth:320,timelineHeight:30,bannerHeight:240,paletteHeight:40}));
    const cli=(...args)=>exec(process.execPath,['dist/cli.js',...args]);
    await cli('analyse',video,'--out',art,'--config',cfg);
    const path=join(art,'analysis.json');const a=JSON.parse(await readFile(path,'utf8'));
    assert.equal(a.samples.length,9);assert.equal(a.palette.colours.length,3);assert.equal(a.heroCandidateId,null);
    assert.equal(a.schemaVersion,2);assert.equal(a.palette.weightBasis,'pixel-time');assert.ok(a.samples.every(s=>s.clusters.length>0));
    assert.equal(a.source.sha256.length,64);assert.ok(a.samples.every(s=>s.crop.y>=14 && s.crop.height<=92));
    assert.ok(a.samples[0].rgb[0]>240);assert.ok(a.samples[8].rgb[2]>240);
    assert.ok(a.samples[0].time>0 && a.samples[8].time<3);
    await assert.rejects(cli('select',path,'--candidate','88'));
    await cli('select',path,'--candidate','1');
    await cli('repalette',path,'--config',cfg);assert.equal(JSON.parse(await readFile(path,'utf8')).heroCandidateId,1);
    await cli('render',path,'--out',render,'--config',cfg,'--title','A & B <film>');
    const banner=await readFile(join(render,'banner.svg'),'utf8');assert.ok(banner.includes('data:image/png;base64,'));assert.ok(banner.includes('A &amp; B &lt;film&gt;'));assert.equal((banner.match(/class="palette-label"/g)||[]).length,a.palette.colours.length);assert.equal((banner.match(/class="palette-percentage"/g)||[]).length,a.palette.colours.length);assert.ok(banner.includes('aria-label="A &amp; B &lt;FILM&gt;"'));assert.ok(banner.includes('data-font-family="Barlow Semi Condensed"'));assert.ok(banner.includes('class="timeline" transform="translate(0 170)"'));assert.ok(!banner.includes('<text '));assert.match(banner,/class="banner-title"[^>]*transform="translate\(16 /);
    assert.ok((await stat(join(render,'timeline.png'))).size>0);
    const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-of','json',join(render,'timeline.png')])).stdout);assert.equal(probe.streams[0].width,320);
    const bannerProbe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-of','json',join(render,'banner.png')])).stdout);assert.equal(bannerProbe.streams[0].codec_name,'png');assert.equal(bannerProbe.streams[0].width,320);assert.equal(bannerProbe.streams[0].height,240);
    const legacy=structuredClone(a);legacy.schemaVersion=1;legacy.algorithm='oklab-kmeans-v1';legacy.samples.forEach(s=>delete s.clusters);delete legacy.palette.weightBasis;legacy.palette.colours.forEach(p=>delete p.role);
    const legacyPath=join(art,'legacy.json');await writeFile(legacyPath,JSON.stringify(legacy));
    const result=await cli('repalette',legacyPath,'--config',cfg);assert.ok(result.stderr.includes('Legacy analysis'));assert.equal(JSON.parse(await readFile(legacyPath,'utf8')).palette.weightBasis,'dominant-time');
    await assert.rejects(cli('analyse',video,'--out',art,'--config',cfg));
    await assert.rejects(cli('analyse',join(dir,'missing.mp4'),'--out',join(dir,'missing')));
    await writeFile(join(dir,'broken.json'),'{}');await assert.rejects(cli('render',join(dir,'broken.json'),'--out',render));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('media geometry handles sample aspect ratio and rotation metadata',async()=>{
  const { config }=await import('../dist/config.js');const { probe,frame }=await import('../dist/media.js');
  const dir=await mkdtemp(join(tmpdir(),'movie-geometry-'));
  try {
    const c=await config();const source=join(dir,'wide.mp4'),rotated=join(dir,'rotated.mp4');
    await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-vf','setsar=3/2','-c:v','libx264','-threads','1',source]);
    const meta=await probe(source,c);assert.equal(meta.width,240);assert.equal(meta.height,90);
    const image=await frame(source,.5,80,c);assert.equal(image.width,80);assert.equal(image.height,30);
    await exec('ffmpeg',['-v','error','-y','-display_rotation:v:0','90','-i',source,'-c','copy',rotated]);
    const rotatedMeta=await probe(rotated,c);assert.equal(rotatedMeta.width,60);assert.equal(rotatedMeta.height,160);
    const rotatedImage=await frame(rotated,.5,60,c);assert.equal(rotatedImage.width,60);assert.equal(rotatedImage.height,160);
  } finally {await rm(dir,{recursive:true,force:true});}
});
