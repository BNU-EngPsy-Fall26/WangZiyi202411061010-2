(function(root){
  'use strict';
  const P=root.NorthlineProtocol,A=root.NorthlineAnalysis,D=root.NorthlineDraw;
  const COLORS=['#167b83','#4a6fb1','#a86830','#8660a6'];
  const el=(tag,cls,txt)=>{
    const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;
  };
  const h=(tag,txt)=>el(tag,'',txt);
  const round=(x,d=0)=>A.fixed(x,d);
  const nfmt=(x,s,d=0)=>Number.isFinite(x)?round(x,d)+s:'—';
  const pct=x=>nfmt(Number.isFinite(x)?x*100:null,'%',1);
  const paper={
    search:['Treisman & Gelade (1980)','https://doi.org/10.1016/0010-0285(80)90005-5','联合搜索的反应时通常随图形数量增加而上升得更快。'],
    ratio:['Cleveland & McGill (1984)','https://doi.org/10.1080/01621459.1984.10478080','共同基线位置的比例估计通常比角度与面积更准确。'],
    map:['Aretz (1991)','https://doi.org/10.1177/001872089103300107','北向上与航向上采用不同参照系，本实验比较显示方式与任务要求的匹配。']
  };
  function button(label,action,style='outline compact'){
    const b=el('button','button '+style,label);b.type='button';b.onclick=action;return b;
  }
  function reference(exp,notes=[]){
    const box=el('details','experiment-reference'),[label,url,desc]=paper[exp];
    const content=el('div','reference-content');
    const a=el('a','',label);a.href=url;a.target='_blank';a.rel='noopener';
    for(const note of notes)content.append(h('p',note));
    content.append(h('p',desc),a);
    if(exp==='search'){const extra=el('a','','Theeuwes (1992)：显著干扰物');extra.href='https://doi.org/10.3758/BF03211656';extra.target='_blank';extra.rel='noopener';content.append(h('p','新增条件检验搜索难度与显著干扰代价的关系。'),extra);}
    box.append(h('summary','实验原理与出处'),content);
    return box;
  }
  function svg(tag,attrs={},txt){
    const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));
    if(txt!=null)n.textContent=txt;return n;
  }
  function legend(labels){
    const d=el('div','chart-legend');
    labels.forEach((t,i)=>{const s=el('span'),b=el('i');b.style.background=COLORS[i%COLORS.length];s.append(b,t);d.append(s);});
    return d;
  }
  function chart(title,labels,series,unit,kind='line'){
    const box=el('div','chart');box.append(h('h3',title));
    const all=series.flatMap(s=>s.y).filter(Number.isFinite);
    if(!all.length){box.append(el('p','empty','有效作答不足，暂无法绘图。'));return box;}
    const max=Math.max(1,...all),step=Math.pow(10,Math.floor(Math.log10(max/4)));
    const top=unit==='%'?100:(Math.ceil(max/(step*4))*step*4||4);
    const W=560,H=222,left=61,right=537,base=182,head=22;
    const g=svg('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':title+'（'+unit+'）'});
    const x=i=>kind==='bar'?left+(i+.5)*(right-left)/labels.length:left+28+i*(right-left-56)/Math.max(1,labels.length-1);
    const y=v=>base-v/top*(base-head);
    for(let j=0;j<=4;j++){
      const yy=y(j*top/4);g.append(svg('line',{x1:left,x2:right,y1:yy,y2:yy,stroke:'#d9e5eb'}),svg('text',{x:left-7,y:yy+4,'text-anchor':'end',fill:'#51697c','font-size':12},round(j*top/4,top<8?1:0)));
    }
    g.append(svg('text',{x:left,y:13,fill:'#51697c','font-size':11},unit));
    labels.forEach((v,i)=>g.append(svg('text',{x:x(i),y:203,'text-anchor':'middle','font-size':12,fill:'#395367'},v)));
    series.forEach((s,j)=>{
      const col=COLORS[j%COLORS.length];
      if(kind==='line'){
        for(let i=1;i<s.y.length;i++)if(Number.isFinite(s.y[i-1])&&Number.isFinite(s.y[i]))g.append(svg('line',{x1:x(i-1),y1:y(s.y[i-1]),x2:x(i),y2:y(s.y[i]),stroke:col,'stroke-width':3}));
      }
      s.y.forEach((v,i)=>{
        if(!Number.isFinite(v))return;
        const w=Math.min(32,(right-left)/labels.length/(series.length+1));
        const dot=kind==='line'?svg('circle',{cx:x(i),cy:y(v),r:5,fill:col,stroke:'#fff','stroke-width':1.5}):
          svg('rect',{x:x(i)+(j-series.length/2)*w+1,y:y(v),width:w-2,height:Math.max(1,base-y(v)),rx:2,fill:col});
        dot.append(svg('title',{},s.label+' · '+labels[i]+' · '+round(v,1)+' '+unit));g.append(dot);
      });
    });
    box.append(g,legend(series.map(s=>s.label)));return box;
  }
  function charts(exp,m){
    const grid=el('div','chart-grid'),find=k=>m.cells.find(c=>c.key===k)||{};
    if(exp==='search'){
      for(const p of ['present','absent'])grid.append(chart(p==='present'?'有目标 · 反应时':'无目标 · 反应时',['8项','24项'],Object.entries(P.SEARCH).flatMap(([k,label])=>[0,1].map(salient=>({label:label+' · '+P.SALIENCE[salient],y:P.SIZES.map(n=>find([k,salient,n,p].join('_')).rt)}))),'ms'));
    }else if(exp==='ratio'){
      for(const [k,title,unit] of [['err','不同观看时间的估计误差','百分点'],['rt','图形隐藏后的作答时间','ms']])grid.append(chart(title,Object.values(P.ENCODING),P.DURATIONS.map(duration=>({label:duration+' ms',y:Object.keys(P.ENCODING).map(e=>find(e+'_'+duration)[k])})),unit,'bar'));
    }else{
      for(const [task,label] of Object.entries(P.TASKS)){
        grid.append(chart(label+' · 反应时',['30°','120°'],Object.entries(P.MAP).map(([k,name])=>({label:name,y:P.ANGLES.map(a=>find([k,task,a].join('_')).rt)})),'ms'));
        grid.append(chart(label+' · 正确率',['30°','120°'],Object.entries(P.MAP).map(([k,name])=>({label:name,y:P.ANGLES.map(a=>{const v=find([k,task,a].join('_')).acc;return Number.isFinite(v)?v*100:null;})})),'%','bar'));
      }
    }
    return grid;
  }
  function table(headers,rows){
    const w=el('div','table-wrap'),t=el('table'),head=t.createTHead().insertRow();
    headers.forEach(s=>{const v=el('th','',s);v.scope='col';head.append(v);});
    const body=t.createTBody();
    rows.forEach(values=>{const r=body.insertRow();values.forEach(v=>r.append(el('td','',v)));});
    w.append(t);return w;
  }
  function stats(items){
    const d=el('div','stat-grid');items.forEach(([val,name])=>{const b=el('div','stat');b.append(h('strong',val),h('span',name));d.append(b);});return d;
  }
  function conditionTable(exp,metrics,group){
    const headers=exp==='ratio'?['条件','试次','实际呈现均值','有效 RT '+(group?'人数':'试次'),'作答时间','绝对误差','有符号偏差','对数误差','超时']:['条件','试次','有效 RT '+(group?'人数':'试次'),'反应时','正确率','超时'];
    const rows=metrics.cells.map(c=>[c.label,c.n,...(exp==='ratio'?[nfmt(c.exposure,' ms')]:[]),c.rtN,nfmt(c.rt,' ms'),...(exp==='ratio'?[nfmt(c.err,' pp',1),nfmt(c.bias,' pp',1),round(c.logErr,2)]:[pct(c.acc)]),c.timeout]);
    return table(headers,rows);
  }
  function slopeTable(m){
    return table(['搜索条件','有目标（ms/项）','无目标（ms/项）'],Object.entries(P.SEARCH).flatMap(([k,label])=>[0,1].map(salient=>[label+' · '+P.SALIENCE[salient],...['present','absent'].map(p=>round(m.slopes.find(s=>s.layout===k&&s.salient===salient&&s.present===p).value,2))])));
  }
  function effectList(effects,group=false){
    const body=el('div','effect-list');
    const limits={};
    for(const e of effects){
      const vals=group?e.points.map(p=>p.value):[e.value];
      const maximum=Math.max(.1,...vals.filter(Number.isFinite).map(Math.abs));
      limits[e.unit]=Math.max(limits[e.unit]||0,maximum);
    }
    for(const e of effects){
      const row=el('div','dot-row');row.append(h('span',e.label));
      const pts=group?e.points:[{id:'本次',value:e.value}].filter(p=>Number.isFinite(p.value));
      const g=svg('svg',{viewBox:'0 0 360 34',role:'img','aria-label':e.label+'，有效 '+pts.length+' 人'});
      const lim=limits[e.unit]*1.12,x=v=>180+v/lim*159;
      g.append(svg('line',{x1:14,x2:346,y1:17,y2:17,stroke:'#ccdbe4'}),svg('line',{x1:180,x2:180,y1:4,y2:30,stroke:'#7899a9','stroke-dasharray':'2 2'}));
      pts.forEach((p,i)=>{const c=svg('circle',{cx:x(p.value),cy:12+(i%3)*5,r:4,fill:'#3b93a0',opacity:.8});c.append(svg('title',{},p.id+'：'+round(p.value,2)+' '+e.unit));g.append(c);});
      if(group&&Number.isFinite(e.value)){const xx=x(e.value);g.append(svg('path',{d:'M'+xx+' 8l7 9-7 9-7-9z',fill:'#a35b24'}));}
      row.append(g,h('b',nfmt(e.value,' '+e.unit,e.unit==='ms'?0:2)+(group?' · '+pts.length+' 人':'')));body.append(row);
    }
    return body;
  }
  function gazeReplay(exp,record,m){
    const box=el('section','result-content');
    box.append(h('h2','注视回放'));
    const captured=record.trials.filter(t=>t.gaze_points?.length&&t.stimulus);
    if(!captured.length){
      box.append(el('p','empty','本次未采集注视数据。'));
      return box;
    }
    const tools=el('div','eye-tools'),sel=el('select');sel.setAttribute('aria-label','选择要回看的试次');
    captured.forEach((t,i)=>{const o=el('option','',('试次 '+t.trial_no+' · '+t.cond).replaceAll('_',' / '));o.value=i;sel.append(o);});
    const label=el('label','check'),check=el('input');check.type='checkbox';check.checked=true;label.append(check,'显示注视热图');tools.append(sel,label);
    const layout=el('div','eye-layout'),canvas=el('canvas'),side=el('div'),scale=el('div','eye-scale'),note=el('p','muted');
    canvas.setAttribute('aria-label','本次刺激和注视热图');side.append(note,scale);layout.append(canvas,side);box.append(tools,layout);
    const draw=()=>{
      const t=captured[Number(sel.value)||0],points=t.gaze_points;
      D.gaze(canvas,t.stimulus,points,check.checked);scale.replaceChildren();
      const counts=t.gaze_aoi||[0,0,0,0],sum=counts.reduce((x,y)=>x+y,0);
      note.textContent='本试次 '+points.length+' 个采样点 · 校准中位误差 '+nfmt(t.gaze_calibration,' px');
      ['画面左侧','画面中央','画面右侧','画面外'].forEach((s,i)=>{
        const v=sum?counts[i]/sum:0,row=el('span'),bar=el('i'),fill=el('b');fill.style.width=(100*v)+'%';bar.append(fill);row.append(h('small',s),bar,h('small',pct(v)));scale.append(row);
      });
    };
    sel.onchange=check.onchange=draw;draw();
    box.append(el('p','muted','热图为摄像头估计位置。区域占比按采样点计算；回放仅保存在本次页面。'));
    return box;
  }
  function personal(exp,record){
    const panel=el('section','result-content');
    if(!record){panel.append(h('h2','本次还没有结果'),el('p','empty','完成实验后显示本次结果。'));return [panel];}
    const m=A.analyze(exp,record.trials);
    panel.append(h('h2',P.INFO[exp].title+' · 正式结果'),stats([
      [String(m.n),'记录试次'],[nfmt(m.rt,' ms'),exp==='ratio'?'隐藏后作答时间中位数':'有效反应时中位数'],[exp==='ratio'?nfmt(m.err,' pp',1):pct(m.acc),exp==='ratio'?'平均绝对误差':'正确率']
    ]));
    panel.append(el('p','research-question',P.INFO[exp].question),charts(exp,m));
    if(exp==='search')panel.append(h('h3','搜索斜率'),slopeTable(m));
    panel.append(h('h3','条件明细'),conditionTable(exp,m,false),h('h3','本次条件差'),effectList(m.effects),reference(exp));
    return [panel,gazeReplay(exp,record,m)];
  }
  function group(exp,records){
    const m=A.group(exp,records),panel=el('section','result-content');panel.append(h('h2',P.INFO[exp].title+' · 正式汇总'));
    if(!m.n){panel.append(el('p','empty','尚无符合设计的正式记录。读取课程数据或导入 CSV / JSON 后展示。'));return panel;}
    const sampled=m.people.filter(p=>p.metrics.eye.sampled>0).length;
    panel.append(stats([[String(m.n),'有效被试'],[String(m.n*P.INFO[exp].total),'完整正式试次'],[String(sampled),'含有效眼动的被试']]));
    panel.append(el('p','muted','每名被试先算条件指标，再计算组平均。橙色菱形为配对效应均值，小点为个人。'+(m.n<5?' 当前尚未达到 5 名有效被试。':'')+(m.dropped||m.duplicates?' 排除 '+m.dropped+' 条无效记录、'+m.duplicates+' 条重复记录。':'')));
    panel.append(el('p','research-question',P.INFO[exp].question),charts(exp,m));
    if(exp==='search')panel.append(h('h3','搜索斜率'),slopeTable(m));
    panel.append(h('h3','条件明细'),conditionTable(exp,m,true),h('h3','配对效应'),effectList(m.effects,true),reference(exp));
    return panel;
  }
  function figure(t,label,reveal=false){
    const f=el('figure'),c=el('canvas');c.setAttribute('aria-label',label);f.append(c,h('figcaption',label));D.scene(c,t,reveal);return f;
  }
  function range(label,min,max,step,value){
    const l=el('label','',label),i=el('input'),o=el('output');
    i.type='range';i.min=min;i.max=max;i.step=step;i.value=value;i.setAttribute('aria-label',label);l.append(i,o);return {l,i,o};
  }
  function concept(exp,container){
    container.replaceChildren();
    const controls=el('div','concept-controls'),grid=el('div','concept-grid');
    container.append(h('h2',P.INFO[exp].question));
    let notes=[];
    if(exp==='map'){
      const s=range('无人机航向',-150,150,5,120),select=el('select');select.setAttribute('aria-label','地图任务');
      for(const [key,name] of Object.entries(P.TASKS)){const o=el('option','',name);o.value=key;select.append(o);}
      controls.append(s.l,select);container.append(controls,grid);
      const update=()=>{
        const heading=Number(s.i.value),task=select.value;s.o.value=heading+'°';grid.replaceChildren();
        for(const [key,name] of Object.entries(P.MAP)){
          const t=P.map(key,Math.abs(heading),0,74025,heading,'right',task);
          const answer=task==='geo'?(t.answer==='left'?'西侧':'东侧'):(t.answer==='left'?'左侧':'右侧');
          grid.append(figure(t,name+' · '+answer));
        }
      };
      s.i.oninput=select.onchange=update;update();
      container.append(el('p','concept-key','青色箭头：无人机　金色圆点：目的地　N：北方'));
      notes=['经典条件：北向上与航向上。新增条件：两类参照任务与双地图。','预测：航向上更适合左右判断，北向上更适合东西判断；双地图能否兼顾两类任务，由实验检验。'];
    }else if(exp==='search'){
      grid.classList.add('search-grid');
      const select=el('select');select.setAttribute('aria-label','图形数量');
      for(const n of P.SIZES){const o=el('option','',n+'项');o.value=n;select.append(o);}
      const check=el('input'),label=el('label','check');check.type='checkbox';label.append(check,'加入醒目干扰物');
      controls.append(h('strong','图形数量'),select,label);container.append(controls,grid);
      const update=()=>{grid.replaceChildren();for(const [key,name] of Object.entries(P.SEARCH))grid.append(figure(P.search(key,Number(select.value),1,0,910275,Number(check.checked)),name,true));};
      select.onchange=check.onchange=update;update();
      container.append(el('p','concept-key','目标：红色圆环　醒目干扰物：黄色圆环　金色外圈：演示中的目标标记'));
      notes=['经典条件：特征搜索与联合搜索，分别呈现8或24个图形。新增条件：把一个蓝色圆环改为醒目的黄色，保留它的位置与形状。','预测：联合搜索、图形较多时，有无醒目干扰物的反应时差更大。'];
    }else{
      const slider=range('B/A',12,92,1,53),select=el('select');select.setAttribute('aria-label','观看时间');
      for(const duration of P.DURATIONS){const o=el('option','',duration+' ms');o.value=duration;select.append(o);}
      let timer;
      const update=()=>{
        clearTimeout(timer);slider.o.value=slider.i.value+'%';grid.replaceChildren();
        for(const [key,name] of Object.entries(P.ENCODING))grid.append(figure(P.ratio(key,Number(select.value),Number(slider.i.value),0,82613),name));
      };
      const run=button('按所选时间呈现',()=>{update();timer=setTimeout(()=>{if(container.isConnected&&!container.closest('[hidden]'))for(const canvas of grid.querySelectorAll('canvas'))D.mask(canvas);},Number(select.value));});
      controls.append(slider.l,select,run);container.append(controls,grid);slider.i.oninput=select.onchange=update;update();
      container.append(el('p','concept-key','调整比例后，点击按钮体验图形隐藏。正式实验在图形隐藏后开放输入。'));
      notes=['经典条件：共同基线位置、扇形角度、圆形面积。新增条件：300与1500毫秒两种呈现时间。','预测：短时观看增加估计误差；角度、面积的误差增量大于共同基线。主要检验编码与观看时间的交互作用。'];
    }
    container.append(reference(exp,notes));
  }
  root.NorthlineReport={personal,group,concept,figure,button};
})(globalThis);
