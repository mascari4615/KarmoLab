import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { spherePoint, sphereUV, clamp } from './world.mjs';
import { sampleFilteredHeight as sampleHeight } from './terrain.mjs';
import { createDetailFields, detailGLSL } from './detail-fields.mjs';
import { intersectSurface } from './surface-ray.mjs';
import { sampleMeshHeight, sampleGlobeMeshHeight } from './detail.mjs';
import { createFields, fieldGLSL } from './fields.mjs';
import { createWeather, weatherGLSL } from './sky.mjs';
import { gradientNoise } from './landform.mjs';

export function createPlanet(container,world,onChange,brush,brushSettings=()=>null,display={}){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x071723,0);container.append(renderer.domElement);
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','행성. 드래그로 회전. 편집 모드에서 지형 칠하기');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.00005,100);camera.position.set(...spherePoint(.30,.34,4.25));
  const renderCamera=camera.clone();
  const fields=createFields({surface:true});let weather=createWeather(world.seed,status=>{invalidate();container.dataset.weather=status;}),weatherSeed=world.seed;
  const uniforms={elevationField:{value:null},colorField:{value:null},fieldSize:{value:new THREE.Vector2()},seaLevel:{value:0},snowLevel:{value:.34},seed:{value:world.seed},relief:{value:1},weatherField:{value:weather},time:{value:0},cloudAmount:{value:world.clouds},sunDirection:{value:new THREE.Vector3()},atmosphereRadius:{value:1.035},terrainShading:{value:1},dayNight:{value:1},cloudShadows:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,
    vertexShader:`${fieldGLSL}\n${detailGLSL}\nuniform float relief;uniform float patchSurface;varying vec3 p;
    void main(){p=normalize(position);float h=max(0.,surfaceHeightAt(globeUV(p))-seaLevel);gl_Position=projectionMatrix*modelViewMatrix*vec4(p*(1.+h*.008*relief+patchSurface*.0000002),1.);}`,
    fragmentShader:`${fieldGLSL}\n${detailGLSL}\n${weatherGLSL}\nuniform float relief;uniform float terrainShading;uniform float dayNight;uniform float cloudShadows;uniform float patchSurface;varying vec3 p;
    void main(){vec3 q=normalize(p);vec2 uv=globeUV(q);if(patchSurface<.5&&detailWeight(uv)>.99)discard;float h=surfaceHeightAt(uv);vec3 n=q;vec3 color;
      bool sea=h<=seaLevel;
      if(sea){float shelf=exp((h-seaLevel)*14.);color=mix(vec3(.025,.105,.17),vec3(.19,.43,.43),shelf);}
      else{
        color=surfaceColorAt(uv);vec2 gradient=surfaceGradientAt(uv);float gx=gradient.x,gy=gradient.y;
        float slope=length(gradient)*.008;
        float footprint=length(fwidth(uv)*vec2(18000.,9000.));
        float grain=mix(.5,fieldNoise(uv*vec2(18000.,9000.)),1.-smoothstep(.5,1.5,footprint));
        float strata=fieldNoise(uv*vec2(2100.,1050.))*.6+grain*.4;
        float rock=smoothstep(.30,.80,slope)*smoothstep(.004,.018,h-seaLevel);
        vec3 stone=mix(vec3(.28,.29,.28),vec3(.51,.48,.41),strata);
        color=mix(color,stone,rock);color*=.96+grain*.06;
        float snowWidth=min(.035,snowLevel*.18);
        float snow=smoothstep(snowLevel+fieldNoise(uv*vec2(120.,60.))*.06,snowLevel+snowWidth+.06,h-seaLevel)*(1.-smoothstep(.35,1.3,slope));
        color=mix(color,vec3(.78,.83,.85)*(1.-grain*.035),snow);
        vec3 east=length(q.xz)>.001?normalize(vec3(q.z,0.,-q.x)):vec3(1.,0.,0.),south=cross(east,q);
        float reliefLight=mix(.008,.055,smoothstep(.4,1.2,length(cameraPosition)-1.));
        n=normalize(q-(east*gx+south*gy)*reliefLight*relief*smoothstep(.015,.15,length(q.xz))*smoothstep(.005,.025,h-seaLevel));
        vec2 microScale=vec2(1500000.,750000.);float microVisible=1.-smoothstep(.5,1.5,length(fwidth(uv)*microScale));
        if(microVisible>.01){vec3 micro=fieldNoiseGradient(uv*microScale);n=normalize(n-(east*micro.y+south*micro.z)*(.04+.16*rock)*(1.-snow*.75)*microVisible);color*=1.+(micro.x-.5)*.09*microVisible;}
      }
      float facing=dot(q,sunDirection);
      vec3 inspectionEast=length(q.xz)>.001?normalize(vec3(q.z,0.,-q.x)):vec3(1.,0.,0.);
      vec3 inspectionLight=normalize(q*.45-inspectionEast*.6-cross(inspectionEast,q)*.6);
      float localShade=mix((.26+.74*clamp(dot(n,inspectionLight)/max(.3,dot(q,inspectionLight)),0.,1.5)),clamp(dot(n,sunDirection)/max(.2,facing),.12,1.5),dayNight);
      float daylight=mix(1.,max(0.,facing),dayNight)*mix(1.,localShade,terrainShading);
      float shadow=cloudAt(q+sunDirection*.026)*.42*mix(1.,smoothstep(-.05,.2,facing),dayNight)*cloudShadows;
      vec3 light=vec3(.045,.065,.085)+vec3(1.05,1.02,.94)*daylight*(1.-shadow);
      vec3 result=pow(color,vec3(2.2))*light;
      vec3 view=normalize(cameraPosition-q);
      if(sea){vec3 halfV=normalize(sunDirection+view);float glint=pow(max(0.,dot(n,halfV)),110.)*.06*max(0.,facing)*(1.-shadow);result+=vec3(1.,.92,.76)*glint;}
      float rim=pow(1.-max(0.,dot(q,view)),3.)*smoothstep(-.15,.4,facing);result+=vec3(.010,.035,.075)*rim;
      gl_FragColor=vec4(result,1.);
      #include <colorspace_fragment>
    }`});
  const globe=new THREE.Mesh(new THREE.SphereGeometry(1,192,128),material);globe.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.1);scene.add(globe);
  uniforms.patchSurface={value:0};
  const patchSegments=384,patchGeometry=new THREE.PlaneGeometry(1,1,patchSegments,patchSegments),patchMaterial=material.clone();
  patchMaterial.uniforms={...uniforms,patchSurface:{value:1}};
  const patch=new THREE.Mesh(patchGeometry,patchMaterial);patch.frustumCulled=false;patch.visible=false;scene.add(patch);
  let visibleDetail=null,patchBoundsKey='';
  const surfaceAt=(u,v)=>patch.visible&&visibleDetail?sampleMeshHeight(world,visibleDetail,u,v,patchSegments):sampleGlobeMeshHeight(world,uniforms.detailEnabled.value?visibleDetail:null,u,v);
  const detail=createDetailFields(uniforms,data=>{
    if(data.error){patch.visible=false;invalidate();return;}
    visibleDetail=data;const [cx,cy,w,h]=data.bounds,positions=patchGeometry.attributes.position;
    const key=data.bounds.join(':');
    if(key!==patchBoundsKey){patchBoundsKey=key;
    for(let y=0;y<=patchSegments;y++)for(let x=0;x<=patchSegments;x++){
      const point=spherePoint(cx+(x/patchSegments-.5)*w,clamp(cy+(y/patchSegments-.5)*h,0,1));
      positions.setXYZ(y*(patchSegments+1)+x,...point);
    }
    positions.needsUpdate=true;}
    patch.visible=true;container.dataset.detailMs=data.elapsed.toFixed(1);container.dataset.detailSpan=data.bounds[2].toString();
    const center=(Math.floor(data.size/2)*data.size+Math.floor(data.size/2))*4;container.dataset.detailHeight=data.pixels[center].toFixed(4);invalidate();
  },renderer);
  patchMaterial.uniforms={...uniforms,patchSurface:{value:1}};
  const ringPositions=new Float32Array(64*3),ringGeometry=new THREE.BufferGeometry();ringGeometry.setAttribute('position',new THREE.BufferAttribute(ringPositions,3));
  const brushRing=new THREE.LineLoop(ringGeometry,new THREE.LineBasicMaterial({color:0xffedbb,transparent:true,opacity:.9,depthWrite:false}));brushRing.frustumCulled=false;brushRing.visible=false;scene.add(brushRing);
  const cloudMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
    vertexShader:'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`${fieldGLSL}\n${weatherGLSL}\nuniform float dayNight;varying vec3 p;
    void main(){vec3 q=normalize(p);float density=cloudAt(q);if(density<.008)discard;
      float slope=cloudAt(q+sunDirection*.008)-density;
      float fine=fieldNoise(globeUV(q)*vec2(900.,450.));density*=.85+fine*.15;
      float light=.055+mix(1.,max(0.,dot(q,sunDirection)),dayNight)*(.74-slope*1.8);
      vec3 color=vec3(.92,.96,1.)*light;
      gl_FragColor=vec4(color,density*.90);
      #include <colorspace_fragment>
    }`});
  const clouds=new THREE.Mesh(new THREE.SphereGeometry(1.026,96,64),cloudMaterial);scene.add(clouds);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.035,80,64),new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 sunDirection;uniform float atmosphereRadius;uniform float dayNight;varying vec3 p;
    void main(){vec3 point=normalize(p)*atmosphereRadius;vec3 ray=normalize(point-cameraPosition);float b=dot(cameraPosition,ray),c=dot(cameraPosition,cameraPosition);float outer=atmosphereRadius;
      float disc=b*b-c+outer*outer;if(disc<0.)discard;float nearT=max(0.,-b-sqrt(disc)),farT=-b+sqrt(disc),surface=b*b-c+1.;if(surface>0.)farT=min(farT,-b-sqrt(surface));
      float stepSize=max(0.,farT-nearT)/5.,density=0.;
      for(int i=0;i<5;i++){vec3 s=cameraPosition+ray*(nearT+(float(i)+.5)*stepSize);float a=max(0.,length(s)-1.);density+=exp(-a*145.)*mix(1.,smoothstep(-.18,.3,dot(normalize(s),sunDirection)),dayNight)*stepSize;}
      float opacity=1.-exp(-density*6.);vec3 color=vec3(.14,.34,.66);gl_FragColor=vec4(color,opacity);
    }`}));atmosphere.renderOrder=3;scene.add(atmosphere);
  const moonGeometry=new THREE.SphereGeometry(.09,96,64),moonPositions=moonGeometry.attributes.position,moonColors=new Float32Array(moonPositions.count*3);
  const craters=Array.from({length:46},(_,i)=>({center:spherePoint((i*.6180339)%1,Math.acos(1-2*(i+.5)/46)/Math.PI),radius:.07+((i*17)%11)*.016}));
  for(let i=0;i<moonPositions.count;i++){
    const p=new THREE.Vector3().fromBufferAttribute(moonPositions,i).normalize();let relief=0;
    for(const crater of craters){const d=Math.hypot(p.x-crater.center[0],p.y-crater.center[1],p.z-crater.center[2])/crater.radius;if(d<1.5)relief+=.009*Math.exp(-(((d-1)/.16)**2))-.007*Math.exp(-d*d*2.5);}
    const gray=.52+gradientNoise(p.x*7,p.y*7,p.z*7,31)*.09+relief*6;const c=new THREE.Color(gray,gray*.99,gray*.94);moonColors.set([c.r,c.g,c.b],i*3);moonPositions.setXYZ(i,p.x*.09*(1+relief),p.y*.09*(1+relief),p.z*.09*(1+relief));
  }
  moonGeometry.setAttribute('color',new THREE.BufferAttribute(moonColors,3));moonGeometry.computeVertexNormals();
  const moon=new THREE.Mesh(moonGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));
  const initialDirection=new THREE.Vector3(...spherePoint(.30,.34)),initialRight=new THREE.Vector3(0,1,0).cross(initialDirection).normalize(),initialUp=initialDirection.clone().cross(initialRight);
  moon.position.copy(initialDirection).multiplyScalar(.2).addScaledVector(initialRight,-.95).addScaledVector(initialUp,.65);scene.add(moon);
  const sun=new THREE.DirectionalLight(0xfff0de,2.2),ambient=new THREE.AmbientLight(0x8ba6bd,.12);scene.add(sun,ambient);
  const stars=[];for(let i=0;i<650;i++){const a=i*2.399963,z=1-2*i/650,r=Math.sqrt(1-z*z);stars.push(Math.cos(a)*r*20,z*20,Math.sin(a)*r*20);}
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0xc5d4c7,size:.012,transparent:true,opacity:.35})));
  const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=1.0003;controls.maxDistance=5.5;controls.rotateSpeed=.45;
  let width=1,height=1,active=false,frame=0,destination=null,editing=false,painting=null,dirty=true,lastFrameTime=0,slowFrames=0,motionRatio=1;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let maximumHeight=0,outerRadius=1.02;
  function invalidate(){dirty=true;if(active&&!frame)frame=requestAnimationFrame(draw);}
  controls.addEventListener('change',invalidate);
  function setDisplay(next){display=next;uniforms.terrainShading.value=Number(display.terrainShading!==false);uniforms.dayNight.value=Number(display.dayNight!==false);uniforms.cloudShadows.value=Number(display.clouds!==false&&display.cloudShadows!==false);clouds.visible=display.clouds!==false&&world.clouds>0;atmosphere.visible=display.atmosphere!==false;sun.intensity=display.dayNight===false?0:2.2;ambient.intensity=display.dayNight===false?2:.12;invalidate();}
  function configure(next){world=next;const direction=new THREE.Vector3(...spherePoint(world.sunU,world.sunV));uniforms.sunDirection.value.copy(direction);sun.position.copy(direction).multiplyScalar(8);uniforms.cloudAmount.value=world.clouds;uniforms.seaLevel.value=world.seaLevel;uniforms.snowLevel.value=world.snowLevel??.52;uniforms.relief.value=world.relief;moon.visible=Boolean(world.moon);outerRadius=1+Math.max(0,maximumHeight-world.seaLevel)*.008*world.relief;clouds.scale.setScalar((outerRadius+.008)/1.026);atmosphere.scale.setScalar((outerRadius+.028)/1.035);uniforms.atmosphereRadius.value=outerRadius+.028;setDisplay(display);dirty=true;}
  function update(next){
    detail.update(next);patch.visible=uniforms.detailEnabled.value>0;
    world=next;const data=fields.update(world);uniforms.elevationField.value=data.elevation;uniforms.colorField.value=data.colors;uniforms.automaticField.value=data.automatic;uniforms.fieldSize.value.set(world.width,world.height);uniforms.seed.value=world.seed;
    if(weatherSeed!==world.seed){weather.dispose();weather=createWeather(world.seed,status=>{invalidate();container.dataset.weather=status;});weatherSeed=world.seed;uniforms.weatherField.value=weather;}
    maximumHeight=world.heights.reduce((a,b)=>Math.max(a,b),-1);configure(world);
  }
  update(world);
  const ready=renderer.compileAsync(scene,camera);
  function draw(time=0){
    frame=0;
    if(!active)return;
    if(destination){const targetUV=sphereUV(destination.toArray()),targetFloor=1+Math.max(0,surfaceAt(...targetUV)-world.seaLevel)*.008*world.relief+.0003;if(destination.length()<targetFloor)destination.setLength(targetFloor);const amount=reduced?1:.09,direction=camera.position.clone().normalize();const rotation=new THREE.Quaternion().setFromUnitVectors(direction,destination.clone().normalize());direction.applyQuaternion(new THREE.Quaternion().slerp(rotation,amount));camera.position.copy(direction.multiplyScalar(THREE.MathUtils.lerp(camera.position.length(),destination.length(),amount)));if(camera.position.distanceTo(destination)<Math.max(.00001,(camera.position.length()-1)*.003)){camera.position.copy(destination);destination=null;}}
    const moving=controls.update()||Boolean(destination);
    if(moving&&lastFrameTime&&time-lastFrameTime>24&&time-lastFrameTime<200){if(++slowFrames>=8){motionRatio=Math.max(.65,motionRatio-.15);slowFrames=0;}}
    else slowFrames=0;
    const ratio=Math.min(devicePixelRatio,moving?motionRatio:1.25);
    if(renderer.getPixelRatio()!==ratio){renderer.setPixelRatio(ratio);dirty=true;container.dataset.renderScale=String(ratio);}
    lastFrameTime=time;
    const [u,v]=sphereUV(camera.position.toArray()),surface=1+Math.max(0,surfaceAt(u,v)-world.seaLevel)*.008*world.relief;
    controls.minDistance=surface+.0003;
    if(camera.position.length()<controls.minDistance)camera.position.setLength(controls.minDistance);
    const altitude=camera.position.length()-surface,span=altitude*Math.tan(camera.fov*Math.PI/360)/Math.PI;
    container.dataset.camera=JSON.stringify({u,v,altitude,height:sampleHeight(world,u,v),detail:uniforms.detailEnabled.value});
    controls.rotateSpeed=Math.min(.45,altitude*.5);
    const tilt=display.terrainTilt===false?0:THREE.MathUtils.smoothstep(.20-altitude,0,.16)*Math.PI*.27;
    clouds.visible=display.clouds!==false&&world.clouds>0&&altitude>.12;
    renderCamera.copy(camera);
    if(tilt){
      const normal=camera.position.clone().normalize(),east=new THREE.Vector3(0,1,0).cross(normal).normalize(),south=east.clone().cross(normal),target=normal.clone().multiplyScalar(surface);
      renderCamera.position.copy(target).addScaledVector(normal,altitude*Math.cos(tilt)).addScaledVector(south,altitude*Math.sin(tilt));
      const positionUV=sphereUV(renderCamera.position.toArray()),floor=1+Math.max(0,surfaceAt(...positionUV)-world.seaLevel)*.008*world.relief+.00015;
      if(renderCamera.position.length()<floor)renderCamera.position.setLength(floor);
      renderCamera.lookAt(target);
    }
    renderCamera.updateMatrixWorld();
    globe.visible=true;
    if(altitude<.7){
      let left=u,right=u,top=v,bottom=v,misses=0;
      const sphere=new THREE.Sphere(new THREE.Vector3(),surface),ray=new THREE.Ray(),hit=new THREE.Vector3();
      ray.origin.copy(renderCamera.position);
      for(const y of [-1,0,1])for(const x of [-1,0,1]){
        ray.direction.set(x,y,.5).unproject(renderCamera).sub(ray.origin).normalize();
        let found=false;
        for(const radius of [1,Math.min(outerRadius,ray.origin.length()-.00005)]){
          sphere.radius=radius;
          if(ray.intersectSphere(sphere,hit)){found=true;const uv=sphereUV(hit.toArray()),longitude=u+((uv[0]-u+1.5)%1-.5);left=Math.min(left,longitude);right=Math.max(right,longitude);top=Math.min(top,uv[1]);bottom=Math.max(bottom,uv[1]);}
        }
        if(!found)misses++;
      }
      if(misses){detail.request(u,v,1,1);patch.visible=false;}
      else{detail.request((left+right)/2,(top+bottom)/2,Math.max(span*.5,(right-left)*1.16),Math.max(span,(bottom-top)*1.16));patch.visible=uniforms.detailEnabled.value>0;
        if(patch.visible&&visibleDetail){const [cx,cy,w,h]=visibleDetail.bounds,center=u+((cx-u+1.5)%1-.5);globe.visible=!(left>center-w*.42&&right<center+w*.42&&top>cy-h*.42&&bottom<cy+h*.42);}
      }
    }else{detail.request(u,v,1,1);patch.visible=false;}
    container.dataset.baseVisible=String(globe.visible);
    if(dirty||moving){
      const before=performance.now();renderer.render(scene,renderCamera);
      onChange();container.dataset.renderMs=(performance.now()-before).toFixed(2);container.dataset.renderCount=String(renderer.info.render.frame);dirty=false;
    }
    if(moving&&!frame)frame=requestAnimationFrame(draw);
  }
  const raycaster=new THREE.Raycaster();
  const pick=event=>{
    const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),renderCamera);
    return intersectSurface(raycaster.ray.origin.toArray(),raycaster.ray.direction.toArray(),world,(u,v)=>surfaceAt(u,v));
  };
  renderer.domElement.addEventListener('pointerdown',event=>{if(!editing||painting!==null)return;const point=pick(event);if(!point)return;painting=event.pointerId;renderer.domElement.setPointerCapture(event.pointerId);brush('start',point);});
  function updateBrushRing(point){
    const settings=brushSettings();brushRing.visible=Boolean(editing&&settings?.enabled&&point);
    if(brushRing.visible){
      const normal=new THREE.Vector3(...spherePoint(...point)),east=new THREE.Vector3(0,1,0).cross(normal);
      if(east.lengthSq()<.0001)east.set(1,0,0);east.normalize();const north=normal.clone().cross(east),angle=settings.radius*Math.PI;
      for(let i=0;i<64;i++){
        const phase=i/64*Math.PI*2,p=normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(east,Math.sin(angle)*Math.cos(phase)).addScaledVector(north,Math.sin(angle)*Math.sin(phase));
        const uv=sphereUV(p.toArray()),r=1.00002+Math.max(0,surfaceAt(...uv)-world.seaLevel)*.008*world.relief;p.multiplyScalar(r);ringPositions.set(p.toArray(),i*3);
      }
      ringGeometry.attributes.position.needsUpdate=true;
    }
    invalidate();
  }
  renderer.domElement.addEventListener('pointermove',event=>{if(!editing)return;const point=pick(event);if(painting===event.pointerId&&point)brush('move',point);updateBrushRing(point);});
  renderer.domElement.addEventListener('pointerleave',()=>{if(brushRing.visible){brushRing.visible=false;invalidate();}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,event=>{if(painting===event.pointerId){brush('end');painting=null;}});
  controls.addEventListener('start',()=>{destination=null;});
  function zoom(factor){const radius=destination?.length()||camera.position.length(),[u,v]=sphereUV(camera.position.toArray()),surface=1+Math.max(0,surfaceAt(u,v)-world.seaLevel)*.008*world.relief;destination=(destination||camera.position).clone().normalize().multiplyScalar(clamp(surface+(radius-surface)/factor,surface+.0003,5.5));invalidate();}
  renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();event.stopImmediatePropagation();zoom(Math.exp(-event.deltaY*.002));},{passive:false,capture:true});
  renderer.domElement.addEventListener('keydown',event=>{const delta={ArrowLeft:[-.025,0],ArrowRight:[.025,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]}[event.key];if(!delta)return;event.preventDefault();const [x,y]=sphereUV(camera.position.toArray());camera.position.set(...spherePoint((x+delta[0]*Math.min(1,(camera.position.length()-1)*3)+1)%1,clamp(y+delta[1]*Math.min(1,(camera.position.length()-1)*3),.001,.999),camera.position.length()));destination=null;invalidate();});
  return {update,configure,ready,setDisplay,
    updateDetails(next){world=next;detail.update(next,true);patch.visible=uniforms.detailEnabled.value>0;configure(next);},
    setEditing(value){editing=value;controls.enabled=!value;brushRing.visible=false;invalidate();renderer.domElement.style.cursor=value?'crosshair':'grab';},
    resize(w,h){width=w;height=h;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<=780?Math.max(38,Math.atan(h/(w*.84*Math.sqrt(4.25**2-1)))*360/Math.PI):38;camera.clearViewOffset();camera.updateProjectionMatrix();invalidate();},
    start(){if(!active){active=true;detail.setActive(true);invalidate();}},stop(){active=false;detail.setActive(false);cancelAnimationFrame(frame);frame=0;lastFrameTime=0;},
    focus(x,y,distance=3.25){destination=new THREE.Vector3(...spherePoint(x,y,distance));invalidate();},
    focusView(x,y,spanV){const surface=1+Math.max(0,surfaceAt(x,y)-world.seaLevel)*.008*world.relief;this.focus(x,y,clamp(surface+spanV*Math.PI/(2*Math.tan(camera.fov*Math.PI/360)),surface+.0003,5.5));},
    reset(){destination=new THREE.Vector3(...spherePoint(.30,.34,width<=780?4.7:4.25));invalidate();},
    zoom,
    center(){return sphereUV(camera.position.toArray());},
    view(){const center=sphereUV(camera.position.toArray()),surface=1+Math.max(0,surfaceAt(...center)-world.seaLevel)*.008*world.relief;return{center,spanV:2*(camera.position.length()-surface)*Math.tan(camera.fov*Math.PI/360)/Math.PI};},
    project(x,y){const h=surfaceAt(x,y),point=new THREE.Vector3(...spherePoint(x,y,1.00002+Math.max(0,h-world.seaLevel)*.008*world.relief));const visible=point.clone().normalize().dot(renderCamera.position.clone().sub(point).normalize())>.12;const projected=point.project(renderCamera);return{x:(projected.x*.5+.5)*width,y:(-projected.y*.5+.5)*height,visible};},
    dispose(){this.stop();controls.dispose();renderer.dispose();fields.dispose();detail.dispose();weather.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});},
  };
}
