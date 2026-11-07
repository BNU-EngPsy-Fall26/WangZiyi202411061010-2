'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const directory=path.resolve(__dirname,'../assets/vendor/webgazer'),listeners={};
const sandbox={URL,Blob,atob,addEventListener:(name,fn)=>{listeners[name]=fn;}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(directory,'eye-assets.js'),'utf8'),sandbox);
(async()=>{
  const models=path.join(directory,'mediapipe/face_mesh'),names=fs.readdirSync(models).filter(name=>/\.(?:js|wasm|data|binarypb)$/.test(name));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  for(const name of names){
    const url=sandbox.NorthlineEyeAssets.url(name);assert(url.startsWith('blob:'));assert.equal(url,sandbox.NorthlineEyeAssets.url(name));
    const response=await fetch(url),bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),hash(fs.readFileSync(path.join(models,name))));
    if(name.endsWith('.wasm'))assert.equal(response.headers.get('Content-Type'),'application/wasm');
  }
  assert.equal(sandbox.NorthlineEyeAssets.url('unknown.bin'),null);
  const previous=sandbox.NorthlineEyeAssets.url(names[0]);listeners.pagehide();
  assert.notEqual(sandbox.NorthlineEyeAssets.url(names[0]),previous);listeners.pagehide();
  console.log('PASS: all '+names.length+' embedded model files match original bytes, Blob MIME types, URL reuse and cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
