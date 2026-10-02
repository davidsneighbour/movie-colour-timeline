import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { create, type Font, type Glyph } from 'fontkit';
const require=createRequire(import.meta.url);
const cache=new Map<number,Promise<Font[]>>();
export const fontFamily='Barlow Semi Condensed';
export const escapeXml=(text:string):string=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
async function fonts(weight:300|400):Promise<Font[]> {
  let pending=cache.get(weight);
  if(!pending) {
    pending=Promise.all(['latin','latin-ext'].map(async subset=>{
      const path=require.resolve(`@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-${subset}-${weight}-normal.woff2`);
      const font=create(await readFile(path));
      if(!('layout' in font)) throw new Error('Expected a single Barlow font face.');
      return font;
    }));
    cache.set(weight,pending);
  }
  return pending;
}
/** Fontsource outlines avoid font substitution in SVG viewers and raster exporters. */
export async function lettering(text:string,weight:300|400,size:number,maxWidth:number,maxHeight:number) {
  if(!text.trim() || text.length>4096) throw new Error('Banner lettering must contain 1–4096 characters and cannot be blank.');
  if(maxWidth<=0 || maxHeight<=0) throw new Error('Banner is too small for its lettering and inset.');
  const faces=await fonts(weight);
  const segments:Array<{font:Font;text:string}>=[];
  for(const character of text) {
    const font=faces.find(f=>f.hasGlyphForCodePoint(character.codePointAt(0)!));
    if(!font) throw new Error(`Barlow does not contain the character ${JSON.stringify(character)}. Use a title supported by its Latin/Latin extended subsets.`);
    const last=segments.at(-1);
    if(last?.font===font) last.text+=character;else segments.push({font,text:character});
  }
  const parts:Array<{glyph:Glyph;x:number;y:number}>=[];
  let advanceX=0,advanceY=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const segment of segments) {
    const run=segment.font.layout(segment.text);
    run.glyphs.forEach((glyph,i)=>{
      const position=run.positions[i]!,x=advanceX+position.xOffset,y=advanceY+position.yOffset;
      if(glyph.path.commands.length) {
        const box=glyph.bbox;
        minX=Math.min(minX,x+box.minX);maxX=Math.max(maxX,x+box.maxX);
        minY=Math.min(minY,y+box.minY);maxY=Math.max(maxY,y+box.maxY);
        parts.push({glyph,x,y});
      }
      advanceX+=position.xAdvance;advanceY+=position.yAdvance;
    });
  }
  if(!parts.length) throw new Error('Banner text has no visible lettering.');
  const units=faces[0]!.unitsPerEm;
  const scale=Math.min(size/units,maxWidth/(maxX-minX),maxHeight/(maxY-minY));
  const paths=parts.map(p=>`<path d="${p.glyph.path.toSVG()}" transform="translate(${p.x} ${p.y})"/>`).join('');
  return {width:(maxX-minX)*scale,height:(maxY-minY)*scale,size:scale*units,svg:`<g transform="scale(${scale} ${-scale}) translate(${-minX} ${-maxY})">${paths}</g>`};
}
