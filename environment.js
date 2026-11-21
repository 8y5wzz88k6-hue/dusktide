const Airspace = (() => {
  const T=THREE;
  function build(scene,renderer){
    let seed=42113;function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
    const between=(a,b)=>a+(b-a)*rand();
    const fog=0xa39eaa;scene.background=new T.Color(fog);scene.fog=new T.FogExp2(fog,.00049);
    const hemi=new T.HemisphereLight(0xffdfc6,0x648198,1.35);scene.add(hemi);
    const sun=new T.DirectionalLight(0xffdbad,3.0);sun.position.set(-900,510,-1400);scene.add(sun);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-1700,right:1700,top:1200,bottom:-1200,near:25,far:4600});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00024;sun.shadow.normalBias=.85;
    sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;
    const rim=new T.DirectionalLight(0xa3d9ff,1.65);rim.position.set(350,250,550);scene.add(rim);
    if(window.SKY_IMAGE){new T.TextureLoader().load(window.SKY_IMAGE,texture=>{
      const img=texture.image,sky=document.createElement('canvas'),edge=document.createElement('canvas');sky.width=img.width;sky.height=img.height;edge.width=Math.round(img.width*.16);edge.height=img.height;
      const skyCtx=sky.getContext('2d'),edgeCtx=edge.getContext('2d');edgeCtx.translate(edge.width,0);edgeCtx.scale(-1,1);edgeCtx.drawImage(img,0,0);edgeCtx.resetTransform();
      const fade=edgeCtx.createLinearGradient(0,0,edge.width,0);fade.addColorStop(0,'transparent');fade.addColorStop(.5,'rgba(0,0,0,.5)');fade.addColorStop(1,'black');edgeCtx.globalCompositeOperation='destination-in';edgeCtx.fillStyle=fade;edgeCtx.fillRect(0,0,edge.width,edge.height);
      skyCtx.drawImage(img,0,0);skyCtx.drawImage(edge,sky.width-edge.width,0);texture.image=sky;texture.needsUpdate=true;texture.mapping=T.EquirectangularReflectionMapping;texture.colorSpace=T.SRGBColorSpace;scene.background=texture;scene.environment=texture;scene.backgroundBlurriness=0})}
    const block=176, limit=22, lots=new Map(), batches=new Map();
    const cube=new T.BoxGeometry(), drum=new T.CylinderGeometry(.5,.5,1,16), canopy=new T.IcosahedronGeometry(.5,1),dummy=new T.Object3D();
    const concrete=Hangar.coat(0xffffff,.24,.57),glass=Hangar.coat(0xffffff,.5,.26);
    const lamp=new T.MeshBasicMaterial({color:0xffffff}),curb=Hangar.coat(0xffffff,.10,.86);
    function add(shape,material,x,y,z,w,h,d,color){
      const key=shape.uuid+material.uuid;let batch=batches.get(key);
      if(!batch){batch={shape,material,items:[]};batches.set(key,batch)}
      dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.updateMatrix();
      batch.items.push([dummy.matrix.clone(),new T.Color(color)]);
    }
    const box=(...args)=>add(cube,...args);
    function register(x,z,w,d,base,top){
      const building={left:x-w/2,right:x+w/2,front:z-d/2,back:z+d/2,base,top};
      for(let i=Math.floor(building.left/block);i<=Math.floor(building.right/block);i++)
        for(let j=Math.floor(building.front/block);j<=Math.floor(building.back/block);j++){
          const key=i*128+j;if(!lots.has(key))lots.set(key,[]);lots.get(key).push(building);
        }
    }
    // Traverse only the street blocks touched by a segment. The same solids
    // constrain flight, camera placement, targeting and projectile impacts.
    function trace(a,b,pad=0){
      const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
      let nearest=1;
      const left=Math.floor((Math.min(a.x,b.x)-pad)/block),right=Math.floor((Math.max(a.x,b.x)+pad)/block);
      const front=Math.floor((Math.min(a.z,b.z)-pad)/block),back=Math.floor((Math.max(a.z,b.z)+pad)/block);
      for(let i=left;i<=right;i++)for(let j=front;j<=back;j++){
        const solids=lots.get(i*128+j);if(!solids)continue;
        for(const s of solids){
          let enter=0,exit=nearest;
          for(const [v,delta,lo,hi] of [[a.x,dx,s.left-pad,s.right+pad],[a.z,dz,s.front-pad,s.back+pad],[a.y,dy,s.base-pad,s.top+pad]]){
            if(Math.abs(delta)<.00001){if(v<lo||v>hi){exit=-1;break}}
            else{const u=(lo-v)/delta,t=(hi-v)/delta;enter=Math.max(enter,Math.min(u,t));exit=Math.min(exit,Math.max(u,t));if(enter>exit)break}
          }
          if(enter<=exit&&exit>=0)nearest=Math.min(nearest,enter);
        }
      }return nearest;
    }
    const officeTexture=new T.TextureLoader().load(window.OFFICE_FACADE);
    officeTexture.colorSpace=T.SRGBColorSpace;officeTexture.wrapS=officeTexture.wrapT=T.RepeatWrapping;
    officeTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    glass.onBeforeCompile=shader=>{
      shader.uniforms.uOffice={value:officeTexture};
      shader.vertexShader='varying vec2 vOfficeUV; varying float vWall;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 dim=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        float shapeWidth=abs(normal.x)>.5?dim.z:dim.x;
        if(abs(normal.x)>.01 && abs(normal.z)>.01)shapeWidth=3.05*dim.x;
        float seed=fract(sin(dot(instanceMatrix[3].xz,vec2(.131,.187)))*1793.);
        vOfficeUV=uv*vec2(shapeWidth/(48.+seed*12.),dim.y/(36.+seed*8.))+vec2(seed,seed*.62);
        vWall=1.-abs(normal.y);`);
      shader.fragmentShader='uniform sampler2D uOffice; varying vec2 vOfficeUV; varying float vWall;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 office=texture2D(uOffice,vOfficeUV).rgb;
        diffuseColor.rgb*=mix(vec3(1.),vec3(.24)+office*1.35,vWall);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        totalEmissiveRadiance+=office*vWall*.94;`);
    };
    // A tile is a full modern city block. Its borders meet at road junctions.
    const tile=document.createElement('canvas');tile.width=tile.height=512;const pen=tile.getContext('2d');
    pen.fillStyle='#343b42';pen.fillRect(0,0,512,512);pen.fillStyle='#626465';pen.fillRect(53,53,406,406);
    pen.fillStyle='#4c5155';pen.fillRect(60,60,392,392);
    for(let i=0;i<11000;i++){pen.fillStyle=rand()>.5?'#ffffff0b':'#00000010';pen.fillRect(rand()*512,rand()*512,1.6,1.6)}
    pen.save();pen.beginPath();pen.rect(53,53,406,406);pen.clip();
    pen.strokeStyle='#242e372c';pen.lineWidth=.8;pen.beginPath();
    for(let n=53;n<=459;n+=12){pen.moveTo(n,53);pen.lineTo(n,459);pen.moveTo(53,n);pen.lineTo(459,n)}
    pen.stroke();pen.strokeStyle='#d1c6a44a';pen.lineWidth=2;pen.strokeRect(63,63,386,386);pen.restore();
    for(let axis=0;axis<2;axis++){pen.save();if(axis){pen.translate(512,0);pen.rotate(Math.PI/2)}
      for(const x of [2,510]){pen.fillStyle='#b39e66';pen.fillRect(x,52,1.5,408)}
      for(const x of [18,35,478,494])for(let z=66;z<450;z+=29){pen.fillStyle='#b3b5af';pen.fillRect(x,z,1.4,13)}
      for(const x of [5,468])for(const z of [40,465])for(let k=0;k<7;k++){pen.fillStyle='#cacac1';pen.fillRect(x+k*5.5,z,3.1,8)}
      for(const x of [10,27,44]){
        pen.fillStyle='#c4c6b9';pen.fillRect(x-1.2,78,2.4,14);pen.beginPath();
        pen.moveTo(x-3.8,79);pen.lineTo(x,72);pen.lineTo(x+3.8,79);pen.fill();
      }
      pen.fillStyle='#bbbfb3';pen.fillRect(4,61,46,2.2);
      for(let z=71;z<447;z+=15){pen.fillStyle='#aa9d66';pen.fillRect(51,z,1.6,8)}
      for(const z of [134,339]){pen.strokeStyle='#1f292e';pen.lineWidth=1.4;pen.beginPath();pen.arc(40,z,2.3,0,Math.PI*2);pen.stroke()}
      pen.restore();
    }
    const roadMap=new T.CanvasTexture(tile);roadMap.colorSpace=T.SRGBColorSpace;roadMap.wrapS=roadMap.wrapT=T.RepeatWrapping;roadMap.repeat.set(128,128);roadMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const ground=new T.Mesh(new T.PlaneGeometry(128*block,128*block),new T.MeshStandardMaterial({map:roadMap,roughness:.78}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    const palette=[0x647b89,0x485e71,0x698483,0x52677c,0x8a8684,0x58697a,0x827d76,0x445461];
    function tower(x,z,w,d,h,type,detail){
      const c=palette[Math.floor(rand()*palette.length)],base=between(10,21);
      const round=type===3,shape=round?drum:cube;
      box(concrete,x,base/2,z,w+5,base,d+5,0x586068);register(x,z,w+5,d+5,0,base);
      add(shape,glass,x,(h+base)/2,z,w,h-base,d,c);register(x,z,w,d,base,h);
      add(shape,concrete,x,h,z,w+.8,2.2,d+.8,0x68747a);
      if(type===1||type===4){
        const crown=h*(type===4?.29:.15);add(shape,glass,x,h+crown/2,z,w*.7,crown,d*.76,c);register(x,z,w*.7,d*.76,h,h+crown);
        add(shape,lamp,x,h+crown,z,w*.71,1.1,d*.77,type===4?0xf5c79d:0x9dded7);
        if(type===4){box(concrete,x,h+crown+12,z,1.3,24,1.3,0x737c80);box(lamp,x,h+crown+24,z,1.5,1.5,1.5,0xff7660)}
      }
      if(!detail)return;
      if(!round&&type%2===0){for(const s of [-1,1])for(const k of [-1,1])box(concrete,x+s*(w/2-.7),h*.53,z+k*(d/2-.6),1.8,h*.94,1.9,0x73818a)}
      if(type===2)for(let y=40;y<h-10;y+=44)box(concrete,x,y,z,w+1.6,2.4,d+1.6,0x6a7074);
      if(type===0||round){const rh=between(3,9);box(concrete,x,h+rh/2,z,w*.42,rh,d*.47,0x737679)}
      if(h>200&&!round){for(const s of [-1,1])box(lamp,x+s*(w/2-.6),h*.74,z+d/2+.2,.68,h*.46,.7,type%2?0xf3b778:0x86c4cd)}
      if(Math.abs(x)<1200&&Math.abs(z)<1500){
        const front=z+d/2+2.58;
        for(let j=0;j<5;j++){const xx=x+(j-2)*w*.18;
          box(glass,xx,4.2,front,w*.153,6.8,.7,0x7e8989);
          box(lamp,xx,8.45,front,w*.158,.45,1.1,j%3?0xedce95:0xa9d8d1);
        }
        box(concrete,x,9.6,front+1,w+5,.75,4.4,0x93958e);
        for(const s of [-1,1]){const tx=x+s*(w*.32),tz=front+5.2;box(curb,tx,.55,tz,6,1.1,4,0x8b8b7b);box(curb,tx,2.4,tz,.6,3.9,.6,0x625646);add(canopy,curb,tx,6,tz,5.2,6.1,5.2,0x465c50)}
      }
    }
    for(let i=-limit;i<limit;i++)for(let j=-limit;j<limit;j++){
      const cx=(i+.5)*block,cz=(j+.5)*block,dist=Math.hypot(cx,cz);
      const inner=dist<1950,near=dist<3200,majorX=i%4===0?1:(i+1)%4===0?-1:0,majorZ=j%4===0?1:(j+1)%4===0?-1:0;
      const x=cx+majorX*12,z=cz+majorZ*12;
      const district=(1+Math.sin(cx*.0025)*Math.cos(cz*.002))*.5;
      const h=(near?between(112,272):between(82,195))*(.79+district*.39);
      if(i===1&&j===1){
        for(const xx of [222,306]){tower(xx,260,47,79,316,4,true);box(concrete,xx,368,260,9,90,12,0x667887)}
        box(glass,264,236,260,82,10,15,0x657880);box(lamp,264,230.8,267.6,83,1,1,0xffc58e);register(264,260,84,16,230,242);
      }else if(i===-1&&j===1){
        tower(x,z,68,62,248,3,true);add(drum,concrete,x,258,z,77,9,70,0x596479);add(drum,glass,x,267,z,73,12,65,0x6e838c);register(x,z,77,70,245,274);
        box(concrete,x,302,z,3.1,68,3.1,0xb4a89c);box(lamp,x,337,z,2.1,2.1,2.1,0xff6149);
      }else if(inner&&rand()<.38&&majorX===0){
        tower(x-29,z+between(-4,5),39,between(53,78),h*.86,Math.floor(rand()*5),true);
        tower(x+31,z+between(-7,4),39,between(50,78),h*1.16,Math.floor(rand()*5),true);
      }else tower(x+between(-5,5),z+between(-5,5),between(57,85),between(57,83),h*(inner&&rand()<.15?1.6:1),Math.floor(rand()*5),near);
    }
    // Elevated transit line under flight altitude, with lit, moving carriages.
    box(glass,0,61,259,234,7.8,12,0x8b9fa4);register(0,259,234,12,56,66);
    for(const y of [56.8,65.2])box(concrete,0,y,259,234,1.45,13.1,0x829093);
    box(lamp,0,56.9,265.7,233,.48,.6,0xffc27c);
    box(concrete,-22,16,0,9,2.5,6500,0x59656c);
    for(const x of [-26, -18])box(concrete,x,17.6,0,.8,1.8,6500,0x8b9290);
    for(let z=-3150;z<=3150;z+=70)box(concrete,-22,7.8,z,3.3,15.6,5,0x686a69);
    // The elevated station overlooks the street where the player enters.
    for(const side of [-1,1]){
      const x=-22+side*7.6;box(concrete,x,17.05,515,5.6,1.1,92,0x879399);
      box(lamp,x-side*2.6,17.64,515,.30,.06,91,0xe5c382);
      for(let n=-2;n<=2;n++){const z=515+n*17;
        box(concrete,x+side*1.8,20.8,z,.46,6.2,.5,0x73878d);
        box(concrete,x,24,z,6.6,.65,16.1,0x578183);
        box(lamp,x-side*2.8,23.6,z,.28,.18,15.9,0xd1ece0);
      }
    }
    const train=new T.Group();for(let i=0;i<6;i++){Hangar.plate(train,0,0,i*13,5.1,3.8,12,Hangar.coat(0xb1b2ab));Hangar.box(train,0,.25,i*13,5.2,1.2,10.5,new T.MeshBasicMaterial({color:0xf1c595}))}
    Hangar.bake(train);scene.add(train);train.position.set(-22,19.3,0);
    for(const b of batches.values()){const mesh=new T.InstancedMesh(b.shape,b.material,b.items.length);b.items.forEach(([m,c],i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,c)});mesh.castShadow=b.material!==lamp;mesh.receiveShadow=b.material!==lamp;scene.add(mesh)}
    const streets=CityStreets.build(scene,block);
    function update(t,position){train.position.z=((t*24+1540)%3600)-1800;streets.update(t,position)}
    return {block,trace,update};
  }
  return {build};
})();
