(function(root){
  'use strict';
  const C=root.NorthlineConfig;
  const config=()=>String(C.projectCode||'').trim().toUpperCase();
  const configured=()=>/^[A-Z0-9]{6}$/.test(config())&&!['ABC234','000000'].includes(config());
  function cleanTrials(trials){
    return trials.map(({gaze_points,stimulus,...t})=>t);
  }
  function payload(record){
    return {project:config(),experiment:record.experiment,participant:record.participant,
      condition:record.condition,trials:cleanTrials(record.trials),meta:record.meta};
  }
  async function request(url,opts){
    const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),14000);
    try{
      const res=await fetch(url,{...opts,signal:ctl.signal});
      let data;
      try{data=await res.json();}catch{throw new Error('服务器返回了无法读取的内容（'+res.status+'）。');}
      if(!res.ok||data.ok===false)throw new Error(data.msg||('请求失败（'+res.status+'）。'));
      return data;
    }finally{clearTimeout(tm);}
  }
  async function submit(record){
    if(!configured())throw new Error('请先设置课程项目码。');
    if(record.trials.some(t=>t.mode!=='formal'))throw new Error('上传记录须为正式实验数据。');
    const json=JSON.stringify(payload(record));
    if(new TextEncoder().encode(json).length>250000)throw new Error('提交内容超出收数接口大小。请先保存本地备份。');
    const result=await request(C.labOrigin+'/api/hw2/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:json});
    if(result.ok!==true)throw new Error('未收到服务器确认。');
    return result;
  }
  async function remote(exp){
    if(!configured())throw new Error('请先设置课程项目码，或导入数据文件。');
    const url=new URL('/api/hw2/data',C.labOrigin);
    url.searchParams.set('project',config());url.searchParams.set('experiment',exp);
    const result=await request(url);
    return normalize(result,exp);
  }
  function quote(v){
    const s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function download(name,text,type){
    const u=URL.createObjectURL(new Blob([text],{type}));
    const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  function save(records,format){
    const clean=records.map(r=>({...r,trials:cleanTrials(r.trials)}));
    const name='attention-formal-'+new Date().toISOString().slice(0,10);
    if(format==='json'){download(name+'.json',JSON.stringify({records:clean},null,2),'application/json');return;}
    const rows=clean.flatMap(r=>r.trials.map((t,i)=>({record_id:r.id,experiment:r.experiment,participant:r.participant,condition:r.condition,trial_index:i+1,...t})));
    const fields=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
    download(name+'.csv','\ufeff'+fields.map(quote).join(',')+'\r\n'+rows.map(r=>fields.map(k=>quote(r[k])).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }
  function parseCsv(s){
    const rows=[];let row=[],val='',q=false;
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(c==='"'){if(q&&s[i+1]==='"'){val+='"';i++;}else q=!q;}
      else if(c===','&&!q){row.push(val);val='';}
      else if(c==='\n'&&!q){row.push(val.replace(/\r$/,''));rows.push(row);row=[];val='';}
      else val+=c;
    }
    if(q)throw new Error('CSV 有未闭合的引号。');
    if(row.length||val){row.push(val.replace(/\r$/,''));rows.push(row);}
    const header=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim());
    if(!['experiment','participant'].every(k=>header.includes(k)))throw new Error('CSV 缺少 experiment 或 participant 列。');
    const by=new Map();
    for(const a of rows){
      if(a.length===1&&!a[0])continue;
      const row=Object.fromEntries(header.map((k,i)=>[k,a[i]??'']));
      const {record_id,created_at,experiment,participant,condition,trial_index,...trial}=row;
      const key=JSON.stringify([experiment,participant,record_id||'local']);
      if(!by.has(key))by.set(key,{id:record_id,experiment,participant,condition,created_at,trials:[]});
      by.get(key).trials.push(trial);
    }
    return normalize(Array.from(by.values()));
  }
  const numbers=['n','present','rep','seed','salient','duration','exposure_ms','truth','estimate','angle','heading','rt','correct','timeout','gaze_n','gaze_calibration','trial_no','block'];
  function decode(t){
    const out={};
    for(const [key,v] of Object.entries(t||{})){
      const k=key.startsWith('trial.')?key.slice(6):key;
      if(numbers.includes(k)){
        const n=v===''||v==null?null:Number(v);out[k]=Number.isFinite(n)?n:null;
      }else if(k==='gaze_aoi'){
        if(Array.isArray(v))out[k]=v;
        else if(typeof v==='string'&&v.startsWith('[')){try{out[k]=JSON.parse(v);}catch{}}
      }else if(['cond','layout','encoding','display','task','ego_side','answer','response','mode','version'].includes(k))out[k]=String(v??'');
    }
    return out;
  }
  function normalize(raw,exp){
    const input=Array.isArray(raw)?raw:raw.records||raw.data?.records;
    if(!Array.isArray(input))throw new Error('JSON 中缺少 records 数据。');
    return input.filter(r=>r&&Array.isArray(r.trials)).map(r=>({
      id:String(r.record_id||r.id||''),experiment:String(r.experiment||exp||''),participant:String(r.participant||'').slice(0,32),
      condition:String(r.condition||''),trials:r.trials.map(decode)
    }));
  }
  async function importFile(file){
    if(file.size>20*1024*1024)throw new Error('数据文件过大，请按实验分别导入。');
    const s=(await file.text()).replace(/^\uFEFF/,'');
    return /\.csv$/i.test(file.name)?parseCsv(s):normalize(JSON.parse(s));
  }
  root.NorthlineData={configured,config,submit,remote,save,importFile,parseCsv,normalize,payload};
})(globalThis);
