import fs from 'node:fs';
import { MOTION_CASES } from './motion-cases.mjs';
export function recordingOptions(args) {
  if (!args[0]?.startsWith('--')) {
    const [label='motion', ids='piano,brass,triangle,pizzicato'] = args;
    if (!/^[\w-]+$/.test(label)) throw Error('Invalid recording label');
    return { label, cases: ids.split(',').map(id => {
      if (!MOTION_CASES[id]) throw Error(`Unknown motion case: ${id}`);
      return { id, ...MOTION_CASES[id] };
    }) };
  }
  const options = {};
  const allowed = new Set(['song','venue','section','chair','start','seconds','label','plan','case']);
  for (let i=0;i<args.length;i+=2) {
    const key=args[i].slice(2);
    if (!allowed.has(key) || args[i+1] === undefined || args[i+1].startsWith('--')) throw Error(`Invalid option: ${args[i]}`);
    options[key]=args[i+1];
  }
  const label=options.label || 'motion';
  if (!/^[\w-]+$/.test(label)) throw Error('Invalid recording label');
  if(options.plan){
    const plan=JSON.parse(fs.readFileSync(options.plan,'utf8'));
    const cases=options.case ? plan.filter(c=>c.id===options.case) : plan;
    if(!cases.length)throw Error(`No generated recording case: ${options.case}`);
    cases.forEach(validate);
    return {label,cases};
  }
  const spec={id:`${options.section}-${options.chair||0}`,song:options.song,venue:options.venue,sid:options.section,
    ci:Number(options.chair||0),start:Number(options.start||0),seconds:Number(options.seconds||8)};
  validate(spec);return {label,cases:[spec]};
}
function validate(spec){
  for(const key of ['id','song','venue','sid'])if(typeof spec[key]!=='string'||!/^[\w-]+$/.test(spec[key]))throw Error(`Invalid ${key}`);
  if(!Number.isInteger(spec.ci)||spec.ci<0||!Number.isFinite(spec.start)||spec.start<0||!(spec.seconds>0&&spec.seconds<=120))throw Error('Invalid recording chair/time');
}
