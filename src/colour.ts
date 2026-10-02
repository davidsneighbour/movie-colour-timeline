/** OKLab matrices: https://bottosson.github.io/posts/oklab/ */
export type Vec = [number, number, number];
export const distance = (a: Vec, b: Vec): number => a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0);
export function toLab(rgb: Vec): Vec {
  const [r,g,b] = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }) as Vec;
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
  const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
  const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
export function fromLab([L,a,b]: Vec): Vec {
  const l = (L+.3963377774*a+.2158037573*b)**3;
  const m = (L-.1055613458*a-.0638541728*b)**3;
  const s = (L-.0894841775*a-1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(v => Math.round(255*Math.max(0,Math.min(1,v <= .0031308 ? 12.92*v : 1.055*Math.max(0,v)**(1/2.4)-.055)))) as Vec;
}
export const hex = (rgb: Vec): string => '#' + rgb.map(v => v.toString(16).padStart(2,'0')).join('');
export interface Cluster { lab: Vec; count: number }
export function cluster(points: Vec[], requested: number, iterations = 24): { clusters: Cluster[]; error: number } {
  if (!points.length) throw new Error('Cannot cluster an empty colour list.');
  const centres: Vec[] = [[...points[0]!]];
  while (centres.length < Math.min(requested, points.length)) {
    let best = 0, score = 0;
    points.forEach((p,i) => { const d = Math.min(...centres.map(c => distance(p,c))); if (d > score) { best = i; score = d; } });
    if (score < 1e-12) break;
    centres.push([...points[best]!]);
  }
  let counts: number[] = [];
  for (let step = 0; step < iterations; step++) {
    const sums = centres.map((): Vec => [0,0,0]); counts = centres.map(() => 0);
    for (const p of points) {
      const i = nearest(p, centres); counts[i]!++;
      for (let j=0;j<3;j++) sums[i]![j]! += p[j]!;
    }
    let movement = 0;
    centres.forEach((c,i) => { if (counts[i]) { const next = sums[i]!.map(v => v/counts[i]!) as Vec; movement += distance(c,next); centres[i] = next; } });
    if (movement < 1e-12) break;
  }
  counts = centres.map(() => 0);
  let error = 0;
  for (const p of points) { const i = nearest(p,centres); counts[i]!++; error += distance(p,centres[i]!); }
  return { clusters: centres.map((lab,i) => ({lab,count:counts[i]!})).filter(c => c.count > 0).sort((a,b) => b.count-a.count), error:error/points.length };
}
function nearest(p: Vec, centres: Vec[]): number {
  let i=0, d=Infinity;
  centres.forEach((c,j) => { const n=distance(p,c); if(n<d) { d=n; i=j; } }); return i;
}
export function palette(points: Vec[], min: number, max: number, improvement: number, floor: number, iterations: number) {
  let chosen = cluster(points,min,iterations);
  const trials = [{k:chosen.clusters.length,error:chosen.error,improvement:null as number|null}];
  let stopped = chosen.error <= floor;
  for (let k=min+1; k<=max && !stopped;k++) {
    const next = cluster(points,k,iterations);
    const gain = chosen.error ? (chosen.error-next.error)/chosen.error : 0;
    trials.push({k:next.clusters.length,error:next.error,improvement:gain});
    if (gain < improvement || next.clusters.length === chosen.clusters.length) break;
    chosen=next; stopped=chosen.error<=floor;
  }
  return {colours:chosen.clusters.map(c => ({hex:hex(fromLab(c.lab)),rgb:fromLab(c.lab),oklab:c.lab,count:c.count,weight:c.count/points.length})),trials};
}


export interface FrameColour { oklab: Vec; weight: number }
export interface PaletteSample { oklab: Vec; clusters?: FrameColour[] }
export interface AccentSettings {
  accentMax: number; accentDistance: number; accentMinSamples: number;
  accentMinFrameWeight: number; accentMinWeight: number;
}
/** Retain the frequency palette, then add supported, perceptually distant groups. */
export function artPalette(samples: PaletteSample[], min: number, max: number, improvement: number, floor: number, iterations: number, settings: AccentSettings) {
  const base = palette(samples.map(s=>s.oklab),min,max,improvement,floor,iterations);
  const centres = base.colours.map(p=>p.oklab);
  const roles: Array<'main'|'accent'> = centres.map(()=>'main');
  const entries = samples.flatMap((s,index)=>(s.clusters??[{oklab:s.oklab,weight:1}]).map(c=>({...c,sample:index})));
  const residual = entries.filter(c=>Math.sqrt(Math.min(...centres.map(p=>distance(c.oklab,p))))>=settings.accentDistance);
  const groups: Array<{sum:Vec;lab:Vec;weight:number;support:Map<number,number>}> = [];
  for(const c of residual) {
    let group=groups.find(g=>distance(c.oklab,g.lab)<=.04**2);
    if(!group) {group={sum:[0,0,0],lab:c.oklab,weight:0,support:new Map()};groups.push(group);}
    group.weight+=c.weight;
    for(let j=0;j<3;j++) group.sum[j]!+=c.oklab[j]!*c.weight;
    group.lab=group.sum.map(v=>v/group.weight) as Vec;
    group.support.set(c.sample,(group.support.get(c.sample)??0)+c.weight);
  }
  const supported=groups.filter(g=>g.weight/samples.length>=settings.accentMinWeight && [...g.support.values()].filter(w=>w>=settings.accentMinFrameWeight).length>=settings.accentMinSamples);
  for(let i=0;i<settings.accentMax && centres.length<max;i++) {
    supported.sort((a,b)=>Math.min(...centres.map(p=>distance(b.lab,p)))-Math.min(...centres.map(p=>distance(a.lab,p))));
    const best=supported.shift();
    if(!best || Math.sqrt(Math.min(...centres.map(p=>distance(best.lab,p))))<settings.accentDistance) break;
    centres.push(best.lab);roles.push('accent');
  }
  // Each sample contributes one unit; cluster weights represent area within that frame.
  const weights=centres.map(()=>0), support=centres.map(()=>new Set<number>());
  for(const c of entries) {const i=nearest(c.oklab,centres);weights[i]!+=c.weight;support[i]!.add(c.sample);}
  return {
    colours:centres.map((oklab,i)=>({hex:hex(fromLab(oklab)),rgb:fromLab(oklab),oklab,count:support[i]!.size,weight:weights[i]!/samples.length,role:roles[i]!})).filter(p=>p.weight>0).sort((a,b)=>b.weight-a.weight),
    trials:base.trials,
    weightBasis:samples.every(s=>s.clusters!==undefined)?'pixel-time' as const:'dominant-time' as const,
  };
}
