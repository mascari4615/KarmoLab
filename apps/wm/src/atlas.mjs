import * as THREE from 'three';
import { createFields, fieldGLSL } from './fields.mjs';
import { createDetailFields, detailGLSL } from './detail-fields.mjs';
import { createCartography } from './cartography.mjs';
let renderer,fields,material,scene,camera,fallback;
let detail,detailReady=()=>{};
let chart,chartWorker,chartPending,chartWorking=false,chartRevision=0,chartWorldId,chartWorld,chartMinRevision=0,chartReady=()=>{};
function scheduleCartography(world,onReady){
  const id=++chartRevision;chartReady=onReady;chartWorld=world;
  if(world.id!==chartWorldId){chart=null;chartWorldId=world.id;chartMinRevision=id;}
  chartPending={id,world};
  const dispatch=()=>{
    if(chartWorking||!chartPending)return;
    const job=chartPending;chartPending=null;chartWorking=true;
    const heights=Float32Array.from(job.world.heights),biomes=Uint8Array.from(job.world.biomes);
    chartWorker.postMessage({id:job.id,world:{id:job.world.id,seed:job.world.seed,sunU:job.world.sunU,sunV:job.world.sunV,seaLevel:job.world.seaLevel,width:job.world.width,height:job.world.height,places:job.world.places,heights,biomes}},[heights.buffer,biomes.buffer]);
  };
  if(!chartWorker){
    chartWorker=new Worker(new URL('./cartography-worker.mjs',import.meta.url),{type:'module'});
    chartWorker.onmessage=({data})=>{
      chartWorking=false;
      if(data.worldId===chartWorldId&&data.id>=chartMinRevision){
        if(data.error){document.querySelector('#map').dataset.cartographyState='error';}
        else{chart=createCartography(chartWorld,data.geometry);document.querySelector('#map').dataset.cartographyState='ready';document.querySelector('#map').dataset.cartographyMs=data.elapsed.toFixed(2);}
        chartReady();
      }
      dispatch();
    };
    chartWorker.onerror=()=>{chartWorking=false;chartPending=null;chartWorker.terminate();chartWorker=null;document.querySelector('#map').dataset.cartographyState='error';chartReady();};
  }
  if(!chart)document.querySelector('#map').dataset.cartographyState='loading';
  dispatch();
}
let fallbackWorker,fallbackPending,fallbackWorking=false,fallbackRevision=0,fallbackReady;
let fallbackRegion={u:0,v:0,w:1,h:1},fallbackKey='';
let fallbackWorldId,fallbackOverview;
function renderFallback(world,onReady,display,region={u:0,v:0,w:1,h:1}){
 const id=++fallbackRevision;fallbackPending={id,world,width:640,height:360,display,region};fallbackReady=onReady;
 const dispatch=()=>{const job=fallbackPending;fallbackPending=null;fallbackWorking=true;document.querySelector('#map').dataset.detailState='loading';const heights=Float32Array.from(job.world.heights),biomes=Uint8Array.from(job.world.biomes);fallbackWorker.postMessage({...job,world:{...job.world,heights,biomes}},[heights.buffer,biomes.buffer]);};
 if(!fallbackWorker){
  fallbackWorker=new Worker(new URL('./relief-worker.mjs',import.meta.url),{type:'module'});
  fallbackWorker.onmessage=({data})=>{fallbackWorking=false;
    if(data.pixels&&data.worldId===fallbackWorldId&&data.region?.w===1&&data.region?.h===1){fallbackOverview=document.createElement('canvas');fallbackOverview.width=data.width;fallbackOverview.height=data.height;fallbackOverview.getContext('2d').putImageData(new ImageData(data.pixels,data.width,data.height),0,0);fallbackReady();}
    if(data.id===fallbackRevision){if(data.error){document.querySelector('#map').dataset.detailState='error';fallbackReady({error:true});}else{document.querySelector('#map').dataset.detailState='ready';fallback.width=data.width;fallback.height=data.height;fallback.getContext('2d').putImageData(new ImageData(data.pixels,data.width,data.height),0,0);fallbackRegion=data.region;fallbackReady();}}if(fallbackPending)dispatch();};
  fallbackWorker.onerror=()=>{fallbackWorker.terminate();fallbackWorker=null;fallbackWorking=false;fallbackPending=null;document.querySelector('#map').dataset.detailState='error';fallbackReady({error:true});};
 }
 if(!fallbackWorking)dispatch();
}
let hydroWorker,hydroTimer,revision=0,riverPaths=[],currentHydroResult,hydroWorking=false,hydroPending;
function dispatchRivers(){
 if(hydroWorking||!hydroPending)return;
 const {id,world}=hydroPending;hydroPending=null;hydroWorking=true;
 const heights=Float32Array.from(world.heights);
 hydroWorker.postMessage({id,world:{width:world.width,height:world.height,heights,seaLevel:world.seaLevel}},[heights.buffer]);
}
function scheduleRivers(world,onReady){
 const id=++revision;clearTimeout(hydroTimer);riverPaths=[];
 currentHydroResult=paths=>{riverPaths=paths;onReady();};
 hydroTimer=setTimeout(()=>{
  if(!hydroWorker){hydroWorker=new Worker(new URL('./hydrology-worker.mjs',import.meta.url),{type:'module'});hydroWorker.onmessage=({data})=>{hydroWorking=false;if(data.id===revision)currentHydroResult(data.paths);dispatchRivers();};hydroWorker.onerror=()=>{hydroWorker.terminate();hydroWorker=null;hydroWorking=false;hydroPending=null;};}
  hydroPending={id,world};dispatchRivers();
 },250);
}
function initialize() {
  if(renderer||fallback)return;
  try {
    if(new URLSearchParams(location.search).get('renderer')==='canvas')throw new Error('호환 지도 보기');
    renderer=new THREE.WebGLRenderer({antialias:false,alpha:true});
    renderer.setClearColor(0,0);
    renderer.domElement.id='map-surface';
    renderer.domElement.setAttribute('aria-hidden','true');
    renderer.setSize(1536,864);renderer.setPixelRatio(1);
    fields=createFields();scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
    material=new THREE.ShaderMaterial({uniforms:{elevationField:{value:null},colorField:{value:null},fieldSize:{value:new THREE.Vector2()},seaLevel:{value:0},snowLevel:{value:.38},seed:{value:27},terrainShading:{value:1},uvOrigin:{value:new THREE.Vector2()},uvExtent:{value:new THREE.Vector2(1,1)}},
      vertexShader:'uniform vec2 uvOrigin;uniform vec2 uvExtent;varying vec2 uvMap;void main(){uvMap=uvOrigin+vec2(uv.x,1.-uv.y)*uvExtent;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`${fieldGLSL}\n${detailGLSL}
      varying vec2 uvMap;uniform float terrainShading;
      void main(){vec2 uv=uvMap;float h=surfaceHeightAt(uv);vec3 color;
       if(h<=seaLevel){float shelf=exp((h-seaLevel)*22.);color=mix(vec3(.105,.23,.29),vec3(.26,.44,.45),shelf);color+=vec3(.03,.05,.055)*smoothstep(-.34,-.12,h-seaLevel);}
       else{
        color=terrainColor(uv,h)*surfaceColorAt(uv)/max(vec3(.01),colorAt(uv));vec2 gradient=surfaceGradientAt(uv);
        float dx=gradient.x*.04,dy=gradient.y*.04;
        float shade=clamp((.85-dx*.46-dy*.56)/sqrt(1.+dx*dx+dy*dy),-.4,1.);
        color=mix(color,vec3(.60,.62,.45),exp(-(h-seaLevel)*420.)*.45);color*=mix(1.,.73+shade*.34,terrainShading);
       }
       gl_FragColor=vec4(color,1.);
      }`});
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
    detail=createDetailFields(material.uniforms,data=>detailReady(data),renderer);
  }catch{renderer?.dispose();renderer=null;fallback=document.createElement('canvas');fallback.width=768;fallback.height=432;}
}
export function createAtlas(world,onReady=()=>{},display={}) {
  const started=performance.now();let cache,prepared=false;
  scheduleCartography(world,onReady);
  function prepareRelief(){
  if(prepared)return;prepared=true;initialize();
  detailReady=onReady;detail?.update(world);
  if(renderer){
    const data=fields.update(world),u=material.uniforms;
    u.elevationField.value=data.elevation;u.colorField.value=data.colors;u.automaticField.value=data.automatic;u.fieldSize.value.set(world.width,world.height);u.seaLevel.value=world.seaLevel;u.snowLevel.value=world.snowLevel??.38;u.seed.value=world.seed;
    u.terrainShading.value=Number(display.terrainShading!==false);cache=renderer.domElement;
  }else{if(fallbackWorldId!==world.id){fallbackWorldId=world.id;fallbackOverview=null;fallback.getContext('2d').clearRect(0,0,fallback.width,fallback.height);}fallbackKey='';renderFallback(world,onReady,display);cache=fallback;}
  }
  const elapsed=performance.now()-started;queueMicrotask(onReady);scheduleRivers(world,onReady);
  return {elapsed,
    setActive(value){detail?.setActive(value);},
    updateDetails(next){world=next;detail?.update(world,true);if(prepared&&!renderer){fallbackKey='';renderFallback(world,onReady,display,fallbackRegion);}},
    setDisplay(next){display=next;if(renderer)material.uniforms.terrainShading.value=Number(display.terrainShading!==false);else if(prepared){fallbackKey='';renderFallback(world,onReady,display,fallbackRegion);}},
    draw(context,x,y,width,height,{direct=false}={}){
      const visibleFineEdits=(world.detailStrokes||[]).some(stroke=>stroke.radius*height>1);
      if(display.cartography!==false && width<16000&&!visibleFineEdits){
        if(renderer)renderer.domElement.hidden=true;
        detail?.setActive(false);
        if(chart)chart.draw(context,x,y,width,height,{rivers:riverPaths,display});
        else{context.fillStyle='#a7c4c6';context.fillRect(x,y,width,height);}
        return;
      }
      prepareRelief();detail?.setActive(true);
      context.save();context.beginPath();context.rect(x,y,width,height);context.clip();
      if(renderer){
        const ratio=Math.abs(context.getTransform().a)||1,cw=context.canvas.width/ratio,ch=context.canvas.height/ratio;
        const left=Math.max(0,x),top=Math.max(0,y),w=Math.min(cw,x+width)-left,h=Math.min(ch,y+height)-top;
        if(w>0&&h>0){
          if(direct)detail.request((left-x+w/2)/width,(top-y+h/2)/height,w/width,h/height);
          const renderRatio=Math.min(ratio,1.25),pw=Math.ceil(w*renderRatio),ph=Math.ceil(h*renderRatio);
          if(cache.width!==pw||cache.height!==ph)renderer.setSize(pw,ph,false);
          material.uniforms.uvOrigin.value.set((left-x)/width,(top-y)/height);material.uniforms.uvExtent.value.set(w/width,h/height);
          if(direct){
            if(!cache.isConnected)context.canvas.before(cache);
            cache.style.left=`${left}px`;cache.style.top=`${top}px`;cache.style.width=`${w}px`;cache.style.height=`${h}px`;cache.hidden=false;
            renderer.render(scene,camera);
          }else{
            renderer.render(scene,camera);context.drawImage(cache,left,top,w,h);
          }
        }else if(direct){cache.hidden=true;
        }
      }else{
        if(direct){
          const ratio=Math.abs(context.getTransform().a)||1,cw=context.canvas.width/ratio,ch=context.canvas.height/ratio,left=Math.max(0,x),top=Math.max(0,y),w=Math.min(cw,x+width)-left,h=Math.min(ch,y+height)-top;
          if(w>0&&h>0){const region={u:(left-x)/width,v:(top-y)/height,w:w/width,h:h/height},key=Object.values(region).map(n=>n.toFixed(6)).join(':');if(key!==fallbackKey){fallbackKey=key;renderFallback(world,onReady,display,region);}}
        }
        if(fallbackOverview)context.drawImage(fallbackOverview,x,y,width,height);
        context.drawImage(cache,x+fallbackRegion.u*width,y+fallbackRegion.v*height,width*fallbackRegion.w,height*fallbackRegion.h);
      }
      context.strokeStyle='#476f7b99';context.lineWidth=Math.max(.55,Math.min(1.5,width/1800));context.lineCap='round';context.lineJoin='round';
      if(display.rivers!==false)for(const path of riverPaths){context.beginPath();let previous=null;for(let i=0;i<path.length;i++){const p=path[i],px=x+p[0]*width,py=y+p[1]*height;if(!previous||Math.abs(p[0]-previous[0])>.5)context.moveTo(px,py);else{const next=path[Math.min(path.length-1,i+1)],last=Math.abs(p[0]-next[0])>.5?p:next;context.quadraticCurveTo(px,py,x+(p[0]+last[0])*.5*width,y+(p[1]+last[1])*.5*height);}previous=p;}context.stroke();}
      for(const p of world.places){if(p.type!=='anomaly')continue;
        context.strokeStyle=p.id==='red-zone'?'#e79783cc':'#a4d6edcc';context.fillStyle=p.id==='red-zone'?'#c3644e29':'#82c8eb20';
        context.lineWidth=1;context.setLineDash([4,6]);context.beginPath();context.ellipse(x+p.x*width,y+p.y*height,.052*width,.082*height,0,0,Math.PI*2);context.fill();context.stroke();
      }
      context.restore();
    },
  };
}
