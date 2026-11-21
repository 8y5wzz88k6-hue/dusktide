(() => {
  'use strict';
  const $=id=>document.getElementById(id), app=$('app'), ctx=$('instruments').getContext('2d');
  const T=window.THREE, clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), mix=(a,b,t)=>a+(b-a)*t;
  const vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z), ease=(rate,dt)=>1-Math.exp(-rate*dt);
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)), keys=new Set(), aim={x:0,y:0}, stick={x:0,y:0};
  let state='menu',renderer,scene,camera,world,player,templates,fxPool,elapsed=0,phase=0,kills=0,phaseKills=0,transition=0;
  let enemies=[],shots=[],effects=[],trails=[],wreck=null,lock=null,target=null,mouseFire=false,touchFire=false,firstPerson=false,muted=false;
  let wallGrace=0;
  let yaw=0,pitch=0,roll=0,time=0,armor=100,energy=100,speed=78,gunTimer=0,beamCool=0,charge=0,beam=0,dodge=0,dodgeCool=0,dodgeSign=1;
  let flash=0,impact=0,hitMark=0,noticeTime=0,boundary=0,bossWind=0,beamUsed=0,lastFrame=0,w=1,h=1,serial=0,camReady=false;
  let sound,master,engine,engineVolume,menuFocus,frameScale=1,slowTime=0,uiClock=0,exhausted=false,emitters=[];
  const direction=()=>vec(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  const right=()=>vec(Math.cos(yaw),0,-Math.sin(yaw));
  function setState(s){state=s;app.dataset.state=s;if(engineVolume)engineVolume.gain.setTargetAtTime(s==='playing'?.029:0,sound.currentTime,.1)}
  function initAudio(){
    try {if(!sound){sound=new (window.AudioContext||window.webkitAudioContext)();master=sound.createGain();master.gain.value=muted?0:.3;master.connect(sound.destination);
      engine=sound.createOscillator();engine.type='triangle';engine.frequency.value=44;engineVolume=sound.createGain();engineVolume.gain.value=0;engine.connect(engineVolume).connect(master);engine.start()}
      if(sound.state==='suspended')sound.resume().catch(()=>{})}catch{}
  }
  function tone(freq,end,duration,type='sine',vol=.17,delay=0){if(!sound||muted)return;const t=sound.currentTime+delay,o=sound.createOscillator(),g=sound.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(12,end),t+duration);
    g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(vol,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g).connect(master);o.start(t);o.stop(t+duration+.015)}
  function soundToggle(){initAudio();muted=!muted;if(master)master.gain.setTargetAtTime(muted?0:.3,sound.currentTime,.025);$('audio').classList.toggle('muted',muted);$('soundText').textContent=muted?'声音关闭':'声音开启';$('audio').setAttribute('aria-pressed',String(!muted))}
  function resize(){w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,1.6);$('instruments').width=w*d;$('instruments').height=h*d;ctx.setTransform(d,0,0,d,0,0);
    if(renderer){renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.55)*frameScale);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
  function init(){if(renderer)return;if(!T)throw Error('3D 引擎未载入');const r=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer=r;scene=new T.Scene();camera=new T.PerspectiveCamera(63,w/h,.35,13800);
    r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.1;$('world').appendChild(r.domElement);
    world=Airspace.build(scene,r);player=Hangar.mech();player.rotation.order='YXZ';scene.add(player);
    templates=[Hangar.drone(),Hangar.drone(true),Hangar.carrier()];
    const streakGeometry=new T.CylinderGeometry(1,1,1,8);const ballGeometry=new T.IcosahedronGeometry(1,1);
    fxPool={line:[],ball:[],materials:new Map(),streakGeometry,ballGeometry};
    for(const side of [-1,1]){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(12),3));geo.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geo.setIndex([0,2,1,1,2,3]);
      const mat=new T.ShaderMaterial({uniforms:{pulse:{value:0}},transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending,
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:'varying vec2 vUv;uniform float pulse;void main(){float d=abs(vUv.x*2.-1.);float edge=exp(-d*d*5.);float core=exp(-d*d*105.);float f=.9+.1*sin(vUv.y*44.-pulse*31.);gl_FragColor=vec4(vec3(1.,.055+.89*core,.14+.77*core),edge*f);}'});
      const sheet=new T.Mesh(geo,mat),origin=Hangar.flare(0xff5269,1.5),impactGlow=Hangar.flare(0xff5269,10);sheet.frustumCulled=false;scene.add(sheet,origin,impactGlow);emitters.push({side,sheet,origin,impactGlow})}
    showBeams(false);
    r.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(state==='playing')pause();$('dialogBody').textContent='图形设备连接中断，请刷新页面重新出击。'});
    resize()}
  function clearInput(){keys.clear();aim.x=aim.y=stick.x=stick.y=0;mouseFire=touchFire=false;$('stick').firstElementChild.style.transform=''}
  function announce(a,b='',duration=3){$('notice').textContent=a;$('subnotice').textContent=b;noticeTime=duration;$('notice').parentElement.style.opacity='1'}
  function dialog(code,title,content,actions){menuFocus=document.activeElement;$('dialogCode').textContent=code;$('dialogTitle').textContent=title;$('dialogBody').innerHTML=content;const area=$('dialogActions');area.replaceChildren();
    actions.forEach(([label,fn],i)=>{const b=document.createElement('button');b.textContent=label;b.className=i?'secondary':'primary';b.onclick=fn;area.appendChild(b)});$('veil').hidden=false;area.firstElementChild.focus()}
  function closeDialog(){$('veil').hidden=true;if(menuFocus?.isConnected)menuFocus.focus({preventScroll:true})}
  const manualHTML='<dl class="manual">'+[
    ['鼠标移动','准星瞄准，靠近边缘转向'],['A / D 或 ← / →','左转 / 右转'],['W / S 或 ↑ / ↓','抬升 / 俯冲'],['左键 / 空格','持续发射脉冲弹'],['R','追踪最近敌机，再按解除'],['Q','双肩强子炮蓄能齐射'],['Shift / E','推进加速 / 无敌侧滚'],['V / Esc','座舱视角 / 暂停']
  ].map(([a,b])=>'<div><dt><kbd>'+a+'</kbd></dt><dd>'+b+'</dd></div>').join('')+'</dl><p>金色方框表示进入火控范围。触屏用左摇杆转向，右侧按钮开火或追踪。</p>';
  function manual(){dialog('FLIGHT MANUAL','驾驶手册',manualHTML,[['返回',state==='paused'?pauseDialog:closeDialog]])}
  function pauseDialog(){dialog('FLIGHT SUSPENDED','飞行暂停','<p>推进与敌方行动已冻结。</p>',[['继续飞行',resume],['驾驶手册',manual],['返回基地',menu]])}
  function pause(){if(state!=='playing')return;clearInput();setState('paused');pauseDialog()}
  function resume(){closeDialog();clearInput();setState('playing');lastFrame=performance.now()}
  function menu(){closeDialog();clearInput();setState('menu');$('deploy').focus()}
  function finish(won){if(state!=='playing')return;clearInput();setState(won?'won':'lost');const seconds=Math.floor(elapsed);
    const score=armor>=65?'S':armor>=30?'A':'B';const stats=[['作战用时',Math.floor(seconds/60)+' 分 '+seconds%60+' 秒'],['击毁目标',kills+' 架 / 艘'],['强子炮齐射',beamUsed+' 次'],['剩余装甲',Math.ceil(armor)+'%']];
    dialog(won?'MISSION COMPLETE  /  '+score:'SIGNAL LOST',won?'市中心空域已夺回':'机体失去响应','<p>'+(won?'指挥舰已失去动力。中央商务区上空的封锁解除。':'撤离信号已发出。可使用 R 追踪敌机，红色来袭警报出现时按 E 规避。')+'</p>'+stats.map(([a,b])=>'<div class="resultRow"><span>'+a+'</span><b>'+b+'</b></div>').join(''),[['再次出击',start],['返回基地',menu]]);tone(won?395:95,won?660:31,.55)}
  function start(){initAudio();try{init()}catch(e){$('error').textContent='无法启动 3D 画面。请在支持 WebGL 的浏览器里启用硬件加速。';console.error(e);return}
    closeDialog();clearInput();for(const e of enemies)scene.remove(e.mesh);for(const s of shots)release(s.obj,'ball');for(const f of effects)release(f.obj,f.kind);
    if(wreck)scene.remove(wreck);wreck=null;enemies=[];shots=[];effects=[];elapsed=time=phaseKills=kills=transition=serial=0;yaw=pitch=roll=0;armor=energy=100;speed=78;gunTimer=beamCool=charge=beam=dodge=dodgeCool=flash=impact=hitMark=boundary=bossWind=beamUsed=0;lock=target=null;firstPerson=false;camReady=false;slowTime=0;phase=0;
    wallGrace=0;exhausted=false;showBeams(false);$('canopy').hidden=true;trails.forEach(dropTrail);trails=[];player.position.set(0,34,735);player.rotation.set(0,0,0);player.visible=true;
    for(const limb of player.userData.sides)attachTrail(limb.tip,vec(),.14,0xd5e7e5,.37);
    setState('playing');beginPhase(1);updateCamera(1);updateUI();drawHUD();lastFrame=performance.now();tone(180,420,.3)}
  function attachTrail(owner,offset,width,color,opacity){const n=32,geom=new T.BufferGeometry(),pos=new Float32Array(n*6),tint=new Float32Array(n*8),index=[],c=new T.Color(color);
    for(let i=0;i<n;i++){for(let k=0;k<2;k++)tint.set([c.r,c.g,c.b,opacity*(1-i/(n-1))],i*8+k*4);if(i){const j=i*2;index.push(j-2,j-1,j,j,j-1,j+1)}}
    geom.setAttribute('position',new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage));geom.setAttribute('color',new T.BufferAttribute(tint,4));geom.setIndex(index);geom.setDrawRange(0,0);
    const mat=new T.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
    mat.onBeforeCompile=s=>{s.vertexShader='varying float trailDepth;\n'+s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ntrailDepth=-mvPosition.z;');s.fragmentShader='varying float trailDepth;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=smoothstep(8.,35.,trailDepth);')};
    const mesh=new T.Mesh(geom,mat);mesh.frustumCulled=false;scene.add(mesh);trails.push({owner,offset,width,mesh,points:[],timer:0})}
  function dropTrail(t){scene.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.dispose()}
  function updateTrails(dt){for(let k=trails.length-1;k>=0;k--){const t=trails[k];if(!t.owner.parent){dropTrail(t);trails.splice(k,1);continue}const head=t.owner.localToWorld(t.offset.clone());t.timer-=dt;if(t.timer<=0){t.points.unshift(head);if(t.points.length>31)t.points.pop();t.timer=.042}
      const attr=t.mesh.geometry.attributes.position,v=right();for(let i=0;i<=t.points.length;i++){const p=i?t.points[i-1]:head,r=t.width*(1+i*.054);attr.setXYZ(i*2,p.x+v.x*r,p.y+r*.22,p.z+v.z*r);attr.setXYZ(i*2+1,p.x-v.x*r,p.y-r*.22,p.z-v.z*r)}attr.needsUpdate=true;t.mesh.geometry.setDrawRange(0,t.points.length*6);t.mesh.visible=!player.userData.sides.some(l=>l.tip===t.owner)||(!firstPerson&&(dodge>0||speed>95||Math.abs(roll)>.25))}}
  function spawn(kind,offset,index){
    const model=templates[kind].clone(),forward=direction(),p=player.position.clone().addScaledVector(forward,offset.z).addScaledVector(right(),offset.x);
    const alongZ=Math.abs(forward.z)>=Math.abs(forward.x),cross=alongZ?'x':'z',along=alongZ?'z':'x';
    const spacing=kind===2?world.block*4:world.block;
    p[cross]=Math.round(p[cross]/spacing)*spacing;
    p[along]=clamp(p[along],-2750,2750);
    p.y=kind===2?35:32+index*2.2;
    model.position.copy(p);scene.add(model);
    const hp=[80,112,1380][kind];model.scale.setScalar(kind===2?1.85:2.15);const e={mesh:model,kind,hp,max:hp,id:++serial,anchor:p.clone(),cross,along,vel:vec(),age:0,cycle:index*1.53,fire:2.8+index*.8,flash:0,wind:0};enemies.push(e);
    if(kind<2)for(const s of [-1,1])attachTrail(model,vec(s*3.8,.12,1.63),.37,0xe6d8c9,.54);return e}
  const phases=[null,['中央大道拦截','击破先遣无人机',3],['封锁线','清除精锐护航队',4],['旗舰决战','击毁「长夜」空中指挥舰',1]];
  function beginPhase(n){phase=n;phaseKills=0;transition=0;lock=null;const offsets=n===1?[[-45,255],[89,340],[15,400]]:n===2?[[-65,285],[36,245],[130,375],[-38,410]]:[[0,380]];
    offsets.forEach(([x,z],i)=>spawn(n-1,{x,z},i));if(n>1){energy=100;armor=Math.min(100,armor+15)}announce(phases[n][0],n===1?'低空接敌 · 按 R 追踪，按住空格开火':n===2?'推进能源已补满 · 装甲修复 15%':'旗舰进入低空航道 · 以双肩强子炮集中攻击',3.3);updateUI()}
  function nearest(){let best=null,bestD=Infinity;for(const e of enemies){const hidden=world.trace(player.position,e.mesh.position)<1;const d=e.mesh.position.distanceToSquared(player.position)+(hidden?1e7:0);if(d<bestD){best=e;bestD=d}}return best}
  function track(){if(state!=='playing')return;lock=lock?null:nearest();aim.x=aim.y=0;announce(lock?'目标追踪':'手动飞行',lock?'火控正在引导转向':'',1.15);tone(lock?550:330,lock?920:215,.14)}
  function activateBeam(){if(state!=='playing'||beamCool>0||charge>0||beam>0)return;charge=.9;beamCool=10.5;beamUsed++;tone(120,1450,.86,'sawtooth',.11);announce('强子炮充能','双肩发射器展开',.88)}
  function evade(){if(state!=='playing'||dodgeCool>0||energy<16)return;dodge=.68;dodgeCool=2.6;dodgeSign=(keys.has('KeyA')||aim.x<-.15||stick.x<-.15)?-1:1;energy-=16;tone(245,48,.54,'sawtooth',.17)}
  function toggleView(){if(state!=='playing')return;firstPerson=!firstPerson;$('canopy').hidden=!firstPerson;player.visible=!firstPerson;camReady=false;aim.x=aim.y=0;announce(firstPerson?'座舱视角':'机体跟随视角','',.8)}
  function takeDamage(amount){if(dodge>0||wreck||state!=='playing')return;armor=Math.max(0,armor-amount);impact=.45;flash=.2;tone(95,37,.22,'square',.13);if(armor<=0)finish(false)}
  function effectObject(kind,color){const pool=fxPool[kind];let mat=fxPool.materials.get(color);if(!mat){mat=new T.MeshBasicMaterial({color,blending:T.AdditiveBlending,transparent:true,depthWrite:false,toneMapped:false});fxPool.materials.set(color,mat)}
    const o=pool.pop()||new T.Mesh(kind==='line'?fxPool.streakGeometry:fxPool.ballGeometry,mat);o.material=mat;o.visible=true;scene.add(o);return o}
  function release(o,kind){scene.remove(o);fxPool[kind].push(o)}
  const upAxis=()=>vec(0,1,0);
  function line(a,b,r,color,life=.1){const dir=b.clone().sub(a),len=dir.length();if(len<.01)return;const o=effectObject('line',color);o.position.copy(a).lerp(b,.5);o.quaternion.setFromUnitVectors(upAxis(),dir.multiplyScalar(1/len));o.scale.set(r,len,r);effects.push({obj:o,kind:'line',life,max:life,rad:r})}
  function burst(p,size,num=16){for(let i=0;i<num;i++){const o=effectObject('ball',[0xffcd78,0xff8750,0xfb6742,0xffe3a5][i%4]);o.position.copy(p);const radius=(.3+Math.random()*.85)*size;o.scale.setScalar(radius);const life=.35+Math.random()*.48;
      effects.push({obj:o,kind:'ball',life,max:life,rad:radius,vel:vec(Math.random()-.5,Math.random()-.36,Math.random()-.5).multiplyScalar(size*10)})}}
  function damage(e,amount,p){e.hp-=amount;e.flash=.16;hitMark=.17;if(e.hp>0)return;burst(e.mesh.position,e.kind===2?12:3.3,e.kind===2?46:18);tone(e.kind===2?130:185,26,.53,'sawtooth',.32);
    if(e.kind===2){wreck=e.mesh;for(const s of shots)release(s.obj,'ball');shots=[]}else scene.remove(e.mesh);
    enemies=enemies.filter(other=>e!==other);if(lock===e)lock=null;if(target===e)target=null;kills++;phaseKills++;if(!enemies.length){transition=phase===3?2.8:2.7;announce(phase===3?'指挥舰已击毁':'空域已清除',phase===3?'旗舰信号消失':'下一批信号正在接近',2)}}
  function updateEffects(dt){for(let i=effects.length-1;i>=0;i--){const f=effects[i];f.life-=dt;if(f.life<=0){release(f.obj,f.kind);effects.splice(i,1);continue}const s=f.rad*Math.min(1,f.life/f.max*1.7);if(f.kind==='ball'){f.obj.position.addScaledVector(f.vel,dt);f.vel.multiplyScalar(Math.exp(-1.5*dt));f.obj.scale.setScalar(s)}else f.obj.scale.x=f.obj.scale.z=s}}
  function trackWaypoint(enemy){
    const p=player.position,to=enemy.mesh.position;
    if(world.trace(p,to,5)===1){enemy.corner=null;return to}
    if(enemy.corner&&p.distanceToSquared(enemy.corner)>14*14&&world.trace(p,enemy.corner,4)===1)return enemy.corner;
    const size=world.block,x=Math.round(p.x/size),z=Math.round(p.z/size);
    let best=null,cost=Infinity;
    for(let i=x-1;i<=x+1;i++)for(let j=z-1;j<=z+1;j++){
      const corner=vec(i*size,p.y,j*size),leg=corner.distanceTo(p);
      if(leg<14||world.trace(p,corner,4)<1)continue;
      const distance=leg+Math.abs(corner.x-to.x)+Math.abs(corner.z-to.z)+(world.trace(corner,to,5)<1?size:0);
      if(distance<cost){cost=distance;best=corner}
    }
    enemy.corner=best;
    return best||to;
  }
  function updatePlayer(dt){
    const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+stick.x;
    const y=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-stick.y;
    const turn=clamp(x+Math.sign(aim.x)*Math.max(0,Math.abs(aim.x)-.18)*1.5,-1.35,1.35);
    let turnRate=-turn*1.28,desiredPitch=clamp(y*.78-aim.y*.71,-.88,.88);
    if(lock){const waypoint=trackWaypoint(lock);const v=waypoint.clone().sub(player.position);turnRate+=clamp(wrap(Math.atan2(-v.x,-v.z)-yaw)*2.9,-2.2,2.2);desiredPitch+=Math.atan2(v.y,Math.hypot(v.x,v.z))}
    const dist=Math.hypot(player.position.x,player.position.z);if(dist>2800){const home=Math.atan2(player.position.x,player.position.z);turnRate=clamp(wrap(home-yaw)*2.5,-2.4,2.4);if(boundary<=0){announce('接近作战边界','导航已引导返航',2);boundary=4}}
    // Ease the nose level as the pilot approaches either edge of the street corridor.
    const pitchRoom=desiredPitch>0?(49-player.position.y)/8:(player.position.y-29)/8;
    yaw=wrap(yaw+turnRate*dt);pitch=mix(pitch,clamp(desiredPitch,-.50,.50)*clamp(pitchRoom,0,1),ease(3.8,dt));roll=mix(roll,clamp(turnRate*.43,-.79,.79),ease(4,dt));boundary-=dt;
    if(energy<=2)exhausted=true;if(energy>=25)exhausted=false;
    const boosting=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!exhausted;
    const range=lock&&world.trace(player.position,lock.mesh.position,4)===1?lock.mesh.position.distanceTo(player.position):Infinity,orbit=lock&&!boosting?clamp((265-range)/125,0,1):0;
    const previous=player.position.clone();const wanted=boosting?153:78;speed=mix(speed,wanted,ease(2,dt));energy=clamp(energy+(boosting?-24:13)*dt,0,100);
    const lateral=right(),clearance=world.trace(previous,previous.clone().addScaledVector(lateral,40),6);
    // Brake or reverse down the street instead of circling into the next block.
    const closing=orbit>0?clamp((range-165)/100,-.9,1):1;
    player.position.addScaledVector(direction(),speed*closing*dt).addScaledVector(lateral,speed*orbit*.12*Math.sin(time*.8)*Math.max(0,clearance-.1)*dt);
    if(dodge>0){player.position.addScaledVector(right(),dodgeSign*142*dt);dodge=Math.max(0,dodge-dt)}dodgeCool=Math.max(0,dodgeCool-dt);
    player.position.y=clamp(player.position.y,29,49);
    if(world.trace(previous,player.position,4)<1){
      // Resolve each free axis so grazing a wall preserves flight along it.
      const desired=player.position.clone(),next=previous.clone();player.position.copy(previous);
      for(const axis of ['y','x','z']){next.copy(player.position);next[axis]=desired[axis];if(world.trace(player.position,next,4)===1)player.position[axis]=desired[axis]}
      if(wallGrace<=0){takeDamage(4);announce('近楼警报','沿街转向或拉升避开幕墙',.85)}wallGrace=.8;
    }else wallGrace=Math.max(0,wallGrace-dt);
    const spin=dodge>0?-dodgeSign*(1-dodge/.68)*Math.PI*2:0;
    player.rotation.set(pitch-.28-(boosting?.34:0),yaw,roll+spin,'YXZ');
    player.userData.pose({dt,time,bank:roll,climb:pitch,boost:boosting?1:0,fire:mouseFire||touchFire||keys.has('Space'),charge,beam,evade:dodge,hit:impact});
    player.userData.jets.forEach((j,i)=>j.scale.setScalar((boosting?2.85:1.33)*(1+.1*Math.sin(time*27+i))));
    if(engine)engine.frequency.setTargetAtTime(33+speed*.16,sound.currentTime,.1);
    gunTimer-=dt;beamCool=Math.max(0,beamCool-dt);impact=Math.max(0,impact-dt);flash=Math.max(0,flash-dt);hitMark=Math.max(0,hitMark-dt);
  }
  function updateCamera(dt){const f=direction(),r=right(),p=player.position,boost=(speed-78)/75;
    const recoil=beam>0?Math.min(1,beam*3)*.65:0;
    const pos=p.clone().addScaledVector(f,firstPerson?2.6:-14.8-Math.max(0,boost)*1.6-recoil);pos.y+=firstPerson?1.55:4.25;if(!firstPerson)pos.addScaledVector(r,3.15);
    const focus=p.clone().addScaledVector(f,210);focus.y+=firstPerson?1.55:5;
    if(!camReady){camera.position.copy(pos);camReady=true}else camera.position.lerp(pos,ease(16,dt));
    if(impact>0){camera.position.x+=Math.sin(time*78)*impact*.25;camera.position.y+=Math.sin(time*95)*impact*.18}
    const cameraRoom=world.trace(p,camera.position,1.6);if(cameraRoom<1)camera.position.lerpVectors(p,camera.position,Math.max(.03,cameraRoom-.05));
    camera.up.set(0,1,0).applyAxisAngle(f,-roll*(firstPerson?.77:.48));if(firstPerson&&dodge>0)camera.up.applyAxisAngle(f,dodgeSign*(1-dodge/.68)*Math.PI*2);
    camera.lookAt(focus);camera.fov=mix(camera.fov,(firstPerson?70:62)+Math.max(0,boost)*9,ease(5,dt));camera.updateProjectionMatrix();camera.updateMatrixWorld();player.updateMatrixWorld(true);
    player.visible=!firstPerson;
  }
  function aimRay(){const v=vec(aim.x,-aim.y,0.4).unproject(camera);return v.sub(camera.position).normalize()}
  function chooseTarget(ray){let found=null,score=Infinity;for(const e of enemies){const delta=e.mesh.position.clone().sub(camera.position),d=delta.length();if(d>1300)continue;const dot=delta.multiplyScalar(1/d).dot(ray);const angle=Math.acos(clamp(dot,-1,1));const tolerance=(e.kind===2?.125:.078)+(firstPerson?0:.032)+(lock===e?.055:0)+Math.min(.12,7/d);if(angle>tolerance||world.trace(player.position,e.mesh.position)<1)continue;const cost=angle+d*.000012;if(cost<score){score=cost;found=e}}return found}
  function muzzle(side,shoulder){const limb=player.userData.sides[side>0?1:0];return (shoulder?limb.barrel:limb.hand).getWorldPosition(vec())}
  function showBeams(visible){for(const e of emitters){e.sheet.visible=e.origin.visible=e.impactGlow.visible=visible}}
  function drawBeam(e,end){const a=muzzle(e.side,true),b=end.clone().addScaledVector(right(),e.side*.72),wall=world.trace(a,b);
    if(wall<1)b.lerpVectors(a,b,wall);const axis=b.clone().sub(a).normalize();
    const across=axis.clone().cross(camera.position.clone().sub(a)).normalize(),attr=e.sheet.geometry.attributes.position;
    for(let i=0;i<4;i++){const near=i<2,p=near?a:b,width=(near?.49:1.6)*(i%2?1:-1);attr.setXYZ(i,p.x+across.x*width,p.y+across.y*width,p.z+across.z*width)}
    attr.needsUpdate=true;e.sheet.material.uniforms.pulse.value=time;e.origin.position.copy(a);e.impactGlow.position.copy(b);e.impactGlow.visible=!!target||wall<1;return wall===1}
  function weapons(dt){const ray=aimRay();target=chooseTarget(ray);const end=target?target.mesh.position.clone():camera.position.clone().addScaledVector(ray,1050);
    if(!target){const t=world.trace(camera.position,end);if(t<1)end.lerpVectors(camera.position,end,t)}
    if(target)end.addScaledVector(player.position.clone().sub(end).normalize(),target.kind===2?19:3.4);
    if((mouseFire||touchFire||keys.has('Space'))&&gunTimer<=0){gunTimer=.098;const side=Math.floor(time*12)%2?1:-1;const a=muzzle(side,false),wall=world.trace(a,end),hit=a.clone().lerp(end,wall);line(a,hit,.17,0x79eaff,.079);line(a,hit,.052,0xffffff,.069);tone(280,83,.08,'sawtooth',.064);if(target&&wall===1){burst(hit,1.05,3);damage(target,8,hit)}}
    if(charge>0){charge-=dt;for(const s of [-1,1]){const p=muzzle(s,true),j=effectObject('ball',0xff547c);j.position.copy(p);const radius=.24+(1-charge/.9)*.64;j.scale.setScalar(radius);effects.push({obj:j,kind:'ball',life:.045,max:.045,rad:radius,vel:vec()})}
      if(charge<=0){charge=0;beam=1.45;tone(145,36,1.3,'sawtooth',.28);tone(560,100,1.2,'triangle',.22)}}
    showBeams(beam>0);if(beam>0){beam=Math.max(0,beam-dt);let clearBarrels=0;for(const e of emitters)if(drawBeam(e,end))clearBarrels++;
      if(target&&clearBarrels){if(Math.random()<dt*15)burst(end,1.3,3);damage(target,97*clearBarrels*dt,end)}}
  }
  function enemyShot(e,boss=false){const p=e.mesh.position.clone(),d=p.distanceTo(player.position);if(d>1550)return;
    const s=boss?260:204;const lead=player.position.clone().addScaledVector(direction(),speed*clamp(d/s,0,2.5)*(boss?.94:.81));
    const velocity=lead.sub(p).normalize().multiplyScalar(s);const obj=effectObject('ball',boss?0xff4562:0xffa24d);obj.position.copy(p);obj.scale.setScalar(boss?3.8:1.65);
    shots.push({obj,vel:velocity,life:8,power:boss?18:6,radius:boss?13:7,follow:true});tone(boss?170:230,60,.14,'triangle',.06)}
  function updateEnemies(dt){bossWind=0;
    for(const e of enemies){e.age+=dt;e.flash=Math.max(0,e.flash-dt);const p=e.mesh.position,old=p.clone(),delta=player.position.clone().sub(p),d=delta.length();
      // Patrol the open axis of a boulevard. Its cross-street offset stays
      // inside the clear central strip, including the flagship's wingtips.
      const a=e.age*(e.kind===2?.14:e.kind===1?.33:.24)+e.cycle;
      if(d>680){e.anchor[e.along]+=clamp(player.position[e.along]-e.anchor[e.along],-85,85)*dt}
      const amplitude=e.kind===2?105:128;
      p[e.along]=e.anchor[e.along]+Math.sin(a)*amplitude;
      p[e.cross]=e.anchor[e.cross]+Math.sin(a*.85)*(e.kind===2?3:12);
      p.y=e.anchor.y+Math.sin(a*1.46)*(e.kind===2?1.2:3.2);
      if(e.kind===2){e.mesh.rotation.y=(e.along==='z'?0:Math.PI/2)+Math.sin(a)*.08;e.mesh.rotation.z=Math.sin(a)*.035}
      else{const v=p.clone().sub(old);if(v.lengthSq()>.00001){e.mesh.rotation.order='YXZ';e.mesh.rotation.y=Math.atan2(-v.x,-v.z);e.mesh.rotation.x=Math.atan2(v.y,Math.hypot(v.x,v.z));e.mesh.rotation.z=Math.sin(a)*.53}}
      e.vel.copy(p).sub(old).multiplyScalar(1/Math.max(.001,dt));e.fire-=dt;
      if(e.kind===2&&e.fire<1.45)bossWind=Math.max(bossWind,1.45-Math.max(0,e.fire));
      if(e.fire<=0){enemyShot(e,e.kind===2);e.fire=e.kind===2?(e.hp<e.max*.5?2.35:3.05):e.kind===1?3.25+Math.random()*.85:4.2+Math.random()*1.15}
      if(d<(e.kind===2?35:10)&&impact<=0&&dodge<=0){takeDamage(e.kind===2?14:7);player.position.addScaledVector(right(),23)}
    }
    for(let i=shots.length-1;i>=0;i--){const s=shots[i],p=s.obj.position,old=p.clone(),d=p.distanceTo(player.position);
      if(d<85||dodge>0)s.follow=false;
      if(s.follow){const v=s.vel.length(),dest=player.position.clone().addScaledVector(direction(),speed*Math.min(1.2,d/v));s.vel.lerp(dest.sub(p).normalize().multiplyScalar(v),ease(2.8,dt)).setLength(v)}
      p.addScaledVector(s.vel,dt);s.life-=dt;
      const seg=p.clone().sub(old);const t=clamp(player.position.clone().sub(old).dot(seg)/Math.max(.001,seg.lengthSq()),0,1);const hit=old.addScaledVector(seg,t).distanceTo(player.position)<s.radius;
      const wall=world.trace(old.copy(p).addScaledVector(s.vel,-dt),p);if(hit&&t<=wall)takeDamage(s.power);if(hit||wall<1||s.life<=0){release(s.obj,'ball');shots.splice(i,1)}else if(Math.random()<dt*20){line(p.clone().addScaledVector(s.vel,-.068),p,s.power>10?.94:.35,s.power>10?0xff365c:0xff8950,.1)}}
  }
  function updateUI(){const data=phases[phase];if(!data)return;$('phase').textContent='东岬市中心　/　'+['','01','02','03'][phase];$('objective').textContent=data[1];const boss=enemies.find(e=>e.kind===2);
    $('progress').textContent=boss?'舰体完整度　'+Math.ceil(boss.hp/boss.max*100)+'%':'已击毁　'+phaseKills+' / '+data[2];$('hp').textContent=Math.ceil(armor)+'%';$('hpBar').style.width=armor+'%';$('fuel').textContent=Math.floor(energy)+'%';$('fuelBar').style.width=energy+'%';$('beamStatus').textContent=charge>0?'发射器充能':beam>0?'正在照射':beamCool>0?'冷却 '+beamCool.toFixed(1)+' 秒':'双炮就绪'}
  const ink='#edefda',gold='#ffda82',cyan='#9ce9e7',hostile='#ff937b';
  function segment(x1,y1,x2,y2){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2)}
  function textAt(s,x,y,color=ink,align='center',size=11){ctx.font=size+'px Consolas, "Microsoft YaHei", monospace';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(s,x,y)}
  function radar(){const radius=w<620?35:47,cx=w<620?54:80,cy=h*.5;ctx.save();ctx.translate(cx,cy);ctx.strokeStyle='#d4e6e49c';ctx.fillStyle='rgba(12,32,42,.4)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(0,0,radius*.53,0,Math.PI*2);segment(-radius,0,radius,0);segment(0,-radius,0,radius);ctx.globalAlpha=.45;ctx.stroke();ctx.globalAlpha=1;
    const f=direction();f.y=0;f.normalize();const rt=right();for(const e of enemies){const d=e.mesh.position.clone().sub(player.position),x=d.dot(rt),y=-d.dot(f);const scale=radius/Math.max(640,Math.hypot(x,y)*1.1);ctx.fillStyle=e===lock?gold:hostile;ctx.beginPath();ctx.arc(x*scale,y*scale,e.kind===2?3.8:2.4,0,7);ctx.fill()}
    ctx.fillStyle=cyan;ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3,3);ctx.lineTo(-3,3);ctx.fill();textAt('雷达',0,radius+16,ink,'center',10);ctx.restore()}
  function markers(){for(const e of enemies){const delta=e.mesh.position.clone().sub(player.position),distance=Math.round(delta.length());const q=e.mesh.position.clone().project(camera);const forwardPoint=q.z>-1&&q.z<1;let x=(q.x+1)*w/2,y=(1-q.y)*h/2;const selected=e===lock||e===target,col=e===target?gold:e===lock?cyan:hostile;
      if(forwardPoint&&x>28&&x<w-28&&y>55&&y<h-65){if(world.trace(camera.position,e.mesh.position)<1){if(e===lock)textAt('◇ 遮挡',x,y,cyan,'center',11);continue}let b=clamp((e.kind===2?36:9)*h/Math.max(35,distance),8,e.kind===2?85:29);
        ctx.lineWidth=selected?2:1.3;ctx.strokeStyle=col;ctx.beginPath();
        for(const a of [-1,1])for(const c of [-1,1]){const xx=x+a*b,yy=y+c*b;ctx.moveTo(xx-a*b*.55,yy);ctx.lineTo(xx,yy);ctx.lineTo(xx,yy-c*b*.55)}ctx.stroke();
        if(e.hp<e.max||e.kind===2){ctx.fillStyle='#12202b99';ctx.fillRect(x-b,y-b-7,b*2,3);ctx.fillStyle=col;ctx.fillRect(x-b,y-b-7,b*2*e.hp/e.max,3)}
        textAt((e===lock?'追踪 · ':'')+distance+' m',x,y+b+15,col,'center',10);
      }else{const v=e.mesh.position.clone().applyMatrix4(camera.matrixWorldInverse);const a=Math.atan2(-v.y,v.x||.000001);const dx=Math.cos(a),dy=Math.sin(a),rad=Math.min((w*.44)/Math.max(.001,Math.abs(dx)),(h*.32)/Math.max(.001,Math.abs(dy)));
        x=w/2+dx*rad;y=h/2+dy*rad;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-4);ctx.lineTo(-4,4);ctx.fill();ctx.restore()}}
  }
  function cockpit(){ctx.save();ctx.strokeStyle='#c7e1c697';ctx.lineWidth=1;
    for(let i=-2;i<=2;i++){const yy=h*.5+i*27+(pitch*26)%27;ctx.beginPath();segment(w*.5-70,yy,w*.5-43,yy);segment(w*.5+43,yy,w*.5+70,yy);ctx.stroke()}ctx.restore()}
  function drawHUD(){ctx.clearRect(0,0,w,h);if(!player)return;ctx.save();ctx.shadowColor='#08141b';ctx.shadowBlur=3;
    radar();markers();if(firstPerson)cockpit();
    const x=w*(.5+aim.x*.5),y=h*(.5+aim.y*.5);ctx.strokeStyle=target?gold:ink;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y,charge>0?17+charge*9:13,0,7);
    for(const [a,b] of [[0,1],[1,0],[0,-1],[-1,0]])segment(x+a*10,y+b*10,x+a*19,y+b*19);ctx.stroke();ctx.fillStyle=target?gold:ink;ctx.fillRect(x-1,y-1,2,2);
    if(hitMark>0){ctx.strokeStyle='#fff2c3';ctx.beginPath();for(const a of [-1,1])for(const b of [-1,1])segment(x+a*19,y+b*19,x+a*25,y+b*25);ctx.stroke()}
    if(w>670){const mid=w/2;ctx.strokeStyle='#e1e4d789';ctx.beginPath();for(let k=-4;k<=4;k++){const xx=mid+k*24-(yaw*57.3%5)*4.8;segment(xx,23,xx,k%2===0?31:27)}ctx.stroke();textAt(String((Math.round(-yaw*180/Math.PI)+360)%360).padStart(3,'0')+'°',mid,47,ink,'center',12);
      textAt(Math.round(speed*3.6)+' km/h',w*.33,h*.56,ink);textAt(Math.round(player.position.y)+' m',w*.67,h*.56,ink)}
    if(lock)textAt('◇ 追踪中',x,y+38,cyan,'center',11);
    const incoming=shots.some(s=>s.obj.position.distanceToSquared(player.position)<165*165);
    if(incoming||bossWind>.38){textAt(bossWind>.38?'旗舰主炮充能　·　准备规避':'敌弹接近　·　E 规避',w*.5,h*.29,hostile,'center',14)}
    if(flash>0){ctx.shadowBlur=0;const g=ctx.createRadialGradient(w/2,h/2,h*.17,w/2,h/2,w*.73);g.addColorStop(0,'rgba(180,39,24,0)');g.addColorStop(1,'rgba(238,60,40,'+clamp(flash*3,0,.65)+')');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}
    ctx.restore()}
  function advance(dt){time+=dt;elapsed+=dt;updatePlayer(dt);if(state!=='playing')return;updateEnemies(dt);if(state!=='playing')return;updateCamera(dt);weapons(dt);updateEffects(dt);updateTrails(dt);
    if(wreck){wreck.rotation.z+=dt*.25;wreck.rotation.x-=dt*.08;wreck.position.y=Math.max(12,wreck.position.y-dt*(3.2-transition)*10);if(Math.random()<dt*9)burst(wreck.position.clone().add(vec((Math.random()-.5)*42,2,(Math.random()-.5)*50)),3.7,5)}
    if(transition>0){transition-=dt;if(transition<=0){if(phase===3){finish(true);return}beginPhase(phase+1)}}
    noticeTime-=dt;if(noticeTime<=0)$('notice').parentElement.style.opacity='0';uiClock-=dt;if(uiClock<=0){updateUI();uiClock=.08}}
  function frame(now){requestAnimationFrame(frame);const real=(now-lastFrame)/1000;lastFrame=now;if(state!=='playing')return;
    if(real>.039&&real<.4)slowTime+=real;else slowTime=Math.max(0,slowTime-.04);if(slowTime>2.6&&frameScale>.62){frameScale-=.12;slowTime=0;resize()}
    const total=Math.min(.085,Math.max(0,real)),steps=Math.max(1,Math.ceil(total/.024));for(let i=0;i<steps&&state==='playing';i++)advance(total/steps);
    world.update(time,player.position);renderer.render(scene,camera);drawHUD()}
  $('deploy').onclick=start;$('manualBtn').onclick=manual;$('audio').onclick=soundToggle;
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await app.requestFullscreen()}catch{$('error').textContent='当前浏览器未开放全屏，可使用 F11。'}};
  $('viewBtn').onclick=toggleView;$('pauseBtn').onclick=pause;
  addEventListener('keydown',e=>{if(!$('veil').hidden&&e.code==='Tab'){const buttons=$('dialogActions').querySelectorAll('button'),i=[...buttons].indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();return}
    if(e.code==='Escape'&&!e.repeat){if(state==='playing')pause();else if(state==='paused')resume();else if(state==='menu'&&!$('veil').hidden)closeDialog();return}
    if(state!=='playing')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;
    if(e.code==='KeyQ')activateBeam();if(e.code==='KeyR')track();if(e.code==='KeyE')evade();if(e.code==='KeyV')toggleView();if(e.code==='KeyP')pause();if(e.code==='KeyM')soundToggle()});
  addEventListener('keyup',e=>keys.delete(e.code));
  $('world').addEventListener('pointermove',e=>{if(state==='playing'&&e.pointerType!=='touch'){aim.x=clamp((e.clientX/w-.5)*2,-1,1);aim.y=clamp((e.clientY/h-.5)*2,-1,1)}});
  $('world').addEventListener('pointerdown',e=>{if(state==='playing'&&e.button===0&&e.pointerType!=='touch'){mouseFire=true;e.preventDefault()}});
  addEventListener('pointerup',()=>mouseFire=false);addEventListener('pointercancel',()=>mouseFire=false);addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
  const pad=$('stick');let finger=null;function moveStick(e){if(finger!==e.pointerId)return;const rect=pad.getBoundingClientRect(),x=(e.clientX-rect.left-rect.width/2)/32,y=(e.clientY-rect.top-rect.height/2)/32,scale=Math.max(1,Math.hypot(x,y));stick.x=x/scale;stick.y=y/scale;pad.firstElementChild.style.transform='translate('+stick.x*22+'px,'+stick.y*22+'px)'}
  pad.onpointerdown=e=>{if(finger!==null)return;finger=e.pointerId;pad.setPointerCapture(finger);moveStick(e)};pad.onpointermove=moveStick;pad.onlostpointercapture=()=>{finger=null;stick.x=stick.y=0;pad.firstElementChild.style.transform=''};
  $('tFire').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);touchFire=true};$('tFire').onlostpointercapture=()=>touchFire=false;
  $('tBoost').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.add('ShiftLeft')};$('tBoost').onlostpointercapture=()=>keys.delete('ShiftLeft');
  $('tBeam').onclick=activateBeam;$('tDodge').onclick=evade;$('tLock').onclick=track;addEventListener('resize',resize);resize();requestAnimationFrame(frame);
})();
