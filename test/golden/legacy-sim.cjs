// 自己検証後の v2(公開版 version 1791338308-a078)から抜き出した、変更前のシミュレーション。
// 新実装との一致を確かめる「基準」。このファイルは編集しないこと。
'use strict';
const C={
  PZ:12, SCROLL:0.55, XB:9.5, YMAX:8,
  ACC:0.05, VMAX:0.45,
  THRUST:0.03, GRAV:0.018, VYMAX:0.42, JUMP:0.42,
  DASH_F:11, DASH_V:0.95, LAG_F:12,
  HP:100, INV:60,
  A_CD:5,  A_SPD:2.0, A_LIFE:80,  A_DMG:1, A_HOME:0.10,
  B_CD:28, B_SPD:1.3, B_LIFE:110, B_DMG:5, B_HOME:0.18, B_MAX:12, B_REGEN:80,
  LOCK_Z:120, LOCK_CONE:0.45,
  SPAWN_Z:140,
  MUZ:[1.2,2.4,4.4]
};
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);

/* ============================================================
   シミュレーション層(描画に依存しない。後でRust+WASMへ移す対象)
   ============================================================ */
function rnd(s){
  s.seed=(s.seed+0x6D2B79F5)|0;
  let t=s.seed;
  t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return((t^(t>>>14))>>>0)/4294967296;
}
function newState(seed){
  return{
    seed:seed|0,t:0,scroll:0,dist:0,score:0,kills:0,nextId:1,over:false,overT:0,
    p:{x:0,y:0,vx:0,vy:0,hp:C.HP,inv:0,dash:0,dx:0,dy:0,lag:0,cdA:0,cdB:0,ammoB:C.B_MAX,regen:0,lock:0,yaw:0,prevJump:false,prevD:false},
    en:[],bl:[],eb:[],sc:[],fx:[],
    spawnT:50,scT:10,heavyT:1000,shake:0
  };
}
function findEn(s,id){for(const e of s.en){if(e.id===id&&e.hp>0)return e;}return null;}

