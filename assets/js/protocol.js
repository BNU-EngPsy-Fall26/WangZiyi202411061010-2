(function(root){
  'use strict';
  const VERSION='northline-3',SIZE={w:900,h:520},TYPES=['search','ratio','map'];
  const SEARCH={feature:'特征搜索',mixed:'联合搜索'};
  const SALIENCE={0:'无醒目干扰',1:'有醒目干扰'};
  const ENCODING={position:'共同基线',angle:'扇形角度',area:'圆形面积'};
  const DURATIONS=[300,1500];
  const MAP={north:'北向上',track:'航向上',dual:'北向上＋航向小地图'};
  const TASKS={ego:'左右判断',geo:'东西判断'},ANGLES=[30,120],SIZES=[8,24];
  const RATIOS=Array.from({length:70},(_,i)=>15+i);
  const ORDERS=[[0,1,2],[1,2,0],[2,0,1],[2,1,0],[0,2,1],[1,0,2]];
  const INFO={
    search:{id:'search',index:'01',week:'W6',title:'视觉搜索',classic:'特征搜索与联合搜索',question:'搜索难度如何影响醒目干扰物的干扰代价？',desc:'寻找红色圆环，比较两种搜索中的醒目干扰代价。',ref:'Treisman & Gelade · Theeuwes',total:160,limit:4500,fix:350,keys:{KeyF:'yes',KeyJ:'no'}},
    ratio:{id:'ratio',index:'02',week:'W7',title:'比例估计',classic:'Cleveland–McGill 比例判断',question:'短暂观看会改变不同编码的准确性优势吗？',desc:'观看300或1500毫秒后，估计B的数值占A的百分比。',ref:'Cleveland & McGill · 1984',total:60,limit:12000,fix:350,keys:{}},
    map:{id:'map',index:'03',week:'W8',title:'地图定向',classic:'北向上与航向上地图定向',question:'地图参照系与任务参照系怎样匹配？',desc:'分别判断左右、东西，比较三种地图显示。',ref:'Aretz · 1991',total:120,limit:5000,fix:350,keys:{ArrowLeft:'left',ArrowRight:'right'}}
  };
  function hash(s){let v=2166136261;for(const ch of String(s))v=Math.imul(v^ch.charCodeAt(0),16777619);return v>>>0;}
  function rng(seed){let x=seed>>>0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
  function shuffle(values,random){const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function sequence(values,random,rules){
    for(let attempt=0;attempt<100;attempt++){
      const pool=shuffle(values,random),out=[];
      while(pool.length){
        const index=pool.findIndex(t=>Object.entries(rules).every(([key,max])=>out.length<max||!out.slice(-max).every(v=>v[key]===t[key])));
        if(index<0)break;
        out.push(pool.splice(index,1)[0]);
      }
      if(!pool.length)return out;
    }
    throw new Error('无法生成平衡的题目顺序，请重新开始。');
  }
  function ratioTruth(cell,rep,seed){
    const offsets=shuffle([-3,-2,-1,1,2,3],rng(hash(seed+'/ratio-bands')));
    return 18+rep*7+offsets[(cell+rep%5)%6]*(rep>=5?-1:1);
  }
  function balanced(values,id,offset=0){const n=Number(String(id).replace(/^P/i,''))||1;return ORDERS[((n-1+offset)%6+6)%6].map(i=>values[i]);}
  function condition(t){
    if(t.exp==='search')return [t.layout,t.salient,t.n,t.present?'present':'absent'].join('_');
    if(t.exp==='ratio')return t.encoding+'_'+t.duration;
    return [t.display,t.task,t.angle].join('_');
  }
  function search(layout,n,present,rep,seed,salient=0){return {exp:'search',layout,n,present,rep,seed,salient,answer:present?'yes':'no'};}
  function ratio(encoding,duration,truth,rep,seed){return {exp:'ratio',encoding,duration,truth,rep,seed};}
  function map(display,angle,rep,seed,heading=null,side=null,task='ego'){
    const signed=heading??(rep%2===0?angle:-angle),ego_side=side??(rep%10<5?'left':'right');
    const trial={exp:'map',display,task,angle,heading:signed,rep,seed,ego_side};
    return {...trial,answer:mapAnswer(trial)};
  }
  function mapGeometry(t){
    const random=rng(hash(t.seed+'/route')),tilt=(random()-.5)*Math.PI/5,side=t.ego_side==='left'?-1:1;
    const distance=110+random()*60,reach=235+random()*55;
    const target=[side*distance,Math.sin(tilt)*distance],junction=random()<.5?'cross':'fork';
    const left=[-reach,Math.sin(tilt)*reach],right=[reach,Math.sin(tilt)*reach];
    const bend=(random()-.5)*150;
    return {target,roads:[[[0,290],[bend,180],[0,105],[0,0]],[left,[0,0],right],...(junction==='cross'?[[[0,0],[35*(random()-.5),-150],[60*(random()-.5),-290]]]:[])],
      offset:[(random()-.5)*48,(random()-.5)*24],lake:[-235-random()*60,-70-random()*45],junction};
  }
  function mapAnswer(t){const [x,y]=mapGeometry(t).target,h=t.heading*Math.PI/180,east=x*Math.cos(h)-y*Math.sin(h)>0;return t.task==='geo'?(east?'right':'left'):t.ego_side;}
  function plan(exp,id,variant=''){
    const repeats=10,s=hash(id+'/'+exp+'/'+VERSION+'/'+variant),blocks=[],person=Number(String(id).slice(1))||0;
    if(exp==='search'){
      const layouts=person%2?['feature','mixed']:['mixed','feature'];
      for(const layout of layouts){
        const all=[];
        for(const salient of [0,1])for(const n of SIZES)for(const present of [0,1])for(let rep=0;rep<repeats;rep++){
          const rr=rep;
          all.push(search(layout,n,present,rr,hash([s,layout,salient,n,present,rr].join('/')),salient));
        }
        blocks.push({label:SEARCH[layout],trials:sequence(all,rng(hash(s+layout)),{answer:3}),practice:[search(layout,8,1,0,hash(s+'p1'+layout)),search(layout,24,0,1,hash(s+'p2'+layout),1)]});
      }
    }else if(exp==='ratio'){
      const all=[],practice=[],practiceTruth=Array.from({length:6},(_,i)=>18+i*13+Math.floor(rng(hash(s+'/practice-values/'+i))()*9));
      for(const [encodingIndex,encoding] of Object.keys(ENCODING).entries())for(const [durationIndex,duration] of DURATIONS.entries()){
        const cell=encodingIndex*2+durationIndex;
        for(let rep=0;rep<repeats;rep++){
          const rr=rep;
          all.push(ratio(encoding,duration,ratioTruth(cell,rr,s),rr,hash([s,encoding,duration,rr].join('/'))));
        }
        practice.push(ratio(encoding,duration,practiceTruth[cell],cell,hash([s,'practice',encoding,duration].join('/'))));
      }
      const randomized=sequence(all,rng(s),{encoding:2,duration:3}),half=randomized.length/2;
      blocks.push({label:'比例估计 · 第一阶段',trials:randomized.slice(0,half),practice:sequence(practice,rng(s^31),{encoding:1,duration:2})});
      blocks.push({label:'比例估计 · 第二阶段',trials:randomized.slice(half),practice:[]});
    }else if(exp==='map'){
      let order=0;
      for(const display of balanced(Object.keys(MAP),id,3)){
        const tasks=(person+order++)%2?['ego','geo']:['geo','ego'];
        for(const task of tasks){
          const all=[];
          for(const angle of ANGLES)for(let rep=0;rep<repeats;rep++){
            const rr=rep;
            all.push(map(display,angle,rr,hash([s,display,task,angle,rr].join('/')),null,null,task));
          }
          blocks.push({label:MAP[display]+' · '+TASKS[task],task,trials:sequence(all,rng(hash(s+display+task)),{answer:3,angle:3}),practice:[map(display,30,0,hash(s+'p30'+display+task),null,null,task),map(display,120,7,hash(s+'p120'+display+task),null,task==='geo'?'left':null,task)]});
        }
      }
    }
    return blocks;
  }
  function searchItems(t){
    const random=rng(t.seed),points=[];
    const columns=Math.floor(t.rep/2)%2?8:6,rows=24/columns;
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)points.push({x:100+col*700/(columns-1)+(random()-.5)*32,y:90+row*330/(rows-1)+(random()-.5)*32,half:col<columns/2?0:1});
    const halves=[0,1].map(k=>shuffle(points.filter(p=>p.half===k),random).slice(0,t.n/2));
    const target=halves[t.rep%2][0],slots=halves.flat();
    const reds=[target,...shuffle(slots.filter(p=>p!==target),random).slice(0,t.n/2-1)];
    const items=slots.map((p,i)=>{const isTarget=Boolean(t.present&&p===target);return {...p,target:isTarget,red:isTarget||(t.layout==='mixed'&&reds.includes(p)),circle:isTarget||(t.layout==='feature'?i%2===0:!reds.includes(p)),salient:false};});
    // Replace one blue distractor's color; keep its position/shape and every red item unchanged.
    const candidates=items.filter(p=>!p.red&&!p.target&&p.circle),desiredHalf=Math.floor(t.rep/2)%2;
    const candidatesSide=candidates.filter(p=>p.half===desiredHalf);
    const pool=candidatesSide.length?candidatesSide:candidates;
    if(t.salient&&pool.length)pool[Math.floor(random()*pool.length)].salient=true;
    return items;
  }
  function values(t){const r=rng(t.seed),a=70+r()*22,b=a*t.truth/100,vals=Array.from({length:5},()=>26+r()*62);const [ia,ib]=shuffle([0,1,2,3,4],r);vals[ia]=a;vals[ib]=b;return {vals,ia,ib,rot:r()*Math.PI*2};}
  function experimentOrder(id){return balanced(TYPES,id);}
  const api={VERSION,SIZE,TYPES,INFO,SEARCH,SALIENCE,ENCODING,DURATIONS,MAP,TASKS,ANGLES,SIZES,RATIOS,hash,rng,shuffle,sequence,ratioTruth,mapGeometry,condition,plan,search,ratio,map,mapAnswer,searchItems,values,experimentOrder};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.NorthlineProtocol=api;
})(globalThis);
