'use strict';
// Package the original MediaPipe files as script data for file:// use.
const fs=require('node:fs'),path=require('node:path');
const directory=path.resolve(__dirname,'../assets/vendor/webgazer/mediapipe/face_mesh');
const names=fs.readdirSync(directory).filter(name=>/\.(?:js|wasm|data|binarypb)$/.test(name));
const encoded=Object.fromEntries(names.map(name=>[name,fs.readFileSync(path.join(directory,name)).toString('base64')]));
const runtime=`(function(root){
  'use strict';
  const embedded=MODEL_DATA,urls=new Map();
  function url(name){
    const key=String(name).split('/').pop().split('?')[0];
    if(!(key in embedded))return null;
    if(!urls.has(key)){
      const raw=atob(embedded[key]),bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const type=key.endsWith('.wasm')?'application/wasm':key.endsWith('.js')?'text/javascript':'application/octet-stream';
      urls.set(key,URL.createObjectURL(new Blob([bytes],{type})));
    }
    return urls.get(key);
  }
  root.NorthlineEyeAssets=Object.freeze({url});
  root.addEventListener('pagehide',()=>{for(const value of urls.values())URL.revokeObjectURL(value);urls.clear();});
})(globalThis);
`;
const output=path.resolve(__dirname,'../assets/vendor/webgazer/eye-assets.js');
fs.writeFileSync(output,'// MediaPipe assets from WebGazer 3.5.3; see SOURCE.md and license files.\n'+runtime.replace('MODEL_DATA',JSON.stringify(encoded)));
console.log(JSON.stringify({files:names.length,bytes:fs.statSync(output).size}));
