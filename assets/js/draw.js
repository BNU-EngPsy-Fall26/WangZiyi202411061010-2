(function(root){
  'use strict';
  const P=root.NorthlineProtocol, W=P.SIZE.w,H=P.SIZE.h;
  function ctx(canvas){
    const r=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==W*r||canvas.height!==H*r){canvas.width=W*r;canvas.height=H*r;}
    const c=canvas.getContext('2d');c.setTransform(r,0,0,r,0,0);return c;
  }
  function line(c,points,color,w=1){
    c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.beginPath();
    points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();
  }
  function poly(c,pts,fill,stroke,width=1){
    c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();
    if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
  }
  function circle(c,x,y,r,fill,stroke,w=1){
    c.beginPath();c.arc(x,y,r,0,2*Math.PI);
    if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}
  }
  function text(c,t,x,y,size=22,color='#e9f4ff',bold=false,align='center'){
    c.fillStyle=color;c.font=(bold?'700 ':'500 ')+size+'px "Microsoft YaHei",system-ui,sans-serif';
    c.textAlign=align;c.textBaseline='middle';c.fillText(t,x,y);
  }
  function backdrop(c,light=false){
    c.fillStyle=light?'#f2f7fb':'#101d2a';c.fillRect(0,0,W,H);
    c.strokeStyle=light?'#dce7ef':'#1a2d3e';c.lineWidth=1;
    for(let x=0;x<=W;x+=45){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}
    for(let y=0;y<=H;y+=45){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
  }
  function fix(canvas,exp){
    const c=ctx(canvas), light=exp==='ratio';backdrop(c,light);
    const col=light?'#475e73':'#b7cbdc';
    line(c,[[438,260],[462,260]],col,2.6);line(c,[[450,248],[450,272]],col,2.6);
  }
  function search(c,t,reveal){
    backdrop(c);
    for(const p of P.searchItems(t)){
      const color=p.salient?'#ffe16a':p.red?'#ff846c':'#6faaf5';
      if(p.circle)circle(c,p.x,p.y,16,null,color,4);
      else poly(c,[[p.x,p.y-19],[p.x+19,p.y],[p.x,p.y+19],[p.x-19,p.y]],null,color,4);
      if(reveal&&p.target)circle(c,p.x,p.y,29,null,'#f3d284',2);
    }
  }
  function ratio(c,t,reveal){
    backdrop(c,true);
    const {vals,ia,ib,rot}=P.values(t);
    const color=()=> '#a5b4c2';
    const outline=()=> '#6a8094';
    function tag(i,x,y){if(i===ia||i===ib){circle(c,x,y,16,'#162b3b');text(c,i===ia?'A':'B',x,y,18,'#fff',true);}}
    if(t.encoding==='position'){
      line(c,[[61,406],[838,406]],'#60758a',2.5);
      vals.forEach((v,i)=>{const x=131+i*158,h=v*3.25;c.fillStyle=color(i);c.fillRect(x-37,406-h,74,h);c.strokeStyle=outline(i);c.lineWidth=2;c.strokeRect(x-37,406-h,74,h);tag(i,x,386-h);});
    }else if(t.encoding==='angle'){
      const sum=vals.reduce((a,b)=>a+b,0),x=450,y=255,R=190;
      let a=rot;
      vals.forEach((v,i)=>{const b=a+v/sum*Math.PI*2;c.beginPath();c.moveTo(x,y);c.arc(x,y,R,a,b);c.closePath();c.fillStyle=color(i);c.fill();c.strokeStyle='#f2f7fb';c.lineWidth=3;c.stroke();const mid=(a+b)/2;tag(i,x+Math.cos(mid)*R*.68,y+Math.sin(mid)*R*.68);a=b;});
    }else{
      vals.forEach((v,i)=>{const x=130+i*160,y=270,r=68*Math.sqrt(v/95);circle(c,x,y,r,color(i),outline(i),2);tag(i,x,y-r-24);});
    }
    if(reveal)text(c,'参考答案 '+t.truth+'%',450,475,23,'#143b49',true);
  }
  function map(c,t,reveal){
    backdrop(c);
    const h=t.heading*Math.PI/180,geometry=P.mapGeometry(t);
    function view(x,y,w,height,track,small=false){
      c.save();c.beginPath();c.roundRect(x,y,w,height,small?9:15);c.clip();c.fillStyle='#162839';c.fillRect(x,y,w,height);
      const scale=Math.min(w/732,height/470);
      c.translate(x+w/2,y+height/2);c.scale(scale,scale);c.rotate(track?0:h);c.translate(...geometry.offset);
      const random=P.rng(t.seed);
      for(let i=0;i<12;i++){const xx=(random()-.5)*650,yy=(random()-.5)*550,k=12+random()*26;poly(c,[[xx-k,yy-6],[xx-3,yy-k],[xx+k,yy-4],[xx+k/2,yy+k],[xx-k/2,yy+k/2]],i%2?'#223f50':'#263a48');}
      const [lx,ly]=geometry.lake;
      poly(c,[[lx-35,ly],[lx+16,ly-22],[lx+60,ly+28],[lx+52,ly+64],[lx+5,ly+76],[lx-41,ly+45]],'#254b5c','#3d6574',2);
      for(const points of geometry.roads)line(c,points,'#40596b',28);
      for(const points of geometry.roads)line(c,points,'#7d99aa',2);
      const [tx,ty]=geometry.target;
      circle(c,tx,ty,small?21:16,'#f0b45d','#ffe5a9',2);circle(c,tx,ty,4,'#1a2d3e');
      poly(c,[[0,-24],[17,18],[0,9],[-17,18]],'#83dce8','#d2fcff',2);
      if(reveal)circle(c,tx,ty,29,null,'#ffe5a9',2);
      c.restore();
      const north=track?-h:0,cx=x+w-(small?24:58),cy=y+(small?24:53),r=small?17:28;
      c.save();c.translate(cx,cy);c.rotate(north);circle(c,0,0,r,'#0c1c29','#476574');poly(c,[[0,-r*.72],[r*.22,r*.18],[0,r*.08],[-r*.22,r*.18]],'#ecf9ff');c.restore();
      text(c,'N',cx+Math.sin(north)*(r+11),cy-Math.cos(north)*(r+11),small?12:17,'#e5f4ff',true);
    }
    view(250,25,630,470,t.display==='track');
    // Main map retains identical dimensions. Every display has the same inset frame.
    c.fillStyle='#0c1c29';c.fillRect(18,36,214,151);c.strokeStyle='#476574';c.lineWidth=1;c.strokeRect(18,36,214,151);
    if(t.display==='dual'){view(22,40,206,143,true,true);text(c,'航向视图',82,174,13,'#e5f4ff');}
  }
  function mask(canvas){
    const c=ctx(canvas);backdrop(c,true);
    text(c,'请输入估计值',450,260,28,'#27485b');
  }
  function scene(canvas,t,reveal=false){
    const c=ctx(canvas);
    if(t.exp==='search')search(c,t,reveal);
    else if(t.exp==='ratio')ratio(c,t,reveal);
    else map(c,t,reveal);
  }
  function gaze(canvas,t,points,show=true){
    scene(canvas,t);
    if(!show||!points.length)return;
    const c=ctx(canvas);
    c.save();
    for(const q of points){
      if(q.x<0||q.x>1||q.y<0||q.y>1)continue;
      const x=q.x*W,y=q.y*H,r=41,g=c.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(255,178,65,.25)');g.addColorStop(.4,'rgba(255,104,53,.16)');g.addColorStop(1,'rgba(255,104,53,0)');
      c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
    }
    for(const q of points.filter((_,i)=>i%4===0))if(q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1)circle(c,q.x*W,q.y*H,4,'#fff1ae','#bd621b',1);
    c.restore();
  }
  root.NorthlineDraw={scene,fix,mask,gaze};
})(globalThis);
