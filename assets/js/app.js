(function(){
  'use strict';
  const P=NorthlineProtocol,D=NorthlineDraw,A=NorthlineAnalysis,Data=NorthlineData,G=NorthlineGaze,R=NorthlineReport,C=NorthlineConfig;
  const $=id=>document.getElementById(id);
  const ui={
    nav:document.querySelector('header nav'),home:$('homeView'),concept:$('conceptView'),results:$('resultsView'),camera:$('cameraView'),task:$('taskView')
  };
  const captureCanvas=$('stimulus'),setup=$('setupDialog'),leave=$('leaveDialog'),personal=new Map(),groupByExp=new Map();
  let view='home',setupExperiments=null,session=null,task=null,camAbort=null,trialInterrupt=null;
  let conceptExp='map',resultExp='search',resultSource='personal',navigationLock=false;
  let serial=0;
  const nextFrame=cb=>requestAnimationFrame(cb);
  function abortError(){return new DOMException('Task stopped','AbortError');}
  function delay(ms,signal){
    if(signal?.aborted)return Promise.reject(abortError());
    return new Promise((resolve,reject)=>{
      const onAbort=()=>{clearTimeout(t);reject(abortError());};
      const t=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},ms);
      signal?.addEventListener('abort',onAbort,{once:true});
    });
  }
  function show(name){
    for(const k of ['home','concept','results','camera','task'])ui[k].hidden=k!==name;
    view=name;document.body.classList.toggle('task-running',name==='camera'||name==='task');
    for(const n of ui.nav.querySelectorAll('button[data-view]')){
      if(n.dataset.view===name)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');
    }
    window.scrollTo({top:0,behavior:'instant'});
    if(name==='concept')renderConcept();
    if(name==='results')renderResults();
  }
  function terminate(){
    camAbort?.abort();
    task?.controller.abort();
    G.stop();task=null;session=null;
  }
  async function navigate(name){
    if((view==='task'||view==='camera')&&session){
      if(navigationLock)return;
      navigationLock=true;trialInterrupt?.();
      leave.returnValue='keep';
      const choice=new Promise(resolve=>leave.addEventListener('close',()=>resolve(leave.returnValue),{once:true}));
      leave.showModal();
      const action=await choice;
      navigationLock=false;
      if(action!=='leave')return;
      terminate();
    }
    show(name);
  }
  for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>navigate(b.dataset.view);
  $('quitTask').onclick=()=>navigate('home');
  window.addEventListener('pagehide',()=>{camAbort?.abort();task?.controller.abort();G.stop();});
  function tabButtons(holder,active,onChange){
    holder.replaceChildren();
    for(const exp of P.TYPES){
      const b=document.createElement('button');b.type='button';b.textContent=P.INFO[exp].title;b.dataset.exp=exp;
      b.setAttribute('aria-pressed',String(exp===active));b.onclick=()=>onChange(exp);holder.append(b);
    }
  }
  function renderConcept(){
    tabButtons($('conceptTabs'),conceptExp,e=>{conceptExp=e;renderConcept();});
    R.concept(conceptExp,$('conceptContent'));
  }
  function setSource(s){
    resultSource=s;
    for(const b of document.querySelectorAll('[data-source]'))b.setAttribute('aria-pressed',String(b.dataset.source===s));
  }
  for(const b of document.querySelectorAll('[data-source]'))b.onclick=()=>{setSource(b.dataset.source);renderResults();};
  function renderResults(){
    const out=$('resultContent'),exp=resultExp;
    tabButtons($('resultTabs'),exp,e=>{resultExp=e;$('dataStatus').textContent='';renderResults();});
    $('resultTools').hidden=resultSource!=='group';
    if(resultSource==='group'){
      out.replaceChildren(R.group(exp,groupByExp.get(exp)||[]));
      return;
    }
    const record=personal.get(exp),panels=R.personal(exp,record);
    out.replaceChildren(...panels);
    const p=panels[0],actions=document.createElement('div');actions.className='actions';
    if(record){
      const status=document.createElement('p');
      status.className='upload-note'+(record.upload==='failed'?' bad':'');
      status.textContent=record.uploadMessage;
      p.insertBefore(status,p.children[1]||null);
      if(record.upload==='failed')actions.append(R.button('重新上传',()=>sendRecord(record)));
      actions.append(R.button('下载 CSV',()=>Data.save([record],'csv')),R.button('下载 JSON',()=>Data.save([record],'json')));
    }
    if(session?.between){
      const last=session.index>=session.experiments.length-1;
      actions.append(R.button(last?'完成实验':'继续下一项',()=>{
        if(!session?.between)return;
        if(last){terminate();show('home');}
        else{session.between=false;session.index++;enterExperiment();}
      },'primary'));
      if(session.index>0){
        const done=[...personal.values()].filter(r=>r.meta.session===session.serial);
        if(done.length>1)actions.append(R.button('下载全部结果',()=>Data.save(done,'json')));
      }
    }else if(!record)actions.append(R.button('开始本项',()=>openSetup([exp]),'primary'));
    if(actions.childElementCount)p.append(actions);
  }
  $('loadCourse').onclick=async()=>{
    const b=$('loadCourse'),exp=resultExp;b.disabled=true;$('dataStatus').textContent='正在读取 '+P.INFO[exp].title+' 数据…';
    try{
      const records=await Data.remote(exp);groupByExp.set(exp,records);
      const n=A.group(exp,records).n;$('dataStatus').textContent=P.INFO[exp].title+'：'+n+' 名有效被试';renderResults();
    }catch(e){$('dataStatus').textContent=e.message||'读取失败。';}
    finally{b.disabled=false;}
  };
  $('importData').onchange=async ev=>{
    const file=ev.target.files[0];if(!file)return;
    try{
      const records=await Data.importFile(file);
      // Server and exported pseudonyms may differ; keep one source per experiment.
      for(const exp of P.TYPES){
        const rows=records.filter(r=>r.experiment===exp);
        if(rows.length)groupByExp.set(exp,rows);
      }
      const n=P.TYPES.map(exp=>A.group(exp,records).n);
      $('dataStatus').textContent='已导入 · 搜索 '+n[0]+' 人 / 比例 '+n[1]+' 人 / 地图 '+n[2]+' 人';
      setSource('group');renderResults();
    }catch(e){$('dataStatus').textContent='导入失败：'+e.message;}
    finally{ev.target.value='';}
  };
  const cardSamples={
    search:P.search('mixed',24,1,0,287522),
    ratio:P.ratio('area',300,58,0,391812),
    map:P.map('dual',30,0,76220,30,'right')
  };
  for(const exp of P.TYPES){
    const i=P.INFO[exp],a=document.createElement('article');a.className='module';
    const v=document.createElement('div');v.className='module-visual';
    const c=document.createElement('canvas');c.setAttribute('aria-label',i.title+'示意图');
    const no=document.createElement('span');no.className='module-number';no.textContent=i.index+' / '+i.week;v.append(c,no);
    const content=document.createElement('div');content.className='module-body';
    for(const [tag,cls,t] of [['h3','',i.title],['p','classic',i.classic],['p','desc',i.desc],['p','research-question',i.question]]){
      const node=document.createElement(tag);node.className=cls;node.textContent=t;content.append(node);
    }
    const foot=document.createElement('div');foot.className='module-foot';const ref=document.createElement('small');ref.textContent=i.ref;
    foot.append(ref,R.button('开始本项',()=>openSetup([exp])));content.append(foot);
    a.append(v,content);$('missionCards').append(a);D.scene(c,cardSamples[exp]);
  }
  $('formalStart').onclick=()=>openSetup();
  $('closeSetup').onclick=$('cancelSetup').onclick=()=>setup.close();
  function cameraAvailable(){return window.isSecureContext&&Boolean(navigator.mediaDevices?.getUserMedia);}
  function openSetup(experiments=null){
    setupExperiments=experiments;
    $('setupForm').reset();$('setupMessage').textContent='';
    $('setupTitle').textContent='开始实验';
    $('setupScope').textContent=experiments?P.INFO[experiments[0]].title+' · '+P.INFO[experiments[0]].total+'个正式试次':
      '完成三项实验，共340个正式试次，可分段休息。';
    $('participant').required=true;$('participant').pattern='[Pp][0-9]{2,4}';
    $('consentDetail').textContent='本实验记录匿名编号、作答、反应时与正确性，用于课程作业分析。'+
      (Data.configured()?'每项完成后上传至项目，支持下载备份。':'完成后请下载CSV或JSON保存结果。')+
      '选择眼动时，摄像头视频在本机处理，上传区域计数和校准质量。';
    const available=cameraAvailable();
    $('eyeConsent').disabled=!available;
    $('cameraHelp').textContent=available?'可选择仅用键盘作答。':'眼动请使用Chrome或Edge打开本地HTML，或通过HTTPS访问。';
    $('startSession').disabled=false;
    setup.showModal();
  }
  $('setupForm').onsubmit=e=>{
    e.preventDefault();
    if(!$('consent').checked)return;
    const pid=$('participant').value.trim().toUpperCase();
    if(!/^P\d{2,4}$/.test(pid)||Number(pid.slice(1))===0){
      $('setupMessage').textContent='请输入分配的匿名编号（如P01）。';return;
    }
    const camera=$('eyeConsent').checked&&!$('eyeConsent').disabled;
    terminate();session={pid,experiments:setupExperiments||P.experimentOrder(pid),index:0,
      between:false,serial:Date.now()+'-'+(++serial),camera};
    setup.close();
    if(camera){show('camera');calibrate();}else enterExperiment();
  };
  $('cameraSkip').onclick=()=>{camAbort?.abort();G.stop();if(session)enterExperiment();};
  $('cameraRetry').onclick=()=>calibrate();
  $('cameraGo').onclick=()=>{camAbort?.abort();G.pause();if(session)enterExperiment();};
  const calPositions=[.18,.5,.82].flatMap(y=>[.17,.5,.83].map(x=>[x,y]));
  const validationPositions=[[.33,.32],[.67,.32],[.34,.68],[.66,.68]];
  async function calibrate(){
    if(!session||view!=='camera')return;
    camAbort?.abort();G.stop();camAbort=new AbortController();const signal=camAbort.signal;
    const point=$('calPoint'),note=$('cameraStatus'),go=$('cameraGo'),retry=$('cameraRetry');
    go.hidden=retry.hidden=point.hidden=true;point.classList.remove('validating');point.disabled=false;
    note.textContent='正在加载本地模型。浏览器询问时，请允许摄像头。';
    const place=(x,y)=>{point.style.left=(100*x)+'%';point.style.top=(100*y)+'%';point.hidden=false;};
    const center=()=>{const r=point.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];};
    try{
      await G.start();
      if(signal.aborted)return;
      const deadline=performance.now()+10000;
      while(!G.ready()&&performance.now()<deadline)await delay(150,signal);
      if(!G.ready())throw new Error('摄像头未准备好。');
      G.resume();
      for(let j=0;j<calPositions.length;j++){
        place(...calPositions[j]);
        note.textContent='校准 '+(j+1)+'/9 · 注视圆点，慢慢点击 5 次。';
        for(let k=0;k<5;k++){
          await delay(k===0?420:140,signal);
          await new Promise((resolve,reject)=>{
            const onAbort=()=>{point.removeEventListener('click',onClick);reject(abortError());};
            const onClick=()=>{signal.removeEventListener('abort',onAbort);resolve();};
            point.addEventListener('click',onClick,{once:true});signal.addEventListener('abort',onAbort,{once:true});
          });
          G.train(...center());
          note.textContent='校准 '+(j+1)+'/9 · 本点已点击 '+(k+1)+'/5。';
        }
      }
      point.disabled=true;point.classList.add('validating');
      const values=[];
      for(let j=0;j<validationPositions.length;j++){
        place(...validationPositions[j]);
        note.textContent='验证 '+(j+1)+'/4 · 请注视金色圆点，无需点击。';
        values.push(await G.validateAt(...center(),signal));
        if(signal.aborted)return;
      }
      const q=G.finishValidation(values);point.hidden=true;retry.hidden=false;
      note.textContent=q.ok?'校准通过 · 中位误差 '+q.error+' px · '+q.samples+' 个验证样本':
        '校准未通过'+(q.error==null?'（未获得足够注视样本）':' · 中位误差 '+q.error+' px，门槛 '+q.threshold+' px')+'。可以重新校准或跳过眼动。';
      go.hidden=!q.ok;G.pause();
    }catch(e){
      if(signal.aborted)return;
      point.hidden=true;retry.hidden=false;G.stop();
      note.textContent='摄像头暂不可用：'+(e.message||'初始化失败')+'。可跳过眼动继续。';
    }
  }
  const instructions={
    search:['找到红色圆环','每屏可能有红色圆环，也可能没有。黄色图形是干扰物，目标始终是红色圆环。','有目标按 F；没有目标按 J。先看中央十字，再判断。'],
    ratio:['估计 B/A','A 表示较大的值。图形呈现300或1500毫秒后隐藏，再估计B的数值是A的百分之几。柱图比较高度，饼图比较角度，圆图比较面积。','图形隐藏后，输入0–100的整数，再按Enter。'],
    map:['判断目的地在左侧还是右侧','青色箭头表示无人机航向，金色圆点表示目的地。','以无人机航向为准：左侧按 ←，右侧按 →。']
  };
  function intro(label,title,paragraphs,button,action,samples=[]){
    $('taskIntro').hidden=false;$('taskRun').hidden=true;
    $('introLabel').textContent=label;$('introTitle').textContent=title;
    $('introText').replaceChildren(...paragraphs.map(t=>{const p=document.createElement('p');p.textContent=t;return p;}));
    $('introSamples').replaceChildren(...samples);
    $('introNext').textContent=button;$('introNext').disabled=false;$('introNext').onclick=action;
    G.pause();
  }
  function enterExperiment(){
    if(!session)return;
    const exp=session.experiments[session.index],info=P.INFO[exp];
    task={exp,info,blocks:P.plan(exp,session.pid,session.serial),block:0,records:[],controller:new AbortController(),running:false};
    task.total=task.blocks.reduce((n,b)=>n+b.trials.length,0);
    show('task');$('taskTitle').textContent=info.title;
    $('taskEyebrow').textContent='实验 '+(session.index+1)+' / '+session.experiments.length+' · '+info.week+' · 正式实验';
    prepareBlock(true);
  }
  function instructionFor(exp,mapTask='ego'){
    if(exp!=='map')return instructions[exp];
    return mapTask==='geo'?['判断目的地在东侧还是西侧','青色箭头是无人机，金色圆点是目的地。根据N指针判断目的地相对无人机的地理方向。','西侧按 ←；东侧按 →。']:
      ['判断目的地在左侧还是右侧','青色箭头是无人机，金色圆点是目的地。以无人机机头方向为参照。','机头左侧按 ←；机头右侧按 →。'];
  }
  function prepareBlock(first=false){
    const t=task,b=t.blocks[t.block],[title,desc,keys]=instructionFor(t.exp,b.task);
    const examples=t.exp==='search'?[R.figure(b.practice[0],'例：出现目标',true),R.figure(b.practice[1],'例：醒目干扰物',true)]:
      t.exp==='ratio'?['position','angle','area'].map((k,i)=>R.figure(P.ratio(k,1500,[28,57,81][i],i,692+i),P.ENCODING[k],true)):
      b.practice.map(p=>R.figure(p,'例：'+(b.task==='geo'?(p.answer==='left'?'西侧':'东侧'):(p.answer==='left'?'左侧':'右侧')),true));
    const practice=b.practice.length>0;
    intro('阶段 '+(t.block+1)+' / '+t.blocks.length+' · '+b.label,first?title:b.label,
      [desc,keys,practice?'先练习 '+b.practice.length+' 次，再做 '+b.trials.length+' 次计分试次。':'休息后继续完成 '+b.trials.length+' 次计分试次。'],
      practice?'开始练习':'开始计分',()=>runPhase(practice),practice?examples:[]);
  }
  function buttonsFor(exp,mapTask='ego'){
    $('ratioForm').hidden=exp!=='ratio';$('responseButtons').hidden=exp==='ratio';$('responseButtons').replaceChildren();
    if(exp==='ratio')return;
    const specs=exp==='search'?[['发现目标','F','yes'],['没有目标','J','no']]:mapTask==='geo'?[['西侧','←','left'],['东侧','→','right']]:[['左侧','←','left'],['右侧','→','right']];
    for(const [label,key,value] of specs){
      const b=document.createElement('button');b.type='button';b.className='button outline';b.dataset.response=value;
      const k=document.createElement('kbd');k.textContent=key;b.append(label,k);$('responseButtons').append(b);
    }
  }
  function controls(on){
    for(const b of $('responseButtons').querySelectorAll('button'))b.disabled=!on;
    $('ratioAnswer').disabled=!on;$('ratioForm').querySelector('button').disabled=!on;
  }
  function collect(trial,signal){
    return new Promise((resolve,reject)=>{
      let ready=false,finished=false,t0=0,timer,frame,exposureFrame,exposureMs=null,gazeAtOffset=null;
      const keys=P.INFO[trial.exp].keys,limit=P.INFO[trial.exp].limit,buttons=[...$('responseButtons').querySelectorAll('button')];
      const clean=()=>{
        clearTimeout(timer);cancelAnimationFrame(frame);cancelAnimationFrame(exposureFrame);trialInterrupt=null;
        window.removeEventListener('keydown',onKey,true);
        window.removeEventListener('blur',interrupt);
        window.removeEventListener('resize',interrupt);
        document.removeEventListener('visibilitychange',visible);
        signal.removeEventListener('abort',abort);
        $('ratioForm').onsubmit=null;buttons.forEach(b=>b.onclick=null);
        controls(false);
      };
      const done=(kind,value=null,via='none')=>{
        if(finished)return;
        finished=true;
        const rt=kind==='response'?performance.now()-t0:null;
        const gaze=gazeAtOffset||G.endCapture();clean();
        if(kind==='abort'){reject(abortError());return;}
        if(rt!=null&&rt>limit){resolve({kind:'timeout',value:null,rt:null,via:'none',gaze,exposureMs});return;}
        resolve({kind,value,rt:rt==null?null:Math.round(rt),via,gaze,exposureMs});
      };
      const interrupt=()=>done('interrupted');
      const visible=()=>{if(document.hidden)interrupt();};
      const abort=()=>done('abort');
      function readRatio(){
        const a=$('ratioAnswer').value.trim();
        return /^(?:\d{1,2}|100)$/.test(a)?Number(a):null;
      }
      function response(val,via){
        if(!ready||val==null||document.hidden||leave.open)return;
        done('response',val,via);
      }
      function onKey(e){
        if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||!ready)return;
        if(trial.exp==='ratio'&&(e.code==='Enter'||e.code==='NumpadEnter')){
          e.preventDefault();response(readRatio(),'keyboard');
        }else if(keys[e.code]){
          e.preventDefault();response(keys[e.code],'keyboard');
        }
      }
      if(signal.aborted){reject(abortError());return;}
      window.addEventListener('keydown',onKey,true);
      window.addEventListener('blur',interrupt);
      window.addEventListener('resize',interrupt);
      document.addEventListener('visibilitychange',visible);
      signal.addEventListener('abort',abort,{once:true});
      trialInterrupt=interrupt;
      $('ratioForm').onsubmit=e=>{e.preventDefault();response(readRatio(),'pointer');};
      buttons.forEach(b=>b.onclick=()=>response(b.dataset.response,'pointer'));
      frame=nextFrame(()=>{
        if(document.hidden||leave.open){interrupt();return;}
        D.scene(captureCanvas,trial);
        const onset=performance.now();G.beginCapture(captureCanvas,onset);
        const enable=()=>{
          t0=performance.now();ready=true;controls(true);
          if(trial.exp==='ratio'&&matchMedia('(pointer:fine)').matches)$('ratioAnswer').focus({preventScroll:true});
          timer=setTimeout(()=>done('timeout'),limit);
        };
        if(trial.exp!=='ratio'){enable();return;}
        $('trialStatus').textContent='观看图形';
        const hide=()=>{
          if(finished)return;
          const elapsed=performance.now()-onset;
          if(elapsed<trial.duration){exposureFrame=nextFrame(hide);return;}
          if(elapsed>trial.duration+100){done('interrupted');return;}
          exposureMs=Math.round(elapsed);gazeAtOffset=G.endCapture();
          D.mask(captureCanvas);$('trialStatus').textContent='输入估计值';enable();
        };
        exposureFrame=nextFrame(hide);
      });
    });
  }
  async function one(t,practice,signal){
    const st=$('trialStatus');
    for(;;){
      while(document.hidden||!document.hasFocus()||leave.open){
        st.textContent='已暂停 · 回到当前窗口继续';
        await delay(100,signal);
      }
      $('ratioAnswer').value='';controls(false);D.fix(captureCanvas,t.exp);
      st.textContent='准备';
      await delay(P.INFO[t.exp].fix,signal);
      if(document.hidden||!document.hasFocus()||leave.open)continue;
      st.textContent='作答';
      const r=await collect(t,signal);
      if(r.kind==='interrupted')continue;
      const timeout=Number(r.kind==='timeout');
      const isRatio=t.exp==='ratio',correct=isRatio?null:Number(!timeout&&r.value===t.answer);
      if(practice){
        if(timeout)st.textContent='已超时';
        else if(isRatio)st.textContent='真值 '+t.truth+'% · 你的估计 '+r.value+'%';
        else st.textContent=correct?'判断正确':t.exp==='search'?(t.present?'这题有红色圆环':'这题没有红色圆环'):'目的地在'+(t.task==='geo'?(t.answer==='left'?'西侧':'东侧'):(t.answer==='left'?'机头左侧':'机头右侧'));
        D.scene(captureCanvas,t,true);
        await delay(750,signal);
      }else{
        D.fix(captureCanvas,t.exp);st.textContent='已记录';
        await delay(220,signal);
      }
      const {exp,...stim}=t;
      return {...stim,cond:P.condition(t),rt:r.rt,exposure_ms:isRatio?r.exposureMs:null,correct,timeout,estimate:isRatio?r.value:null,
        response:isRatio?'':r.value||'',input:r.via,mode:'formal',version:C.protocolVersion,
        gaze_n:r.gaze.count,gaze_aoi:r.gaze.aoi,gaze_calibration:r.gaze.error,gaze_points:r.gaze.points,stimulus:t};
    }
  }
  async function runPhase(practice){
    const t=task;
    if(!t||t.running)return;
    const signal=t.controller.signal,b=t.blocks[t.block],list=practice?b.practice:b.trials;
    t.running=true;$('introNext').disabled=true;$('taskIntro').hidden=true;$('taskRun').hidden=false;
    buttonsFor(t.exp,b.task);controls(false);G.resume();
    window.scrollTo({top:0,behavior:'instant'});
    $('trialPrompt').textContent=instructionFor(t.exp,b.task)[2];$('trialBlock').textContent=b.label;
    $('trialProgress').max=practice?list.length:t.total;
    try{
      for(let i=0;i<list.length;i++){
        $('trialCount').textContent=(practice?'练习 '+(i+1)+' / '+list.length:'试次 '+(t.records.length+1)+' / '+t.total);
        $('trialProgress').value=practice?i:t.records.length;
        $('gazeIndicator').textContent=G.isCalibrated()?'● 注视采集中':session.camera?'键盘模式 · 眼动未启用':'键盘模式';
        const result=await one(list[i],practice,signal);
        if(!practice)t.records.push({...result,trial_no:t.records.length+1,block:t.block+1});
      }
      t.running=false;
      if(practice){
        intro('练习结束 · '+b.label,'进入计分试次',
          ['接下来是 '+b.trials.length+' 次计分试次。每次根据画面判断，保持又快又准。'],'开始计分',()=>runPhase(false));
      }else if(t.block+1<t.blocks.length){
        t.block++;prepareBlock();
      }else finishExperiment(t);
    }catch(e){
      t.running=false;
      if(e.name==='AbortError')return;
      console.error(e);G.pause();
      intro('实验暂停','本阶段未完成',['已完成的实验可在结果页查看。'],'返回首页',()=>{terminate();show('home');});
    }
  }
  function finishExperiment(t){
    G.pause();
    const record={id:session.serial+'-'+t.exp,experiment:t.exp,participant:session.pid,
      condition:'order_'+session.experiments.join('-'),trials:t.records,
      meta:{session:session.serial,protocol:C.protocolVersion,consent:C.consentVersion,viewport_w:innerWidth,viewport_h:innerHeight},
      upload:'local',uploadMessage:'本次实验已完成，请下载CSV或JSON保存结果。'};
    personal.set(t.exp,record);session.between=true;resultExp=t.exp;setSource('personal');
    if(session.index===session.experiments.length-1)G.stop();
    if(Data.configured()){
      record.upload='sending';record.uploadMessage='正在提交正式记录…';
    }
    show('results');
    if(Data.configured())sendRecord(record);
  }
  async function sendRecord(record){
    if(record.inFlight||record.upload==='ok')return;
    record.inFlight=true;record.upload='sending';record.uploadMessage='正在提交正式记录…';
    if(view==='results')renderResults();
    try{
      if(!A.complete(record,record.experiment))throw new Error('条件试次数不完整。');
      const reply=await Data.submit(record);
      record.upload='ok';
      record.uploadMessage='已提交至课程平台。'+(reply.warnings?.length?' 接口提示：'+reply.warnings.join('；'):'');
    }catch(e){record.upload='failed';record.uploadMessage='尚未提交：'+(e.message||'网络错误')+'。可以下载备份后重试。';}
    finally{record.inFlight=false;if(view==='results')renderResults();}
  }
  show('home');
})();
