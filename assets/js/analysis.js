(function(root){
  'use strict';
  const P=root.NorthlineProtocol||(typeof require==='function'?require('./protocol.js'):null);
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  function median(a){
    const b=a.filter(Number.isFinite).sort((x,y)=>x-y),i=Math.floor(b.length/2);
    return b.length?b.length%2?b[i]:(b[i-1]+b[i])/2:null;
  }
  const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
  const fixed=(x,d=0)=>Number.isFinite(x)?x.toFixed(d):'—';
  function rows(exp){
    if(exp==='search')return Object.entries(P.SEARCH).flatMap(([layout,label])=>[0,1].flatMap(salient=>P.SIZES.flatMap(n=>[0,1].map(present=>({layout,salient,n,present,label:[label,P.SALIENCE[salient],n+'项',present?'有目标':'无目标'].join(' · ')})))));
    if(exp==='ratio')return Object.entries(P.ENCODING).flatMap(([encoding,label])=>P.DURATIONS.map(duration=>({encoding,duration,label:label+' · '+duration+' ms'})));
    return Object.entries(P.MAP).flatMap(([display,label])=>Object.entries(P.TASKS).flatMap(([task,name])=>P.ANGLES.map(angle=>({display,task,angle,label:[label,name,angle+'°'].join(' · ')}))));
  }
  function trialValid(exp,t){
    if(!t||typeof t!=='object'||t.version!==P.VERSION)return false;
    if(t.rt!=null&&(!Number.isFinite(t.rt)||t.rt<0||t.rt>P.INFO[exp].limit+50))return false;
    if(t.timeout!==0&&t.timeout!==1)return false;
    if(t.timeout&&t.rt!==null)return false;
    if(!t.timeout&&t.rt==null)return false;
    if(exp==='search'){
      if(!(t.layout in P.SEARCH)||![0,1].includes(t.salient)||!P.SIZES.includes(t.n)||![0,1].includes(t.present))return false;
      if(t.timeout)return t.correct===0;
      return ['yes','no'].includes(t.response)&&t.correct===Number(t.response===(t.present?'yes':'no'));
    }
    if(exp==='map'){
      if(!(t.display in P.MAP)||!(t.task in P.TASKS)||!P.ANGLES.includes(t.angle)||Math.abs(t.heading)!==t.angle||!['left','right'].includes(t.ego_side)||t.answer!==P.mapAnswer(t))return false;
      if(t.timeout)return t.correct===0;
      return ['left','right'].includes(t.response)&&t.correct===Number(t.response===t.answer);
    }
    return t.encoding in P.ENCODING&&P.DURATIONS.includes(t.duration)&&P.RATIOS.includes(t.truth)&&
      Number.isFinite(t.exposure_ms)&&t.exposure_ms>=t.duration-1&&t.exposure_ms<=t.duration+100&&
      (t.timeout?t.estimate===null:Number.isInteger(t.estimate)&&t.estimate>=0&&t.estimate<=100);
  }
  function measure(exp,trials){
    const clean=trials.filter(t=>Number.isFinite(t.rt)&&t.rt>=150&&t.rt<=P.INFO[exp].limit&&
      (exp==='ratio'?Number.isFinite(t.estimate):t.correct===1));
    const estimate=trials.filter(t=>!t.timeout&&Number.isFinite(t.estimate)&&t.estimate>=0&&t.estimate<=100);
    const errors=estimate.map(t=>Math.abs(t.estimate-t.truth));
    return {exposure:exp==='ratio'?mean(trials.map(t=>t.exposure_ms).filter(Number.isFinite)):null,n:trials.length,rtN:clean.length,rt:median(clean.map(t=>t.rt)),
      acc:exp==='ratio'||!trials.length?null:trials.filter(t=>t.correct===1).length/trials.length,
      err:exp==='ratio'?mean(errors):null,logErr:exp==='ratio'?mean(errors.map(x=>Math.log2(x+.125))):null,
      bias:exp==='ratio'?mean(estimate.map(t=>t.estimate-t.truth)):null,
      timeout:trials.filter(t=>t.timeout===1).length};
  }
  function analyze(exp,trials){
    const cells=rows(exp).map(def=>{
      const key=P.condition({exp,...def});
      return {...def,key,...measure(exp,trials.filter(t=>P.condition({exp,...t})===key))};
    });
    const at=(...a)=>cells.find(c=>c.key===a.join('_'))||{};
    const effects=[];
    const e=(key,label,value,unit='ms')=>effects.push({key,label,value,unit});
    let slopes=[];
    const avgDiff=(pairs)=>{const v=pairs.map(([x,y])=>diff(x,y));return v.every(Number.isFinite)?mean(v):null;};
    if(exp==='search'){
      slopes=Object.entries(P.SEARCH).flatMap(([layout,label])=>[0,1].flatMap(salient=>['absent','present'].map(p=>{
        const value=diff(at(layout,salient,24,p).rt,at(layout,salient,8,p).rt);
        return {layout,salient,label:label+' · '+P.SALIENCE[salient],present:p,value:value==null?null:value/16};
      })));
      const slope=(layout,p)=>slopes.find(s=>s.layout===layout&&s.salient===0&&s.present===p).value;
      for(const p of ['present','absent'])e('classic_'+p,'无醒目干扰：联合 − 特征的斜率 · '+(p==='present'?'有目标':'无目标'),diff(slope('mixed',p),slope('feature',p)),'ms/项');
      const costs={};
      for(const layout of Object.keys(P.SEARCH))for(const n of P.SIZES){
        const key=layout+'_'+n;
        costs[key]=avgDiff(['present','absent'].map(p=>[at(layout,1,n,p).rt,at(layout,0,n,p).rt]));
        e('cost_'+key,P.SEARCH[layout]+' · '+n+'项：有干扰 − 无干扰',costs[key]);
      }
      const complexity=avgDiff(P.SIZES.map(n=>[costs['mixed_'+n],costs['feature_'+n]]));
      const size=avgDiff(Object.keys(P.SEARCH).map(k=>[costs[k+'_24'],costs[k+'_8']]));
      e('load_search','干扰代价：联合搜索 − 特征搜索',complexity);
      e('load_size','干扰代价：24项 − 8项',size);
    }else if(exp==='ratio'){
      e('classic_angle','1500 ms：角度误差 − 基线误差',diff(at('angle',1500).err,at('position',1500).err),'百分点');
      e('classic_area','1500 ms：面积误差 − 基线误差',diff(at('area',1500).err,at('position',1500).err),'百分点');
      const costs={};
      for(const [encoding,label] of Object.entries(P.ENCODING)){
        costs[encoding]=diff(at(encoding,300).err,at(encoding,1500).err);
        e('duration_'+encoding,label+'：300 − 1500 ms的误差',costs[encoding],'百分点');
      }
      e('interaction_angle','短时误差增量：角度 − 共同基线',diff(costs.angle,costs.position),'百分点');
      e('interaction_area','短时误差增量：面积 − 共同基线',diff(costs.area,costs.position),'百分点');
    }else{
      const advantage={};
      for(const [task,label] of Object.entries(P.TASKS)){
        advantage[task]=avgDiff(P.ANGLES.map(a=>[at('north',task,a).rt,at('track',task,a).rt]));
        e('orientation_'+task,label+'：北向上 − 航向上',advantage[task]);
        const preferred=task==='ego'?'track':'north',mismatched=task==='ego'?'north':'track';
        e('dual_gain_'+task,label+'：'+P.MAP[mismatched]+' − 双地图',avgDiff(P.ANGLES.map(a=>[at(mismatched,task,a).rt,at('dual',task,a).rt])));
        e('dual_'+task,label+'：'+P.MAP[preferred]+' − 双地图',avgDiff(P.ANGLES.map(a=>[at(preferred,task,a).rt,at('dual',task,a).rt])));
      }
      e('interaction','地图朝向效应：左右任务 − 东西任务',diff(advantage.ego,advantage.geo));
    }
    const eye=trials.reduce((a,t)=>{
      const v=t.gaze_aoi;
      if(Array.isArray(v)&&v.length===4&&v.every(x=>Number.isFinite(x)&&x>=0)){
        v.forEach((x,i)=>a.aoi[i]+=x);
        if(v.some(x=>x>0))a.sampled++;
      }
      return a;
    },{aoi:[0,0,0,0],sampled:0});
    return {exp,cells,slopes,effects,eye,...measure(exp,trials)};
  }
  function complete(r,exp){
    if(r.experiment!==exp||!r.participant||!Array.isArray(r.trials)||r.trials.length!==P.INFO[exp].total)return false;
    const counts={};
    for(const t of r.trials){
      if(t.mode!=='formal'||!trialValid(exp,t))return false;
      const k=P.condition({exp,...t});counts[k]=(counts[k]||0)+1;
    }
    return rows(exp).every(def=>counts[P.condition({exp,...def})]===10);
  }
  function group(exp,records){
    const seen=new Set(), people=[];
    let dropped=0,duplicates=0;
    for(const r of records){
      if(r.experiment!==exp)continue;
      if(!complete(r,exp)){dropped++;continue;}
      if(seen.has(r.participant)){duplicates++;continue;}
      seen.add(r.participant);people.push({id:r.participant,metrics:analyze(exp,r.trials)});
    }
    const empty=analyze(exp,[]);
    const avg=a=>mean(a.filter(Number.isFinite));
    const cells=empty.cells.map((c,i)=>{
      const cs=people.map(p=>p.metrics.cells[i]);
      return {...c,exposure:avg(cs.map(x=>x.exposure)),rt:avg(cs.map(x=>x.rt)),rtN:cs.filter(x=>Number.isFinite(x.rt)).length,
        n:cs.reduce((a,x)=>a+x.n,0),acc:avg(cs.map(x=>x.acc)),err:avg(cs.map(x=>x.err)),
        logErr:avg(cs.map(x=>x.logErr)),bias:avg(cs.map(x=>x.bias)),timeout:cs.reduce((a,x)=>a+x.timeout,0)};
    });
    const effects=empty.effects.map((e,i)=>{
      const points=people.map(p=>({id:p.id,value:p.metrics.effects[i].value})).filter(x=>Number.isFinite(x.value));
      return {...e,value:avg(points.map(x=>x.value)),points};
    });
    const slopes=empty.slopes.map((s,i)=>({...s,value:avg(people.map(p=>p.metrics.slopes[i].value))}));
    return {exp,people,cells,effects,slopes,dropped,duplicates,n:people.length};
  }
  const api={median,mean,measure,analyze,group,complete,fixed,rows};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.NorthlineAnalysis=api;
})(globalThis);
