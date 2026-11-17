import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { spherePoint, sphereUV, clamp } from './world.mjs';
import { sampleFilteredHeight as sampleHeight } from './terrain.mjs';
import { createFields, fieldGLSL } from './fields.mjs';
import { createWeather, weatherGLSL } from './sky.mjs';
import { gradientNoise } from './landform.mjs';

export function createPlanet(container,world,onChange,brush,brushSettings=()=>null){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x071723,0);container.append(renderer.domElement);
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','행성. 드래그로 회전. 편집 모드에서 지형 칠하기');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(...spherePoint(.30,.34,4.25));
  const fields=createFields({surface:true});let weather=createWeather(world.seed,status=>{dirty=true;container.dataset.weather=status;}),weatherSeed=world.seed;
  const uniforms={elevationField:{value:null},colorField:{value:null},fieldSize:{value:new THREE.Vector2()},seaLevel:{value:0},seed:{value:world.seed},relief:{value:1},weatherField:{value:weather},time:{value:0},cloudAmount:{value:world.clouds},sunDirection:{value:new THREE.Vector3()},atmosphereRadius:{value:1.035}};
  const material=new THREE.ShaderMaterial({uniforms,
    vertexShader:`${fieldGLSL}\nuniform float relief;varying vec3 p;
    void main(){p=normalize(position);float h=max(0.,smoothHeightAt(globeUV(p))-seaLevel);gl_Position=projectionMatrix*modelViewMatrix*vec4(p*(1.+h*.008*relief),1.);}`,
    fragmentShader:`${fieldGLSL}\n${weatherGLSL}\nuniform float relief;varying vec3 p;
    void main(){vec3 q=normalize(p);vec2 uv=globeUV(q);float h=smoothHeightAt(uv);vec3 n=q;vec3 color;
      bool sea=h<=seaLevel;
      if(sea){float shelf=exp((h-seaLevel)*30.);color=mix(vec3(.035,.14,.23),vec3(.07,.31,.33),shelf);}
      else{
        color=colorAt(uv);vec2 d=1./fieldSize;
        float eastH=globeSlopeHeightAt(uv+vec2(d.x,0)),westH=globeSlopeHeightAt(uv-vec2(d.x,0)),southH=globeSlopeHeightAt(uv+vec2(0,d.y)),northH=globeSlopeHeightAt(uv-vec2(0,d.y));
        float gx=(eastH-westH)/(2.*d.x*6.28318*max(.045,length(q.xz)));
        float gy=(southH-northH)/(2.*d.y*3.14159);
        float rock=smoothstep(.10,.36,h-seaLevel)*smoothstep(.06,.8,length(vec2(gx,gy)));
        color=mix(color,vec3(.48,.45,.39),rock*.8);color=mix(color,vec3(.90,.92,.91),smoothstep(.34,.48,h-seaLevel));
        vec3 east=length(q.xz)>.001?normalize(vec3(q.z,0.,-q.x)):vec3(1.,0.,0.),south=cross(east,q);n=normalize(q-(east*gx+south*gy)*mix(.10,.035,smoothstep(.08,.3,h-seaLevel))*relief*smoothstep(.015,.15,length(q.xz))*smoothstep(.005,.055,h-seaLevel));
        vec2 variation=texture2D(weatherField,uv).gb;
        color*=(.97+variation.x*.04+variation.y*.02)*clamp(.88+(h-seaLevel)*2.2,.90,1.10);
        float neighbors=(eastH+westH+southH+northH)*.25;
        color*=1.-clamp((neighbors-h)*22.,0.,.22);
      }
      float facing=dot(q,sunDirection),daylight=max(0.,facing)*clamp(dot(n,sunDirection)/max(.2,facing),.4,1.4);
      float shadow=cloudAt(q+sunDirection*.026)*.42*smoothstep(-.05,.2,facing);
      vec3 light=vec3(.028,.045,.065)+vec3(1.05,1.02,.94)*daylight*(1.-shadow);
      vec3 result=pow(color,vec3(2.2))*light;
      vec3 view=normalize(cameraPosition-q);
      if(sea){vec3 halfV=normalize(sunDirection+view);float glint=pow(max(0.,dot(n,halfV)),110.)*.06*max(0.,facing)*(1.-shadow);result+=vec3(1.,.92,.76)*glint;}
      float rim=pow(1.-max(0.,dot(q,view)),3.)*smoothstep(-.15,.4,facing);result+=vec3(.010,.035,.075)*rim;
      gl_FragColor=vec4(result,1.);
      #include <colorspace_fragment>
    }`});
  const globe=new THREE.Mesh(new THREE.SphereGeometry(1,192,128),material);globe.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.1);scene.add(globe);
  const ringPositions=new Float32Array(64*3),ringGeometry=new THREE.BufferGeometry();ringGeometry.setAttribute('position',new THREE.BufferAttribute(ringPositions,3));
  const brushRing=new THREE.LineLoop(ringGeometry,new THREE.LineBasicMaterial({color:0xffedbb,transparent:true,opacity:.9,depthWrite:false}));brushRing.frustumCulled=false;brushRing.visible=false;scene.add(brushRing);
  const cloudMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
    vertexShader:'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`${fieldGLSL}\n${weatherGLSL}\nvarying vec3 p;
    void main(){vec3 q=normalize(p);float density=cloudAt(q);if(density<.008)discard;
      float slope=cloudAt(q+sunDirection*.008)-density;
      float fine=fieldNoise(globeUV(q)*vec2(900.,450.));density*=.85+fine*.15;
      float light=.055+max(0.,dot(q,sunDirection))*(.74-slope*1.8);
      vec3 color=vec3(.92,.96,1.)*light;
      gl_FragColor=vec4(color,density*.90);
      #include <colorspace_fragment>
    }`});
  const clouds=new THREE.Mesh(new THREE.SphereGeometry(1.026,96,64),cloudMaterial);scene.add(clouds);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.035,80,64),new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 sunDirection;uniform float atmosphereRadius;varying vec3 p;
    void main(){vec3 point=normalize(p)*atmosphereRadius;vec3 ray=normalize(point-cameraPosition);float b=dot(cameraPosition,ray),c=dot(cameraPosition,cameraPosition);float outer=atmosphereRadius;
      float disc=b*b-c+outer*outer;if(disc<0.)discard;float nearT=-b-sqrt(disc),farT=-b+sqrt(disc),surface=b*b-c+1.;if(surface>0.)farT=min(farT,-b-sqrt(surface));
      float stepSize=max(0.,farT-nearT)/5.,density=0.;
      for(int i=0;i<5;i++){vec3 s=cameraPosition+ray*(nearT+(float(i)+.5)*stepSize);float a=max(0.,length(s)-1.);density+=exp(-a*145.)*smoothstep(-.18,.3,dot(normalize(s),sunDirection))*stepSize;}
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
  const sun=new THREE.DirectionalLight(0xfff0de,2.2);scene.add(sun,new THREE.AmbientLight(0x8ba6bd,.12));
  const stars=[];for(let i=0;i<650;i++){const a=i*2.399963,z=1-2*i/650,r=Math.sqrt(1-z*z);stars.push(Math.cos(a)*r*20,z*20,Math.sin(a)*r*20);}
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0xc5d4c7,size:.012,transparent:true,opacity:.35})));
  const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=1.5;controls.maxDistance=5.5;controls.rotateSpeed=.45;
  let width=1,height=1,active=false,frame=0,destination=null,editing=false,painting=null,dirty=true,lastDraw=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let maximumHeight=0,outerRadius=1.02;
  function configure(next){world=next;const direction=new THREE.Vector3(...spherePoint(world.sunU,world.sunV));uniforms.sunDirection.value.copy(direction);sun.position.copy(direction).multiplyScalar(8);uniforms.cloudAmount.value=world.clouds;uniforms.seaLevel.value=world.seaLevel;uniforms.relief.value=world.relief;clouds.visible=world.clouds>0;moon.visible=Boolean(world.moon);outerRadius=1+Math.max(0,maximumHeight-world.seaLevel)*.008*world.relief;clouds.scale.setScalar((outerRadius+.008)/1.026);atmosphere.scale.setScalar((outerRadius+.028)/1.035);uniforms.atmosphereRadius.value=outerRadius+.028;dirty=true;}
  function update(next){
    world=next;const data=fields.update(world);uniforms.elevationField.value=data.elevation;uniforms.colorField.value=data.colors;uniforms.fieldSize.value.set(world.width,world.height);uniforms.seed.value=world.seed;
    if(weatherSeed!==world.seed){weather.dispose();weather=createWeather(world.seed,status=>{dirty=true;container.dataset.weather=status;});weatherSeed=world.seed;uniforms.weatherField.value=weather;}
    maximumHeight=world.heights.reduce((a,b)=>Math.max(a,b),-1);configure(world);
  }
  update(world);
  const ready=renderer.compileAsync(scene,camera);
  function draw(time=0){
    if(!active)return;
    if(destination){const amount=reduced?1:.09,direction=camera.position.clone().normalize();const rotation=new THREE.Quaternion().setFromUnitVectors(direction,destination.clone().normalize());direction.applyQuaternion(new THREE.Quaternion().slerp(rotation,amount));camera.position.copy(direction.multiplyScalar(THREE.MathUtils.lerp(camera.position.length(),destination.length(),amount)));if(camera.position.distanceTo(destination)<.004){camera.position.copy(destination);destination=null;}}
    const moving=controls.update()||Boolean(destination);
    if(dirty||moving||(!reduced&&world.clouds>0&&time-lastDraw>150)){
      uniforms.time.value=reduced?0:time/1000;const before=performance.now();renderer.render(scene,camera);
      if(dirty||moving)onChange();container.dataset.renderMs=(performance.now()-before).toFixed(2);dirty=false;lastDraw=time;
    }
    frame=requestAnimationFrame(draw);
  }
  const raycaster=new THREE.Raycaster(),hit=new THREE.Vector3();
  const pick=event=>{
    const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const ray=raycaster.ray,b=ray.origin.dot(ray.direction),disc=b*b-ray.origin.lengthSq()+outerRadius*outerRadius;if(disc<0)return null;
    const near=-b-Math.sqrt(disc),far=-b+Math.sqrt(disc);
    const distance=t=>{ray.at(t,hit);const uv=sphereUV(hit.toArray());return hit.length()-(1+Math.max(0,sampleHeight(world,...uv)-world.seaLevel)*.008*world.relief);};
    let previous=near;
    for(let step=1;step<=48;step++){const t=near+(far-near)*step/48;if(distance(t)<=0){let a=previous,z=t;for(let j=0;j<9;j++){const mid=(a+z)/2;if(distance(mid)>0)a=mid;else z=mid;}ray.at((a+z)/2,hit);return sphereUV(hit.toArray());}previous=t;}
    return null;
  };
  renderer.domElement.addEventListener('pointerdown',event=>{if(!editing||painting!==null)return;const point=pick(event);if(!point)return;painting=event.pointerId;renderer.domElement.setPointerCapture(event.pointerId);brush('start',point);});
  function updateBrushRing(point){
    const settings=brushSettings();brushRing.visible=Boolean(editing&&settings?.enabled&&point);
    if(brushRing.visible){
      const normal=new THREE.Vector3(...spherePoint(...point)),east=new THREE.Vector3(0,1,0).cross(normal);
      if(east.lengthSq()<.0001)east.set(1,0,0);east.normalize();const north=normal.clone().cross(east),angle=settings.radius*Math.PI;
      for(let i=0;i<64;i++){
        const phase=i/64*Math.PI*2,p=normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(east,Math.sin(angle)*Math.cos(phase)).addScaledVector(north,Math.sin(angle)*Math.sin(phase));
        const uv=sphereUV(p.toArray()),r=1.001+Math.max(0,sampleHeight(world,...uv)-world.seaLevel)*.008*world.relief;p.multiplyScalar(r);ringPositions.set(p.toArray(),i*3);
      }
      ringGeometry.attributes.position.needsUpdate=true;
    }
    dirty=true;
  }
  renderer.domElement.addEventListener('pointermove',event=>{if(!editing)return;const point=pick(event);if(painting===event.pointerId&&point)brush('move',point);updateBrushRing(point);});
  renderer.domElement.addEventListener('pointerleave',()=>{brushRing.visible=false;dirty=true;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,event=>{if(painting===event.pointerId){brush('end');painting=null;}});
  controls.addEventListener('start',()=>{destination=null;});
  renderer.domElement.addEventListener('keydown',event=>{const delta={ArrowLeft:[-.025,0],ArrowRight:[.025,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]}[event.key];if(!delta)return;event.preventDefault();const [x,y]=sphereUV(camera.position.toArray());camera.position.set(...spherePoint((x+delta[0]+1)%1,clamp(y+delta[1],.03,.97),camera.position.length()));destination=null;dirty=true;});
  return {update,configure,ready,
    setEditing(value){editing=value;controls.enabled=!value;brushRing.visible=false;dirty=true;renderer.domElement.style.cursor=value?'crosshair':'grab';},
    resize(w,h){width=w;height=h;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<=780?Math.max(38,Math.atan(h/(w*.84*Math.sqrt(4.25**2-1)))*360/Math.PI):38;camera.setViewOffset(w,h,w>950?-130:w>780?-75:0,w<=780?35:0,w,h);camera.updateProjectionMatrix();dirty=true;},
    start(){if(!active){active=true;draw();}},stop(){active=false;cancelAnimationFrame(frame);},
    focus(x,y,distance=3.25){destination=new THREE.Vector3(...spherePoint(x,y,distance));},
    reset(){destination=new THREE.Vector3(...spherePoint(.30,.34,width<=780?4.7:4.25));},
    zoom(factor){destination=camera.position.clone().normalize().multiplyScalar(clamp(camera.position.length()/factor,1.5,5.5));},
    center(){return sphereUV(camera.position.toArray());},
    project(x,y){const h=sampleHeight(world,x,y),point=new THREE.Vector3(...spherePoint(x,y,1.006+Math.max(0,h-world.seaLevel)*.008*world.relief));const visible=point.clone().normalize().dot(camera.position.clone().sub(point).normalize())>.22;const projected=point.project(camera);return{x:(projected.x*.5+.5)*width,y:(-projected.y*.5+.5)*height,visible};},
    dispose(){this.stop();controls.dispose();renderer.dispose();fields.dispose();weather.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});},
  };
}
