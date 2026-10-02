import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, socialPresets } from '../dist/config.js';
import { bannerSvg, exportConfig } from '../dist/render.js';

test('social layouts preserve every palette label, fit rows, and position artwork',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'social-layout-'));
  try {
    await writeFile(join(dir,'hero.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','base64'));
    const colours=['#101010','#404040','#808080','#b0b0b0','#eeeeee'];
    const a={heroCandidateId:0,candidates:[{id:0,file:'hero.png'}],samples:colours.map(hex=>({hex})),palette:{colours:colours.map(hex=>({hex,weight:.2,role:'main'}))}};
    const c=await config();
    for(const preset of socialPresets) {
      const output=join(dir,'banner.svg'),settings=exportConfig(c,preset);
      await bannerSvg(a,join(dir,'analysis.json'),output,settings,'A long film title that must fit the available space',preset);
      const svg=await readFile(output,'utf8');
      assert.ok(svg.includes(`width="${preset.width}" height="${preset.height}"`));
      assert.equal((svg.match(/class="palette-label"/g)||[]).length,a.palette.colours.length);
      assert.equal((svg.match(/class="palette-percentage"/g)||[]).length,a.palette.colours.length);
      const rects=[...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="#[0-9a-f]{6}"/g)];
      for(const [,x,y,w,h] of rects) {assert.ok(+x + +w<=preset.width+.11);assert.ok(+y + +h<=preset.height+.01);}
      if(preset.paletteColumns && a.palette.colours.length>preset.paletteColumns) assert.ok(new Set(rects.map(r=>r[2])).size>1);
    }
    const preset={...socialPresets[0],titlePosition:'top-right',heroPosition:'xMaxYMin'};
    await bannerSvg(a,join(dir,'analysis.json'),join(dir,'position.svg'),exportConfig(c,preset),'Film',preset);
    assert.ok((await readFile(join(dir,'position.svg'),'utf8')).includes('preserveAspectRatio="xMaxYMin slice"'));
    for(const exports of [[{name:'../bad',width:100,height:100}],[{name:'bad',width:100,height:100,paletteColumns:0}],[{name:'bad',width:100,height:100,heroPosition:'bad'}],[{name:'bad',width:100,height:100,timelineHeight:90,paletteHeight:20}]]) {
      const path=join(dir,'config.json');await writeFile(path,JSON.stringify({exports}));await assert.rejects(config(path));
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
