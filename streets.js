/* Street scenery is rebuilt around the pilot on block boundaries. Traffic and
   pedestrian phases use world coordinates, so adjacent blocks join seamlessly. */
const CityStreets=(()=>{
  const T=THREE, halfTurn=Math.PI, quarterTurn=Math.PI/2;
  const mod=(n,m)=>((n%m)+m)%m;
  function hash(x,z,salt=0){
    let h=Math.imul(x^0x34569,73856093)^Math.imul(z,19349663)^Math.imul(salt,83492791);
    h=Math.imul(h^(h>>>16),0x45d9f3b);return (h^(h>>>16))>>>0;
  }
  const box=new T.BoxGeometry(),wheel=new T.CylinderGeometry(.5,.5,1,10),leaves=new T.IcosahedronGeometry(.52,0);
  function prototype(assemble){
    const positions=[],normals=[],colors=[],stride=[],color=new T.Color(),transform=new T.Object3D();
    function part(x,y,z,w,h,d,tint,shape=box,roll=0,swing=0){
      const geo=shape.index?shape.toNonIndexed():shape.clone();transform.position.set(x,y,z);transform.rotation.set(0,0,roll);transform.scale.set(w,h,d);transform.updateMatrix();geo.applyMatrix4(transform.matrix);
      positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);color.set(tint);
      for(let i=0;i<geo.attributes.position.count;i++){colors.push(color.r,color.g,color.b);stride.push(swing)}
      geo.dispose();
    }
    assemble(part);const geo=new T.BufferGeometry();
    for(const [key,data,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['stride',stride,1]])geo.setAttribute(key,new T.Float32BufferAttribute(data,size));
    return geo;
  }
  function vehicle(kind){
    const bus=kind==='bus',van=kind==='van',taxi=kind==='taxi';
    const w=bus?2.55:van?2.2:1.95,d=bus?11:van?5.7:4.7;
    const paint=bus?0x4db8ad:taxi?0xf1b64e:van?0xe0dac6:kind==='red'?0xbb6558:0x8296a8;
    return prototype(p=>{
      p(0,.46,0,w*.93,.46,d*.95,0x273138);p(0,.88,0,w,.69,d,paint);
      if(bus||van){
        p(0,1.74,0,w*.97,1.23,d*.97,bus?0x344c53:paint);p(0,2.47,0,w,.24,d,paint);
        p(0,1.84,d*.493,w*.88,.86,.06,0x44616a);
        if(bus){for(let z=-4.6;z<5;z+=1.45)p(0,1.83,z,w,1.13,.13,paint);p(0,2.23,d*.5,w*.64,.2,.08,0xffcc77)}
        else p(0,1.79,d*.27,w*1.01,.78,1.72,0x455f67);
      }else{
        p(0,1.39,-.12,w*.87,.63,d*.51,0x354f59);p(0,1.76,-.16,w*.81,.15,d*.43,paint);
        p(0,1.37,-.2,w*.89,.60,.13,paint);if(taxi)p(0,1.94,-.2,.71,.24,.38,0xffdf90);
      }
      for(const side of [-1,1])for(const axle of [-1,1])p(side*w*.475,.5,axle*d*.32,.91,.22,.91,0x22272b,wheel,quarterTurn);
      for(const side of [-1,1]){p(side*w*.34,.95,d*.506,.36,.23,.09,0xffedd1);p(side*w*.34,.94,-d*.506,.33,.2,.09,0xff5d4f)}
    });
  }
  function pedestrian(){
    return prototype(p=>{
      p(0,1.15,0,.53,.65,.32,0xdfdbcf);p(0,1.73,0,.32,.36,.30,0xe0b79a);
      p(0,1.91,-.015,.34,.09,.33,0x4f423b);
      for(const s of [-1,1]){p(s*.147,.42,0,.185,.80,.21,0x364357,box,0,s);p(s*.313,1.11,0,.14,.56,.19,0xb7a890,box,0,-s*.45)}
    });
  }
  function signTexture(){
    const c=document.createElement('canvas');c.width=1024;c.height=256;
    const g=c.getContext('2d'),names=['麦街烘焙','巷口便利','赤亭面馆','星野书屋'],ink=['#865437','#16615e','#862e2b','#243c55'];
    const subtitles=['BAKERY','MARKET','NOODLES','BOOKS'];
    for(let i=0;i<4;i++){
      const x=i*256;g.fillStyle=ink[i];g.fillRect(x,0,256,256);g.strokeStyle='#efd5a6';g.lineWidth=3;g.strokeRect(x+10,10,236,236);
      g.textAlign='center';g.fillStyle='#ffe3ae';g.font='bold 65px "Microsoft YaHei", sans-serif';
      g.fillText(names[i].slice(0,2),x+128,100);g.fillText(names[i].slice(2),x+128,175);g.font='22px sans-serif';g.fillText(subtitles[i],x+128,218);
    }
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
  }
  function glowMap(){
    const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
    r.addColorStop(0,'rgba(255,227,173,.63)');r.addColorStop(.46,'rgba(255,195,124,.21)');r.addColorStop(1,'rgba(255,185,112,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new T.CanvasTexture(c);
  }
  function build(scene,block){
    const dummy=new T.Object3D(),color=new T.Color();
    const solid=new T.MeshStandardMaterial({metalness:.18,roughness:.68}),painted=new T.MeshStandardMaterial({vertexColors:true,metalness:.20,roughness:.53});
    const light=new T.MeshBasicMaterial({toneMapped:false}),peopleMat=new T.MeshLambertMaterial({vertexColors:true});
    const clock={value:0};peopleMat.onBeforeCompile=shader=>{
      shader.uniforms.streetClock=clock;shader.vertexShader='attribute float stride; uniform float streetClock;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float gait=sin(streetClock*6.+dot(instanceMatrix[3].xz,vec2(.7,.2)));
        transformed.z+=stride*gait*.24*clamp(1.-position.y*.64,0.,1.);
      `);
    };
    const facade=new T.TextureLoader().load(window.STREET_SHOPS);facade.colorSpace=T.SRGBColorSpace;
    const shopMat=new T.MeshBasicMaterial({map:facade,color:0xfff0d8}),signMat=new T.MeshBasicMaterial({map:signTexture(),side:T.DoubleSide});
    const moving=[],fixed=[];
    function batch(geometry,material,capacity,animated=false){
      const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);
      (animated?moving:fixed).push(mesh);return mesh;
    }
    function put(mesh,x,y,z,angle=0,w=1,h=1,d=1,tint){
      const i=mesh.count++;dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(w,h,d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      if(tint!==undefined){color.set(tint);mesh.setColorAt(i,color)}
    }
    function upload(list){for(const mesh of list){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true}}
    const street=batch(box,solid,9500),bulb=batch(box,light,3400),trees=batch(leaves,solid,1100);
    const terrace=prototype(p=>{
      p(0,.82,0,1.65,.14,1.65,0xb79b78,wheel);p(0,1.5,0,.12,3,.12,0x827668);
      const shade=new T.ConeGeometry(.5,1,8);p(0,3.0,0,4.2,.78,4.2,0xdba16d,shade);shade.dispose();
      for(const z of [-1.18,1.18]){p(0,.29,z,.14,.58,.14,0x69716b);p(0,.63,z,.7,.12,.62,0xa2a388)}
    });
    const tables=batch(terrace,painted,400);
    const poolGeometry=new T.PlaneGeometry();poolGeometry.rotateX(-quarterTurn);
    const pools=batch(poolGeometry,new T.MeshBasicMaterial({map:glowMap(),transparent:true,depthWrite:false,blending:T.AdditiveBlending}),1200);
    function tiles(material){
      return Array.from({length:4},(_,i)=>{const geo=new T.PlaneGeometry();const uv=geo.attributes.uv;
        for(let j=0;j<uv.count;j++)uv.setX(j,(i+.006+uv.getX(j)*.988)/4);
        return batch(geo,material,640)});
    }
    const fronts=tiles(shopMat),blades=tiles(signMat);
    const carTypes=['sedan','red','taxi','van','bus'];
    const person=pedestrian(),waiting=batch(person,painted,500);
    const cars=carTypes.map(kind=>batch(vehicle(kind),painted,600,true)),walkers=batch(person,peopleMat,1900,true);
    const signalDots=batch(box,light,480,true),lights=[],routes=[];
    const coats=[0xebc8a5,0x78b5ab,0xcfa5a4,0x8899c2,0xa5abb3,0xb7a376];
    const awnings=[0xbb8258,0x318b83,0xb45547,0x58708d];
    let cellX=NaN,cellZ=NaN,lastMotion=-1;
    function populate(cx,cz){
      for(const m of fixed)m.count=0;lights.length=0;routes.length=0;
      for(let i=cx-3;i<=cx+3;i++)for(let j=cz-3;j<=cz+3;j++){
        for(const east of [false,true]){
          const turn=east?quarterTurn:0,ox=i*block,oz=j*block;
          // Local +Z follows the avenue. Its two pavements are at local ±X.
          const wx=(side,along)=>ox+(east?along:side),wz=(side,along)=>oz+(east?-side:along);
          const place=(mesh,side,y,along,angle,w,h,d,tint)=>put(mesh,wx(side,along),y,wz(side,along),turn+angle,w,h,d,tint);
          const seed=hash(i,j,east?1:2);
          routes.push({i,j,east,turn,ox,oz,seed});
          for(const s of [-1,1]){
            const k=(seed+(s+1)*11)%4,accent=awnings[k],face=-s*quarterTurn;
            const stop=(seed+(s+1)*5)%4===0||(!east&&i===0&&s===1&&j%3===1);
            for(const a of [35,93,148]){
              place(street,s*19.2,4.8,a,0,.32,9.6,.32,0x535d62);
              place(street,s*17.5,9.5,a,0,3.7,.25,.4,0x586970);
              place(bulb,s*15.8,9.35,a,0,1.35,.23,.65,0xffdc9e);
              place(pools,s*15,.08,a,0,10,1,14);
            }
            for(const a of [41,130]){
              place(street,s*24,.38,a,0,3.4,.76,4.4,0x929187);place(street,s*24,2.45,a,0,.44,4.1,.44,0x625346);
              place(trees,s*24,5,a,0,5.3,6.1,5.9,0x5b7155);
            }
            // Low continuous retail frontage and projecting signs are visible
            // from flight height as well as on the approach to a junction.
            if(!east||seed%3!==0){
              for(let n=0;n<2;n++){
                const a=73+n*19,id=(k+n)%4;
                place(street,s*34,4.6,a,0,10.6,9.2,18.7,0x526065);
                place(fronts[id],s*28.65,4.35,a-4.65,face,9.3,8.25,1);
                place(fronts[(id+1)%4],s*28.65,4.35,a+4.65,face,9.3,8.25,1);
                place(street,s*27.4,8.1,a,0,2.65,.42,18.9,awnings[id]);
                place(bulb,s*26.03,7.93,a,0,.12,.18,18.2,0xffc786);
                place(street,s*33.8,9.52,a,0,11.4,.58,18.9,0x788186);
                place(street,s*35,10.35,a+3.1,0,2.8,1.15,4,0x637078);
                if(id===0){place(tables,s*24.4,0,a-3,0,1,1,1);place(tables,s*24.4,0,a+3.2,.45,1,1,1)}
              }
              place(street,s*26.7,11.5,62.9,0,4.2,7.6,.6,accent);
              place(blades[k],s*26.7,11.5,63.26,0,4,7.4,1);
              place(blades[k],s*26.7,11.5,62.54,halfTurn,4,7.4,1);
              place(pools,s*26,.1,83,0,8.5,1,33);
            }
            if(stop){
              for(const a of [112,122])place(street,s*23.7,1.85,a,0,.22,3.7,.22,0x71838b);
              place(street,s*22.3,3.72,117,0,3.9,.38,12.3,0x447979);
              place(bulb,s*20.3,3.5,117,0,.22,.17,11.9,0xb5eee0);place(street,s*22.5,.76,117,0,1.15,.37,6.5,0xa78e71);
              place(street,s*21.4,2.64,125.6,0,.17,5.2,.22,0x536469);place(bulb,s*21.4,4.7,125.6,0,.63,1.22,1.45,0x87dbca);
              for(let n=0;n<3;n++)place(waiting,s*(21.3+n%2*.55),.16,113.5+n*2.1,face+n*.28,1,1,1,coats[(seed+n)%coats.length]);
            }
            if(!east&&seed%4===1){
              for(let n=0;n<3;n++){const a=137+n*6;
                place(street,s*29,1.05,a,0,3.3,2.1,4.6,0xb3986e);place(street,s*29,3.45,a,0,4.6,.48,5.25,awnings[(k+n)%4]);
                for(const dz of [-1.8,1.8])place(street,s*29,2.7,a+dz,0,.13,1.48,.13,0xc4af92);
                place(bulb,s*26.7,3.18,a,0,.15,.13,4.9,0xffc791);
              }
            }
            // An overhead head faces approaching vehicles in each direction.
            const along=s*19.6,side=s*19.4;
            place(street,side,3.8,along,0,.36,7.6,.36,0x62727a);place(street,s*13.6,7.55,along,0,12,.26,.30,0x68747c);
            place(street,s*8.4,6.85,along,0,.92,1.6,.48,0x253238);
            lights.push({x:wx(s*8.4,along+s*.27),z:wz(s*8.4,along+s*.27),turn,east});
          }
        }
      }
      upload(fixed);
    }
    function update(t,pilot){
      const cx=Math.floor(pilot.x/block),cz=Math.floor(pilot.z/block),changed=cx!==cellX||cz!==cellZ;
      if(changed){cellX=cx;cellZ=cz;populate(cx,cz)}
      if(!changed&&t>=lastMotion&&t-lastMotion<1/30)return;
      lastMotion=t;clock.value=t;for(const m of moving)m.count=0;
      for(const route of routes){
        const {i,j,east,turn,ox,oz,seed}=route,start=east?10:0,phase=mod(t-start,20),cycle=Math.floor((t-start)/20);
        for(const dir of [-1,1]){
          const angle=turn+(dir<0?halfTurn:0),flow=east?i:j,streetId=east?j:i;
          for(let slot=0;slot<3;slot++){
            const key=hash(flow-dir*cycle,streetId,slot+13*(dir+1)+(east?3:9));
            const lane=slot===2?13.2:7.9;
            const u=Math.min(1,Math.max(0,(phase-(slot===1?.95:0))/14.2));
            const travel=block*u*u*(3-2*u),along=dir*(travel-20.5-(slot===1?11:0)),side=-dir*lane;
            const x=ox+(east?along:side),z=oz+(east?-side:along);
            const type=slot===2&&key%9===0?4:key%7===0?3:key%4===0?2:key%3===0?1:0;
            put(cars[type],x,0,z,angle);
          }
          // Independent pavement streams, plus a small group at the crossing.
          for(let n=0;n<4;n++){
            const speed=.88+n*.19,loop=mod(t*speed+(seed%113)+n*34,240),out=loop<120;
            const along=27+(out?loop:240-loop),side=dir*(20.9+n%2*1.0);
            put(walkers,ox+(east?along:side),.16,oz+(east?-side:along),turn+(out?0:halfTurn),1,1,1,coats[(seed+n)%coats.length]);
          }
          // Cross the carriageway during the parallel traffic green, return on
          // the following green. Crossings sit beyond the perpendicular lanes.
          const walkPhase=mod(t-(east?0:10),20),leg=Math.floor((t-(east?0:10))/20);
          const u=Math.min(1,Math.max(0,(walkPhase-.35)/8.7)),side=(mod(leg,2)?1-2*u:2*u-1)*19.2,along=dir*16.2;
          put(walkers,ox+(east?along:side),.16,oz+(east?-side:along),turn+(mod(leg,2)?-quarterTurn:quarterTurn),1,1,1,coats[(seed+3)%coats.length]);
        }
      }
      for(const h of lights){
        const phase=mod(t-(h.east?10:0),20),green=phase<7.8,amber=!green&&phase<9;
        put(signalDots,h.x,green?6.36:amber?6.86:7.32,h.z,h.turn,.58,.37,.12,green?0x6df3b0:amber?0xffc254:0xff5751);
      }
      upload(moving);
    }
    return {update};
  }
  return {build};
})();