function explode(s,x,y,z,n,col,big){
  for(let i=0;i<n;i++){
    const a=rnd(s)*6.2832,b=(rnd(s)-0.5)*2.4;
    const sp=0.15+rnd(s)*(big?0.7:0.4);
    s.fx.push({k:'s',x,y,z,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp*0.8+(rnd(s)-0.3)*0.15,vz:b*sp*0.6,life:22+Math.floor(rnd(s)*16),max:38,c:col});
  }
  s.fx.push({k:'r',x,y,z,r:0.4,life:16,max:16,c:col,big:big?1:0});
  while(s.fx.length>420)s.fx.shift();
}
function updateFx(s){
  for(let i=s.fx.length-1;i>=0;i--){
    const f=s.fx[i];
    if(f.k==='s'){f.x+=f.vx;f.y+=f.vy;f.z+=f.vz;f.vx*=0.96;f.vy=f.vy*0.96-0.004;f.vz*=0.96;}
    else{f.r+=f.big?0.55:0.35;}
    if(--f.life<=0)s.fx.splice(i,1);
  }
}
function hurt(s,n){
  const p=s.p;
  if(p.inv>0||s.over)return;
  p.hp-=n;p.inv=C.INV;s.shake=14;
  if(p.hp<=0){
    p.hp=0;s.over=true;
    explode(s,p.x,p.y+2,C.PZ,40,0,true);
    explode(s,p.x,p.y+2,C.PZ,20,4,true);
  }
}
function eFire(s,e,spd){
  const p=s.p;
  let dx=p.x-e.x,dy=p.y+2-e.y,dz=C.PZ-e.z;
  const l=Math.hypot(dx,dy,dz)||1;
  s.eb.push({x:e.x,y:e.y,z:e.z-1.5,vx:dx/l*spd,vy:dy/l*spd,vz:dz/l*spd,life:260});
}
function fire(s,kind,i){
  const p=s.p;
  const cyw=Math.cos(p.yaw),syw=Math.sin(p.yaw);
  const mx=p.x+C.MUZ[0]*cyw+C.MUZ[2]*syw,my=p.y+C.MUZ[1],mz=C.PZ-C.MUZ[0]*syw+C.MUZ[2]*cyw;
  let vx=0,vy=0,vz=1;
  if(p.lock){const e=findEn(s,p.lock);if(e){vx=e.x-mx;vy=e.y-my;vz=e.z-mz;}}
  let l=Math.hypot(vx,vy,vz)||1;vx/=l;vy/=l;vz/=l;
  let spd,life,dmg,home;
  if(kind==='A'){
    spd=C.A_SPD;life=C.A_LIFE;dmg=C.A_DMG;home=C.A_HOME;
    vx+=(rnd(s)-0.5)*0.03;vy+=(rnd(s)-0.5)*0.03;
  }else{
    spd=C.B_SPD;life=C.B_LIFE;dmg=C.B_DMG;home=C.B_HOME;
    vx+=(i-1)*0.32;vy+=0.12;
  }
  l=Math.hypot(vx,vy,vz)||1;vx/=l;vy/=l;vz/=l;
  s.bl.push({k:kind,x:mx,y:my,z:mz,vx:vx*spd,vy:vy*spd,vz:vz*spd,spd,life,dmg,home,tgt:p.lock});
}
function killEnemy(s,e,byPlayer){
  e.hp=0;
  if(byPlayer){s.score+=e.score;s.kills++;}
  explode(s,e.x,e.y,e.z,e.type==='heavy'?36:16,e.col,e.type==='heavy');
}
function spawnEnemy(s){
  const heavyAlive=s.en.some(e=>e.type==='heavy'&&e.hp>0);
  const id=s.nextId++;
  if(s.heavyT<=0&&!heavyAlive&&s.t>600){
    s.heavyT=1500;
    s.en.push({id,type:'heavy',x:0,y:3.2,z:C.SPAWN_Z,hp:14,r:3.0,ph:rnd(s)*6,fireT:60,burst:0,flash:0,score:800,col:3});
    return;
  }
  const r=rnd(s);
  if(r<0.62){
    const bx=(rnd(s)-0.5)*14,by=1.5+rnd(s)*5.5;
    s.en.push({id,type:'dart',x:bx,bx,y:by,by,z:C.SPAWN_Z,hp:2,r:1.6,ph:rnd(s)*6,fireT:20+Math.floor(rnd(s)*50),flash:0,score:100,col:1});
  }else{
    s.en.push({id,type:'turret',x:(rnd(s)-0.5)*22,y:0.9,z:C.SPAWN_Z,hp:3,r:1.7,ph:0,fireT:40+Math.floor(rnd(s)*60),flash:0,score:150,col:2});
  }
}

