(function(root){
  'use strict';
  let wg=null,loadPromise=null,generation=0,started=false,latest=null,calibration=null,capture=null;
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  let assetPromise=null;
  async function load(){
    if(location.protocol==='file:'&&!root.NorthlineEyeAssets){
      if(!assetPromise)assetPromise=new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='assets/vendor/webgazer/eye-assets.js';
        script.onload=()=>root.NorthlineEyeAssets?resolve():reject(new Error('眼动模型初始化失败。'));
        script.onerror=()=>{script.remove();reject(new Error('眼动模型文件加载失败。'));};
        document.head.append(script);
      }).catch(error=>{assetPromise=null;throw error;});
      await assetPromise;
    }
    if(root.webgazer)return Promise.resolve(root.webgazer);
    if(!loadPromise){
      loadPromise=new Promise((res,rej)=>{
        const s=document.createElement('script');s.src='./assets/vendor/webgazer/webgazer.js';
        s.onload=()=>root.webgazer?res(root.webgazer):rej(new Error('未能初始化眼动库。'));
        s.onerror=()=>{s.remove();rej(new Error('未能加载本地眼动库。'));};document.head.append(s);
      }).catch(e=>{loadPromise=null;throw e;});
    }
    return loadPromise;
  }
  function onGaze(data){
    if(!data||!Number.isFinite(data.x)||!Number.isFinite(data.y)){latest=null;return;}
    const now=performance.now();
    latest={x:data.x,y:data.y,t:now};
    if(!capture||now-capture.last<90||document.hidden||!document.hasFocus())return;
    const {box,points}=capture;
    if(points.length>=150)return;
    points.push({x:(data.x-box.left)/box.width,y:(data.y-box.top)/box.height,t:Math.round(now-capture.start)});
    capture.last=now;
  }
  function release(){
    for(const e of document.querySelectorAll('#webgazerVideoFeed'))for(const t of e.srcObject?.getTracks?.()||[])t.stop();
    try{wg?.stopVideo();}catch{}
    try{wg?.end();}catch{}
    try{wg?.removeMouseEventListeners();}catch{}
  }
  async function start(){
    if(!root.isSecureContext)throw new Error('请使用Chrome或Edge打开本地HTML，或通过HTTPS访问。');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('浏览器未提供摄像头权限接口。');
    const run=++generation;
    wg=await load();
    if(run!==generation)throw new Error('已跳过眼动。');
    wg.params.faceMeshSolutionPath=new URL('assets/vendor/webgazer/mediapipe/face_mesh',document.baseURI).href;
    wg.saveDataAcrossSessions(false);
    await wg.clearData();
    wg.showVideoPreview(false).showPredictionPoints(false).setGazeListener(onGaze);
    await wg.begin();
    if(run!==generation){release();throw new Error('已跳过眼动。');}
    wg.removeMouseEventListeners();
    wg.showVideoPreview(false).showPredictionPoints(false);
    started=true;
    return true;
  }
  function stop(){
    generation++;started=false;calibration=null;latest=null;capture=null;
    release();
  }
  function ready(){return started&&wg?.isReady();}
  function train(x,y){if(ready())wg.recordScreenPosition(x,y,'click');}
  async function validateAt(x,y,signal){
    await delay(350);
    let last=-1;const d=[], deadline=performance.now()+1500;
    while(performance.now()<deadline&&!signal?.aborted){
      const p=latest;
      if(p&&p.t!==last&&performance.now()-p.t<250){last=p.t;d.push(Math.hypot(p.x-x,p.y-y));}
      await delay(70);
    }
    return d;
  }
  function finishValidation(samples){
    const counts=samples.map(x=>x.length), all=samples.flat().sort((a,b)=>a-b);
    const error=all.length?all[Math.floor(all.length/2)]:null;
    const threshold=Math.round(Math.min(200,Math.hypot(innerWidth,innerHeight)*.15));
    calibration={ok:counts.every(n=>n>=4)&&error!=null&&error<=threshold,error:error==null?null:Math.round(error),samples:all.length,threshold,w:innerWidth,h:innerHeight};
    return calibration;
  }
  function isCalibrated(){return started&&Boolean(calibration?.ok)&&Math.abs(innerWidth-calibration.w)<8&&Math.abs(innerHeight-calibration.h)<8;}
  function beginCapture(el,t0){
    if(!isCalibrated())return;
    const box=el.getBoundingClientRect();
    if(box.width>0&&box.height>0)capture={box,start:t0,last:-Infinity,points:[]};
  }
  function endCapture(){
    const c=capture;capture=null;
    if(!c)return {points:[],aoi:[],count:0,error:null};
    const aoi=[0,0,0,0];
    c.points.forEach(p=>{const inside=p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1; aoi[inside?Math.min(2,Math.floor(p.x*3)):3]++;});
    return {points:c.points,aoi,count:c.points.length,error:calibration?.error??null};
  }
  function pause(){try{wg?.pause();}catch{}}
  function resume(){if(started)Promise.resolve(wg.resume()).catch(()=>{});}
  root.NorthlineGaze={start,stop,ready,train,validateAt,finishValidation,isCalibrated,beginCapture,endCapture,pause,resume};
})(globalThis);
