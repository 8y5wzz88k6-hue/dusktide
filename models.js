/* Original hard-surface models. Local forward is -Z. */
const Hangar = (() => {
  const T=THREE, V=T.Vector3, group=()=>new T.Group();
  const coat=(color,metalness=.58,roughness=.38)=>new T.MeshStandardMaterial({color,metalness,roughness,flatShading:true});
  const armor=coat(0x313c48), graphite=coat(0x19232d), steel=coat(0x7f9099), gold=coat(0xd7ac57,.68,.29), brass=coat(0x8a653a), joint=coat(0x111921,.28,.64),white=coat(0xb1bebd),red=coat(0x863b36);
  const glow=c=>new T.MeshBasicMaterial({color:c});
  const cyan=glow(0x95ffff),rose=glow(0xff6684),hot=glow(0xffdb9b);
  // Hand-painted panel atlas shared by the flight hardware.
  const surface=document.createElement('canvas');surface.width=surface.height=256;
  const painter=surface.getContext('2d');painter.fillStyle='#e3e4e2';painter.fillRect(0,0,256,256);
  let seed=7731;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<7800;i++){const a=rand();painter.fillStyle=a>.55?'rgba(35,38,36,.06)':'rgba(255,255,250,.28)';painter.fillRect(rand()*256,rand()*256,rand()*3+.4,.7+rand())}
  for(const [x,y,w,h] of [[5,5,246,246],[18,20,70,102],[113,140,109,72]]){painter.strokeStyle='rgba(43,49,53,.45)';painter.lineWidth=1.5;painter.strokeRect(x,y,w,h);for(const dx of [4,w-4])for(const dy of [4,h-4]){painter.fillStyle='#666b6c';painter.fillRect(x+dx,y+dy,2.5,2.5)}}
  for(let i=0;i<92;i++){const x=rand()*256,y=rand()*256;painter.strokeStyle='rgba(255,255,255,.55)';painter.lineWidth=.7;painter.beginPath();painter.moveTo(x,y);painter.lineTo(x+rand()*7,y+rand()*2);painter.stroke()}
  const panelMap=new T.CanvasTexture(surface);panelMap.colorSpace=T.SRGBColorSpace;panelMap.anisotropy=4;[armor,graphite,steel,gold,brass,white,red].forEach(m=>m.map=panelMap);
  function mesh(g,geo,mat,x=0,y=0,z=0){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m}
  const cube=new T.BoxGeometry(1,1,1);
  function box(g,x,y,z,w,h,d,m){const o=mesh(g,cube,m,x,y,z);o.scale.set(w,h,d);return o}
  function cyl(g,x,y,z,a,b,h,m,axis='y',n=12){const o=mesh(g,new T.CylinderGeometry(a,b,h,n),m,x,y,z);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;return o}
  // Rings with chamfered corners give plates tapered edges and recessed seams.
  function shell(g,x,y,z,rings,m){const points=[],idx=[];
    for(const [dy,w,d,oz=0,ox=0] of rings){for(const [sx,sz] of [[-.66,-1],[.66,-1],[1,-.57],[1,.57],[.66,1],[-.66,1],[-1,.57],[-1,-.57]])points.push(sx*w+ox,dy,sz*d+oz)}
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<8;i++){const a=j*8+i,b=j*8+(i+1)%8;idx.push(a,a+8,b,b,a+8,b+8)}
    const t=(rings.length-1)*8;for(let i=1;i<7;i++)idx.push(0,i,i+1,t,t+i+1,t+i);
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.setIndex(idx);geo.computeVertexNormals();return mesh(g,geo,m,x,y,z)}
  function plate(g,x,y,z,w,h,d,m){return shell(g,x,y,z,[[-h*.5,w*.36,d*.39],[-h*.28,w*.5,d*.5],[h*.33,w*.5,d*.48],[h*.5,w*.35,d*.34]],m)}
  function wing(g,coords,thick,m){const p=[],idx=[];for(const h of [-thick,thick])for(const [x,y,z] of coords)p.push(x,y+h,z);
    const n=coords.length;for(let i=1;i<n-1;i++)idx.push(0,i,i+1,n,n+i+1,n+i);for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i)}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();const material=m.clone();material.side=T.DoubleSide;return mesh(g,geo,material)}
  // Static armor is batched by material so every bolt does not cost a draw call.
  function bake(g){g.updateMatrixWorld(true);const bins=new Map(),inverse=g.matrixWorld.clone().invert();
    g.traverse(o=>{if(!o.isMesh)return;const key=o.material;let b=bins.get(key);if(!b){b={p:[],n:[],uv:[]};bins.set(key,b)}const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      if(geo.attributes.uv)b.uv.push(...geo.attributes.uv.array);else{const pos=geo.attributes.position;geo.computeBoundingBox();const min=geo.boundingBox.min,size=geo.boundingBox.getSize(new V());for(let i=0;i<pos.count;i++)b.uv.push((pos.getX(i)-min.x)/Math.max(.01,size.x)*.63+(pos.getZ(i)-min.z)/Math.max(.01,size.z)*.35,(pos.getY(i)-min.y)/Math.max(.01,size.y)*.64+(pos.getZ(i)-min.z)/Math.max(.01,size.z)*.34)}
      geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));b.p.push(...geo.attributes.position.array);b.n.push(...geo.attributes.normal.array);geo.dispose()});
    g.clear();for(const [m,b] of bins){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));geo.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));mesh(g,geo,m)}return g}
  let flareMap;
  function flare(color,size){if(!flareMap){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),r=ctx.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'white');r.addColorStop(.15,'rgba(255,255,255,.9)');r.addColorStop(.4,'rgba(255,255,255,.28)');r.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=r;ctx.fillRect(0,0,64,64);flareMap=new T.CanvasTexture(c)}
    const s=new T.Sprite(new T.SpriteMaterial({map:flareMap,color,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));s.scale.setScalar(size);return s}
  function mech(){
    const g=group(),bodies=[],sides=[],jets=[],plumes=[];
    // The armor plates use rest-space coordinates. Each joint has a local pivot
    // and a separate armor batch, so rotating a knee also carries the foot.
    function body(parent,x,y,z){
      const pivot=group(), skin=group(), origin=new V(x,y,z);
      pivot.position.copy(origin);if(parent)pivot.position.sub(parent.origin);
      (parent?parent.pivot:g).add(pivot);skin.position.copy(origin).negate();pivot.add(skin);
      const node={pivot,skin,origin};bodies.push(node);return node;
    }
    function socket(node,x,y,z){const o=group();o.position.set(x,y,z).sub(node.origin);node.pivot.add(o);return o}
    const pelvis=body(null,0,-.83,0),torso=body(pelvis,0,-.53,.03),head=body(torso,0,1.34,0);
    shell(torso.skin,0,.45,0,[[-1,.55,.46],[-.45,.81,.58],[.45,1.26,.7],[.85,1,.55]],armor);
    plate(torso.skin,0,.72,-.47,1.48,.87,.66,gold);plate(torso.skin,0,.78,-.79,.87,.43,.22,graphite);box(torso.skin,0,.8,-.912,.48,.06,.04,cyan);
    plate(pelvis.skin,0,-.62,.04,1.16,.73,.94,joint);plate(pelvis.skin,0,-1.02,.03,1.6,.65,1.12,armor);
    cyl(head.skin,0,1.35,0,.32,.36,.38,joint);shell(head.skin,0,1.74,-.09,[[-.39,.29,.29],[-.15,.45,.43],[.22,.41,.37],[.46,.18,.18,.04]],graphite);box(head.skin,0,1.77,-.515,.67,.092,.06,cyan);
    plate(head.skin,0,2.04,-.3,.17,.48,.25,gold);plate(torso.skin,0,.23,.62,1.62,1.95,.83,graphite);
    const jetMaterial=new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,
      vertexShader:'varying vec2 plumeUv;void main(){plumeUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 plumeUv;void main(){float glow=pow(plumeUv.y,1.8);gl_FragColor=vec4(mix(vec3(.04,.38,.9),vec3(.66,1.,1.),glow),.48*glow);}'});
    const plumeShape=new T.CylinderGeometry(.25,.025,1,12,1,true);plumeShape.translate(0,-.5,0);
    function nozzle(part,x,y,z,angle,size){
      const mount=socket(part,x,y,z);mount.rotation.x=-angle;
      const plume=mesh(mount,plumeShape,jetMaterial);plume.scale.set(size,1,size);plumes.push({plume,size});
    }
    for(const s of [-1,1]){
      const arm=body(torso,s*1.10,.82,.05),forearm=body(arm,s*1.7,-.37,.13);
      const thigh=body(pelvis,s*.56,-1.23,0),shin=body(thigh,s*.72,-2.27,.28),boot=body(shin,s*.76,-3.51,.62);
      const cannon=body(torso,s*1.02,1.31,.57),fin=body(torso,s*.76,.72,.87);
      wing(head.skin,[[s*.3,1.89,-.1],[s*.54,1.89,.13],[s*.69,2.53,.39],[s*.45,2.17,-.02]],.042,gold);
      cyl(arm.skin,s*1.09,.78,0,.42,.42,.65,joint,'x');shell(arm.skin,s*1.49,.81,0,[[-.52,.43,.52],[-.17,.68,.77],[.37,.54,.69],[.64,.23,.47,.19,s*.12]],armor);
      plate(arm.skin,s*1.61,1.19,-.04,.94,.26,1.39,gold);plate(arm.skin,s*1.61,.19,.04,.67,.99,.64,steel);
      cyl(forearm.skin,s*1.71,-.37,.13,.29,.29,.59,joint,'x');plate(forearm.skin,s*1.82,-.87,.03,.77,1.15,.92,graphite);plate(forearm.skin,s*2.11,-.72,.01,.23,.89,.66,gold);
      plate(forearm.skin,s*1.78,-1.55,-.08,.53,.48,.54,armor);
      for(let i=0;i<4;i++){const f=box(forearm.skin,s*(1.59+i*.128),-1.81,-.13,.10,.33,.29,steel);f.rotation.x=-.22}
      cyl(thigh.skin,s*.56,-1.28,0,.29,.29,.57,joint,'x');
      shell(thigh.skin,s*.68,-1.65,.06,[[-.52,.32,.36,.23],[-.06,.42,.49],[.48,.36,.4,-.09]],armor);
      plate(shin.skin,s*.72,-2.24,.28,.77,.59,.81,gold);cyl(shin.skin,s*.72,-2.32,.38,.24,.24,.81,joint,'x');
      shell(shin.skin,s*.76,-2.96,.48,[[-.64,.29,.3,.28],[-.34,.42,.48,.16],[.39,.43,.49,-.04],[.62,.3,.33,-.09]],graphite);
      plate(shin.skin,s*.75,-2.98,.09,.36,1.06,.36,steel);plate(boot.skin,s*.76,-3.64,.46,.73,.44,1.36,armor);
      for(const [zz,rr,hh,mat] of [[1.08,.49,.84,brass],[1.4,.45,.48,graphite],[1.67,.36,.15,steel],[1.755,.285,.035,cyan]])cyl(torso.skin,s*.58,.25,zz,rr,rr*.94,hh,mat,'z');
      // Independent shoulder emitters and recessed muzzle lenses.
      plate(cannon.skin,s*1.03,1.49,.22,.78,.91,2.55,graphite);plate(cannon.skin,s*1.03,1.96,.52,.61,.18,1.68,gold);
      for(const [z,r,h,m] of [[-.66,.435,.68,steel],[-.99,.38,.24,brass],[-1.14,.315,.14,joint],[-1.22,.225,.04,rose]])cyl(cannon.skin,s*1.03,1.51,z,r,r,h,m,'z');
      for(let j=0;j<5;j++)box(cannon.skin,s*1.03,1.975,-.47+j*.24,.48,.055,.08,joint);
      wing(fin.skin,[[s*.78,.82,.9],[s*1.26,1.31,.65],[s*3.43,2.12,2.31],[s*2.76,1.24,2.47],[s*1.12,.54,1.6]],.085,armor);
      wing(fin.skin,[[s*1.16,.74,1.72],[s*2.18,1.22,2.22],[s*2.84,1.43,2.49],[s*2.46,.98,2.61],[s*1.32,.51,1.91]],.055,steel);
      wing(fin.skin,[[s*1.33,1.29,1.03],[s*3.15,1.98,2.23],[s*2.27,1.46,1.91]],.06,brass);
      for(let j=0;j<3;j++){const flap=box(fin.skin,s*(1.32+j*.23),.77+j*.09,1.85+j*.15,.27,.09,.44,graphite);flap.rotation.z=s*.34}
      wing(fin.skin,[[s*1.28,1.33,.68],[s*3.42,2.13,2.31],[s*2.87,1.82,2.1]],.09,gold);
      wing(fin.skin,[[s*.64,-.02,.96],[s*1.01,.3,1.24],[s*1.74,-.96,2.16],[s*.88,-.65,1.81]],.065,steel);
      for(let j=0;j<3;j++){box(arm.skin,s*1.5,.84-j*.16,.72,.59,.055,.04,brass);box(shin.skin,s*.72,-2.74-j*.16,1,.33,.055,.07,brass)}
      plate(arm.skin,s*1.48,.76,.72,.71,.56,.16,steel);box(arm.skin,s*1.52,.79,.82,.4,.055,.035,gold);
      cyl(cannon.skin,s*1.05,1.52,1.51,.32,.37,.25,steel,'z');cyl(cannon.skin,s*1.05,1.52,1.66,.22,.25,.08,joint,'z');
      for(let j=0;j<4;j++)box(cannon.skin,s*1.05,1.4+j*.076,1.71,.3,.026,.035,brass);
      plate(thigh.skin,s*.7,-1.66,.49,.68,.67,.36,graphite);cyl(thigh.skin,s*.63,-1.91,.63,.09,.09,.66,steel);
      plate(shin.skin,s*.81,-3.1,.94,.54,.64,.43,armor);cyl(shin.skin,s*.81,-3.26,1.21,.19,.23,.32,steel,'z');cyl(shin.skin,s*.81,-3.26,1.38,.122,.144,.04,cyan,'z');
      for(let j=0;j<3;j++){box(torso.skin,s*.91,-.47-j*.14,.77,.38,.055,.11,steel)}
      for(const dx of [-.22,.22]){
        cyl(forearm.skin,s*1.82+dx,-.75,.42,.064,.08,.62,steel);
        cyl(shin.skin,s*.76+dx,-2.87,.92,.066,.073,.84,brass);
      }
      plate(arm.skin,s*1.63,1.05,.48,1.09,.41,.71,gold);
      plate(thigh.skin,s*.7,-1.71,.52,.65,.72,.25,steel);
      for(let j=0;j<4;j++)box(torso.skin,s*.25,.68-j*.17,1.06,.31,.07,.10,brass);
      for(let j=0;j<3;j++){
        const x=1.30+j*.53,y=.78+j*.24,z=1.44+j*.25;
        wing(fin.skin,[[s*x,y+.3,z],[s*(x+.64),y+.61,z+.43],[s*(x+.95),y+.64,z+.88],[s*(x+.59),y-.08,z+.71],[s*x,y-.19,z+.31]],.09,j===1?brass:armor);
        plate(forearm.skin,s*1.86,-.61-j*.23,.45,.67-j*.068,.28,.19,j===0?brass:armor);
      }
      plate(arm.skin,s*1.46,.76,.86,.78,.40,.21,armor);box(arm.skin,s*1.48,.82,.98,.45,.047,.04,hot);
      cyl(pelvis.skin,s*.41,-.66,.52,.09,.12,.65,steel);
      cyl(thigh.skin,s*.9,-1.55,.53,.12,.14,.71,brass);
      for(const dx of [-.27,.27])cyl(shin.skin,s*.76+dx,-3.18,.99,.07,.08,.5,steel);
      nozzle(torso,s*.58,.25,1.84,1.25,1.05);nozzle(boot,s*.76,-3.78,.89,.71,.63);
      const jet=flare(0x60dfff,1.4);socket(torso,s*.58,.25,1.85).add(jet);jets.push(jet);
      sides.push({s,arm,forearm,thigh,shin,boot,cannon,fin,
        hand:socket(forearm,s*1.8,-1.84,-.32),barrel:socket(cannon,s*1.03,1.51,-1.24),tip:socket(fin,s*3.27,1.99,2.29)});
    }
    bodies.forEach(n=>bake(n.skin));
    let thrust=0,brace=0,attack=0;
    function pose({dt,time,bank,climb,boost,fire,charge,beam,evade,hit}){
      const blend=1-Math.exp(-dt*10),wobble=Math.sin(time*2.4);
      thrust+=(boost-thrust)*blend;brace+=((beam>0?1:charge>0?1-charge/.9:0)-brace)*blend;
      attack+=(Number(fire)-attack)*blend;const tuck=evade>0?Math.sin(Math.PI*evade/.68):0;
      pelvis.pivot.position.y=-.83+.085*wobble;torso.pivot.rotation.set(-.13-.31*thrust+.21*brace+.18*hit,bank*.28,-bank*.23);
      head.pivot.rotation.set(.16+.19*climb,-bank*.54+.055*Math.sin(time*1.5),-.13*bank);
      for(const {plume,size} of plumes)plume.scale.y=size*(1.6+thrust*3.8+tuck*1.7)*(.91+.09*Math.sin(time*36));
      for(const limb of sides){
        const {s,arm,forearm,thigh,shin,boot,cannon,fin}=limb, swing=Math.sin(time*2.2+s*1.1),inside=s*bank;
        arm.pivot.rotation.set(.12+.20*swing-.52*thrust+.61*attack+.30*brace,.09*s,s*(.29+.13*swing+.43*brace-.23*tuck+inside*.43));
        forearm.pivot.rotation.set(.31+.18*swing+.86*attack+.35*brace+.83*tuck-.18*thrust,.12*s,0);
        if(fire)forearm.pivot.rotation.x+=.18*Math.sin(time*33+s*1.57);
        thigh.pivot.rotation.set(.19+.27*swing-.36*thrust+.60*inside+tuck*(s>0?1.14:.52),0,s*(.12+.16*brace));
        shin.pivot.rotation.x=-.60-.24*swing-.48*thrust-.61*tuck-.19*inside;
        boot.pivot.rotation.x=.21+.15*swing+.38*thrust;
        fin.pivot.rotation.set(.08*Math.sin(time*2.8+s)-.24*brace,s*(.57*thrust+.39*tuck-.29*brace),s*(inside*.38+.36*brace));
        cannon.pivot.rotation.x=-.47+.38*brace+.09*thrust;
        cannon.pivot.position.z=.57-torso.origin.z+(beam>0?.23*Math.exp(-8*(1.45-beam)):0);
      }
    }
    g.userData={jets,sides,pose};return g}
  function drone(elite=false){const g=group();shell(g,0,0,0,[[-.69,.76,1.94],[-.15,1.16,3.02],[.41,.78,2.42],[.81,.36,1.15,.3]],elite?red:armor);
    plate(g,0,.51,-.49,1.19,.54,1.8,joint);box(g,0,.61,-1.28,.65,.11,.24,rose);
    for(const s of [-1,1]){wing(g,[[s*.6,0,-1.54],[s*1.24,.19,-1.37],[s*4.6,.09,1.46],[s*3.99,-.16,2.04],[s*.78,-.2,1.28]],.1,elite?brass:white);
      wing(g,[[s*.65,.28,1.18],[s*1.12,.41,.88],[s*1.8,1.65,2.42],[s*1.11,.48,2.4]],.08,red);
      cyl(g,s*.73,-.03,1.86,.42,.46,1.29,graphite,'z');cyl(g,s*.73,-.03,2.53,.28,.28,.07,hot,'z')}
    return bake(g)}
  function carrier(){const g=group();shell(g,0,0,0,[[-4.1,3.1,14,1],[-2.2,6.1,17.2],[.6,6.8,17.8],[2.1,5.35,14.1,.7]],armor);plate(g,0,2,.2,7.5,1.8,20,steel);
    plate(g,0,4,3.2,6.4,3.7,7.3,graphite);plate(g,0,6,3.4,4.1,1.2,5.3,armor);box(g,0,5.69,.89,3.33,.35,.21,rose);cyl(g,0,7.7,4,.12,.23,3.5,steel);cyl(g,0,9.45,4,.2,.16,.32,rose);
    for(const s of [-1,1]){wing(g,[[s*4,0,-9],[s*7,.3,-10],[s*17,-.5,4.8],[s*15,-.4,10.5],[s*4,.1,8.6]],.78,graphite);
      for(const z of [-5,7]){plate(g,s*11,0,z,5,3.4,7.6,armor);cyl(g,s*11,-1.8,z,1.7,2.05,1.5,brass);cyl(g,s*11,-2.65,z,1.5,1.65,.22,cyan)}
      for(let j=0;j<9;j++)box(g,s*5.43,1.2,-10+j*2.6,.28,.37,1.1,j%3?hot:rose);
      for(const z of [-9,0,9]){plate(g,s*3.9,2.1,z,2.6,1.4,3,joint);cyl(g,s*3.9,3.1,z-.9,.57,.65,4.4,brass,'z');cyl(g,s*3.9,3.1,z-3.13,.38,.38,.12,rose,'z')}
      for(let j=0;j<6;j++){const zz=-11+j*4.3;plate(g,s*6.35,-.36,zz,1.3,2.7,2.9,j%3?steel:brass);box(g,s*7.04,-.4,zz,.1,.23,1.95,hot)}
      for(let j=0;j<4;j++){box(g,s*3.02,4.88,.6+j*1.25,.22,.4,.97,cyan);box(g,s*3.4,-1.2,15.9,.19,2.5,2.6,brass)}
      cyl(g,s*3,-.65,16.4,1.48,1.8,3.5,steel,'z');cyl(g,s*3,-.65,18.24,1.02,1.16,.28,cyan,'z');
      wing(g,[[s*4,1.6,8.4],[s*5.6,2.2,8.6],[s*7.2,6.4,15.7],[s*5.8,1.9,14.6]],.17,steel)}
    plate(g,0,-.7,-16.7,5.8,1.9,3.1,brass);box(g,0,-.61,-18.24,3.2,.34,.11,rose);
    return bake(g)}
  return {mech,drone,carrier,flare,coat,box,cyl,plate,bake};
})();