function step(s,inp){
  s.t++;
  if(s.over){s.overT++;updateFx(s);if(s.shake>0)s.shake--;return;}
  const p=s.p;
  s.scroll=(s.scroll+C.SCROLL)%4;
  s.dist+=C.SCROLL;
  if(s.shake>0)s.shake--;
  if(p.inv>0)p.inv--;
  if(p.cdA>0)p.cdA--;
  if(p.cdB>0)p.cdB--;

  /* ---- 入力解釈(ハリアー型:2本のスティックの合算で移動) ---- */
  const mx=clamp(inp.lx+inp.rx,-1,1),my=clamp(inp.ly+inp.ry,-1,1);
  const jumpIn=!!inp.jump||(inp.lx<-0.6&&inp.rx>0.6);
  const dAny=!!(inp.dL||inp.dR);
  const dashPress=dAny&&!p.prevD;
  p.prevD=dAny;

  if(dashPress&&p.dash===0&&p.lag===0){
    let dx=mx,dy=my;
    if(Math.abs(dx)+Math.abs(dy)<0.3){dx=inp.dL?-1:1;dy=0;}
    const l=Math.hypot(dx,dy)||1;
    p.dx=dx/l;p.dy=dy/l;p.dash=C.DASH_F;
  }

  /* ---- 移動 ---- */
  if(p.dash>0){
    p.x+=p.dx*C.DASH_V;p.y+=p.dy*0.45;p.vy=0;p.vx=p.dx*C.DASH_V*0.5;
    p.dash--;if(p.dash===0)p.lag=C.LAG_F;
  }else if(p.lag>0){
    p.lag--;p.vx*=0.7;p.x+=p.vx;
    p.vy=clamp(p.vy-C.GRAV,-0.5,C.VYMAX);p.y+=p.vy;
  }else{
    p.vx+=clamp(mx*C.VMAX-p.vx,-C.ACC,C.ACC);p.x+=p.vx;
    p.vy+=(my>0?my*C.THRUST:my*0.008)-C.GRAV;
    if(jumpIn&&!p.prevJump&&p.y<0.3)p.vy=C.JUMP;
    p.vy=clamp(p.vy,-0.5,C.VYMAX);p.y+=p.vy;
  }
  p.prevJump=jumpIn;
  if(p.y<=0){p.y=0;if(p.vy<0)p.vy=0;}
  if(p.y>C.YMAX){p.y=C.YMAX;if(p.vy>0)p.vy=0;}
  p.x=clamp(p.x,-C.XB,C.XB);

  /* ---- ロックオン ---- */
  let best=0,bs=1e9,bestE=null;
  const ax=p.x,ay=p.y+2;
  for(const e of s.en){
    if(e.hp<=0)continue;
    const dz=e.z-C.PZ;
    if(dz<6||dz>C.LOCK_Z)continue;
    const ang=Math.hypot(e.x-ax,e.y-ay)/dz;
    if(ang>C.LOCK_CONE)continue;
    const sc=ang*100+dz*0.3;
    if(sc<bs){bs=sc;best=e.id;bestE=e;}
  }
  p.lock=best;
  const wantYaw=bestE?clamp(Math.atan2(bestE.x-p.x,bestE.z-C.PZ)*0.6,-0.5,0.5):0;
  p.yaw+=(wantYaw-p.yaw)*0.12;

  /* ---- 射撃 ---- */
  if(inp.tA&&p.cdA===0){p.cdA=C.A_CD;fire(s,'A',0);}
  if(inp.tB&&p.cdB===0&&p.ammoB>0){
    p.cdB=C.B_CD;
    const n=Math.min(3,p.ammoB);
    for(let i=0;i<n;i++)fire(s,'B',i);
    p.ammoB-=n;
  }
  if(p.ammoB<C.B_MAX){if(++p.regen>=C.B_REGEN){p.regen=0;p.ammoB++;}}else p.regen=0;

  /* ---- スポーン ---- */
  s.heavyT--;
  if(--s.spawnT<=0){
    s.spawnT=Math.max(26,72-Math.floor(s.t/45))+Math.floor(rnd(s)*30);
    spawnEnemy(s);
  }
  if(--s.scT<=0){
    s.scT=16+Math.floor(rnd(s)*26);
    const inLane=rnd(s)<0.4;
    const x=inLane?(rnd(s)-0.5)*22:(rnd(s)<0.5?-1:1)*(12+rnd(s)*16);
    const pil=rnd(s)<0.55;
    s.sc.push(pil?{t:'pil',x,z:C.SPAWN_Z+10,h:5,r:0.9}:{t:'pyr',x,z:C.SPAWN_Z+10,h:2,r:1.6});
  }

  /* ---- 敵 ---- */
  for(const e of s.en){
    if(e.hp<=0)continue;
    if(e.flash>0)e.flash--;
    if(e.type==='dart'){
      e.z-=0.5;
      e.x=e.bx+Math.sin(s.t*0.04+e.ph)*2.5;
      e.y=e.by+Math.sin(s.t*0.07+e.ph)*0.8;
      if(--e.fireT<=0&&e.z>35&&e.z<110){eFire(s,e,0.8);e.fireT=99999;}
    }else if(e.type==='turret'){
      e.z-=C.SCROLL;
      if(--e.fireT<=0&&e.z>30&&e.z<100){eFire(s,e,0.85);e.fireT=110;}
    }else{
      if(e.z>55)e.z-=0.35;
      else e.x=Math.sin(s.t*0.02+e.ph)*7;
      if(--e.fireT<=0){e.burst=3;e.fireT=130;}
      if(e.burst>0&&s.t%8===0){eFire(s,e,0.9);e.burst--;}
    }
    const dx=e.x-p.x,dy=e.y-(p.y+2),dz=e.z-C.PZ;
    if(e.type!=='heavy'&&Math.hypot(dx,dy,dz)<e.r+1.3){killEnemy(s,e,false);hurt(s,18);}
  }

  /* ---- プレイヤー弾 ---- */
  for(let i=s.bl.length-1;i>=0;i--){
    const b=s.bl[i];
    if(b.tgt){
      const e=findEn(s,b.tgt);
      if(e){
        let dx=e.x-b.x,dy=e.y-b.y,dz=e.z-b.z;
        const l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;
        let vx=b.vx/b.spd,vy=b.vy/b.spd,vz=b.vz/b.spd;
        vx+=(dx-vx)*b.home;vy+=(dy-vy)*b.home;vz+=(dz-vz)*b.home;
        const m=Math.hypot(vx,vy,vz)||1;
        b.vx=vx/m*b.spd;b.vy=vy/m*b.spd;b.vz=vz/m*b.spd;
      }else b.tgt=0;
    }
    b.x+=b.vx;b.y+=b.vy;b.z+=b.vz;b.life--;
    let dead=b.life<=0||b.z>200||b.y<-1;
    if(!dead){
      for(const e of s.en){
        if(e.hp<=0)continue;
        const dx=e.x-b.x,dy=e.y-b.y,dz=e.z-b.z,rr=e.r+0.5;
        if(dx*dx+dy*dy+dz*dz<rr*rr){
          e.hp-=b.dmg;e.flash=4;
          explode(s,b.x,b.y,b.z,b.k==='B'?8:3,4,false);
          if(e.hp<=0)killEnemy(s,e,true);
          dead=true;break;
        }
      }
    }
    if(dead)s.bl.splice(i,1);
  }
  for(let i=s.en.length-1;i>=0;i--){
    const e=s.en[i];
    if(e.hp<=0||e.z<1.5)s.en.splice(i,1);
  }

  /* ---- 敵弾 ---- */
  for(let i=s.eb.length-1;i>=0;i--){
    const b=s.eb[i];
    b.x+=b.vx;b.y+=b.vy;b.z+=b.vz;b.life--;
    const dx=b.x-p.x,dy=b.y-(p.y+2),dz=b.z-C.PZ;
    let dead=b.life<=0||b.z<0;
    if(!dead&&dx*dx+dy*dy+dz*dz<2.6){hurt(s,10);explode(s,b.x,b.y,b.z,6,1,false);dead=true;}
    if(dead)s.eb.splice(i,1);
  }

  /* ---- 背景の障害物 ---- */
  for(let i=s.sc.length-1;i>=0;i--){
    const o=s.sc[i];
    o.z-=C.SCROLL;
    if(Math.abs(o.z-C.PZ)<1.3&&Math.abs(o.x-p.x)<o.r+0.9&&p.y<o.h){
      hurt(s,12);explode(s,o.x,o.h*0.5,o.z,10,0,false);o.z=-9;
    }
    if(o.z<1)s.sc.splice(i,1);
  }
  updateFx(s);
}

function hash(s){
  const str=JSON.stringify(s);
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  return h>>>0;
}
function scripted(f){
  const a=f*0.031;
  return{lx:Math.sin(a),ly:Math.cos(a*1.3),rx:Math.sin(a*0.7),ry:Math.sin(a*0.4),
    dL:f%97>=10&&f%97<14,dR:f%131>=40&&f%131<44,tA:(f%60)<40,tB:f%200===150,jump:f%173===5};
}
function allFinite(o){
  if(typeof o==='number')return Number.isFinite(o);
  if(o&&typeof o==='object'){for(const k in o){if(!allFinite(o[k]))return false;}}
  return true;
}
function selfTest(){
  const hs=[];let fin=true,kills=0;
  for(let k=0;k<2;k++){
    const s=newState(20261006);
    for(let f=0;f<3600;f++){
      step(s,scripted(f));
      if(s.p.hp<30)s.p.hp=C.HP;
    }
    hs.push(hash(s));fin=fin&&allFinite(s);kills=s.kills;
  }
  return{ok:hs[0]===hs[1]&&fin&&kills>0,hash:hs[0],frames:3600,kills};
}


module.exports={C,rnd,newState,step,hash,scripted,selfTest};
