import test from 'node:test';
import assert from 'node:assert/strict';
import { lettering } from '../dist/typography.js';
test('Fontsource lettering has real outlines, accurate bounds, and light title size',async()=>{
  const title=await lettering('ALIEN',300,84,1888,700);
  assert.equal(title.size,84);assert.ok(title.height>50);assert.ok(title.width>150);assert.ok(title.svg.includes('<path d='));
  const label=await lettering('#ABCDEF',400,36,200,60);assert.equal(label.size,36);assert.ok(label.height<title.height);
  const narrow=await lettering('A VERY LONG MOVIE TITLE',300,84,200,40);assert.ok(narrow.width<=200.000001);assert.ok(narrow.height<=40.000001);
  const extended=await lettering('ŁÓDŹ',300,84,500,200);assert.ok(extended.width>0);
  await assert.rejects(lettering(' ',300,84,500,200),/blank/);
  await assert.rejects(lettering('ALIEN',300,84,0,200),/too small/);
  await assert.rejects(lettering('ALIEN 🎬',300,84,500,200),/does not contain/);
});
