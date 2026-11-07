'use strict';
const assert=require('node:assert/strict');
const P=require('../assets/js/protocol.js'),A=require('../assets/js/analysis.js');
for(let person=1;person<=12;person++)for(const exp of P.TYPES){
  const id='P'+String(person).padStart(2,'0'),trials=P.plan(exp,id).flatMap(b=>b.trials),counts=new Map();
  assert.equal(trials.length,P.INFO[exp].total);
  for(const t of trials)counts.set(P.condition(t),(counts.get(P.condition(t))||0)+1);
  assert.equal(counts.size,A.rows(exp).length);
  for(const count of counts.values())assert.equal(count,10);
  if(exp==='search')for(const t of trials){
    const items=P.searchItems(t),pair=P.searchItems({...t,salient:1-t.salient});
    assert.equal(items.length,t.n);assert.equal(items.filter(x=>x.target).length,t.present);
    assert.equal(items.filter(x=>x.red&&x.circle).length,t.present);
    assert.equal(items.filter(x=>x.salient).length,t.salient);
    assert(items.every(x=>!x.salient||(!x.red&&!x.target)));
    assert.deepEqual(items.map(({salient,...x})=>x),pair.map(({salient,...x})=>x));
  }
  if(exp==='ratio')for(const t of trials){
    assert.deepEqual(P.values(t),P.values({...t,duration:t.duration===300?1500:300}));
    const v=P.values(t);assert(Math.abs(v.vals[v.ib]/v.vals[v.ia]*100-t.truth)<1e-10);
  }
  if(exp==='map')for(const t of trials){
    const dx=(t.ego_side==='right'?170:-170)*Math.cos(t.heading*Math.PI/180);
    assert.equal(t.answer,t.task==='geo'?(dx>0?'right':'left'):t.ego_side);
    for(const display of Object.keys(P.MAP))assert.equal(P.mapAnswer({...t,display}),t.answer);
  }
  for(const [key] of counts){
    const cell=trials.filter(t=>P.condition(t)===key);
    if(exp==='map'){assert.equal(cell.filter(t=>t.answer==='left').length,5);assert.equal(cell.filter(t=>t.heading>0).length,5);}
  }
}
// Verify variation and balance across independent sessions, beyond condition counts.
function maxRun(trials,key){let run=0,best=0,last;for(const t of trials){run=t[key]===last?run+1:1;best=Math.max(best,run);last=t[key];}return best;}
for(let session=0;session<12;session++)for(const exp of P.TYPES){
  const blocks=P.plan(exp,'P01','session-'+session),trials=blocks.flatMap(b=>b.trials);
  assert.equal(new Set(trials.map(t=>t.seed)).size,trials.length);
  if(exp==='ratio'){
    assert.equal(new Set(trials.map(t=>t.truth)).size,60);
    assert.equal(new Set(blocks.flatMap(b=>b.practice).map(t=>t.truth)).size,6);
    for(const def of A.rows(exp)){
      const cell=trials.filter(t=>P.condition(t)===P.condition({exp,...def}));
      assert.equal(cell.reduce((sum,t)=>sum+t.truth,0)/cell.length,49.5);
      assert.equal(new Set(cell.map(t=>Math.floor((t.truth-15)/7))).size,10);
    }
  }
  for(const b of blocks){
    if(exp==='ratio'){assert(maxRun(b.trials,'encoding')<=2);assert(maxRun(b.trials,'duration')<=3);}
    else assert(maxRun(b.trials,'answer')<=3);
  }
  if(exp==='search')assert.equal(new Set(trials.map(t=>JSON.stringify(P.searchItems(t).map(({x,y})=>[x,y])))).size,160);
  if(exp==='map'){
    assert.equal(new Set(trials.map(t=>JSON.stringify(P.mapGeometry(t)))).size,120);
    for(const t of trials){
      const g=P.mapGeometry(t),h=t.heading*Math.PI/180,[tx,ty]=g.target;
      const worldX=tx*Math.cos(h)-ty*Math.sin(h);
      assert.equal(t.answer,t.task==='geo'?(worldX>0?'right':'left'):tx<0?'left':'right');
      for(const track of [false,true]){
        const [ox,oy]=g.offset,a=track?0:h,scale=630/732;
        const x=565+((tx+ox)*Math.cos(a)-(ty+oy)*Math.sin(a))*scale;
        const y=260+((tx+ox)*Math.sin(a)+(ty+oy)*Math.cos(a))*scale;
        assert(x>250+16&&x<880-16&&y>25+16&&y<495-16,'main target stays in viewport');
        assert(x>232+16,'inset never covers main target');
      }
    }
  }
  assert.notDeepEqual(trials,P.plan(exp,'P01','other-session').flatMap(b=>b.trials));
}
function fixture(exp,id='P01'){
  return {experiment:exp,participant:id,trials:P.plan(exp,id).flatMap(b=>b.trials).map(t=>{
    let rt=600,estimate=null;
    if(exp==='search')rt=400+(t.layout==='mixed'?20:3)*t.n+t.salient*(t.layout==='mixed'?100:20)*(t.n===24?2:1);
    if(exp==='ratio')estimate=t.truth+(t.duration===300?(t.encoding==='position'?2:6):1);
    if(exp==='map')rt=t.display==='dual'?500:t.display==='north'?(t.task==='ego'?800:400):(t.task==='ego'?400:800);
    return {...t,mode:'formal',version:P.VERSION,rt,correct:exp==='ratio'?null:1,response:t.answer||'',timeout:0,estimate,exposure_ms:exp==='ratio'?t.duration+8:null};
  })};
}
for(const exp of P.TYPES){
  const r=fixture(exp);assert(A.complete(r,exp));
  assert(!A.complete({...r,trials:r.trials.slice(1)},exp));
  assert(!A.complete({...r,trials:r.trials.map(t=>({...t,version:'northline-1'}))},exp));
  const group=A.group(exp,[r,r,fixture(exp,'P02')]);assert.equal(group.n,2);assert.equal(group.duplicates,1);
}
const search=A.analyze('search',fixture('search').trials);
assert.equal(search.effects.find(e=>e.key==='load_search').value,120);
assert.equal(search.effects.find(e=>e.key==='load_size').value,60);
const ratio=A.analyze('ratio',fixture('ratio').trials);
assert.equal(ratio.effects.find(e=>e.key==='interaction_angle').value,4);
assert.equal(ratio.effects.find(e=>e.key==='interaction_area').value,4);
const map=A.analyze('map',fixture('map').trials);
assert.equal(map.effects.find(e=>e.key==='orientation_ego').value,400);
assert.equal(map.effects.find(e=>e.key==='orientation_geo').value,-400);
assert.equal(map.effects.find(e=>e.key==='interaction').value,800);
console.log('PASS: participant/session schedules, 60 distinct ratio answers, matched ranges/means, varied scenes, bounded runs, visible map targets and known interaction effects.');
