import * as THREE from 'three';
import { createFields, fieldGLSL } from './fields.mjs';
let renderer,fields,material,scene,camera,fallback;
let fallbackWorker,fallbackPending,fallbackWorking=false,fallbackRevision=0,fallbackReady;
function renderFallback(world,onReady){
 const id=++fallbackRevision;fallbackPending={id,world,width:768,height:432};fallbackReady=onReady;
 const dispatch=()=>{const job=fallbackPending;fallbackPending=null;fallbackWorking=true;fallbackWorker.postMessage(job);};
 if(!fallbackWorker){
  fallbackWorker=new Worker(new URL('./relief-worker.mjs',import.meta.url),{type:'module'});
  fallbackWorker.onmessage=({data})=>{fallbackWorking=false;if(data.id===fallbackRevision){fallback.getContext('2d').putImageData(new ImageData(data.pixels,data.width,data.height),0,0);fallbackReady();}if(fallbackPending)dispatch();};
  fallbackWorker.onerror=()=>{fallbackWorker.terminate();fallbackWorker=null;fallbackWorking=false;};
 }
 if(!fallbackWorking)dispatch();
}
let hydroWorker,hydroTimer,revision=0,riverPaths=[],currentHydroResult;
function scheduleRivers(world,onReady){
 const id=++revision;clearTimeout(hydroTimer);riverPaths=[];
 currentHydroResult=paths=>{riverPaths=paths;onReady();};
 hydroTimer=setTimeout(()=>{
  if(!hydroWorker){hydroWorker=new Worker(new URL('./hydrology-worker.mjs',import.meta.url),{type:'module'});hydroWorker.onmessage=({data})=>{if(data.id===revision)currentHydroResult(data.paths);};hydroWorker.onerror=()=>{hydroWorker.terminate();hydroWorker=null;};}
  hydroWorker.postMessage({id,world:{width:world.width,height:world.height,heights:world.heights,seaLevel:world.seaLevel}});
 },250);
}
function initialize() {
  if(renderer||fallback)return;
  try {
    renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.setSize(1536,864);renderer.setPixelRatio(1);
    fields=createFields();scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
    material=new THREE.ShaderMaterial({uniforms:{elevationField:{value:null},colorField:{value:null},fieldSize:{value:new THREE.Vector2()},seaLevel:{value:0},seed:{value:27}},
      vertexShader:'varying vec2 uvMap;void main(){uvMap=vec2(uv.x,1.-uv.y);gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`${fieldGLSL}
      varying vec2 uvMap;
      void main(){vec2 uv=uvMap;float h=heightAt(uv);vec3 color;
       if(h<=seaLevel){float shelf=exp((h-seaLevel)*22.);color=mix(vec3(.105,.23,.29),vec3(.26,.44,.45),shelf);color+=vec3(.03,.05,.055)*smoothstep(-.34,-.12,h-seaLevel);}
       else{
        color=terrainColor(uv,h);vec2 d=.5/fieldSize;
        float dx=(heightAt(uv+vec2(d.x,0))-heightAt(uv-vec2(d.x,0)))*fieldSize.x*.20;
        float dy=(heightAt(uv+vec2(0,d.y))-heightAt(uv-vec2(0,d.y)))*fieldSize.y*.20;
        float shade=clamp((.85-dx*.46-dy*.56)/sqrt(1.+dx*dx+dy*dy),-.4,1.);
        color=mix(color,vec3(.60,.62,.45),exp(-(h-seaLevel)*420.)*.45);color*=.73+shade*.34;
       }
       gl_FragColor=vec4(color,1.);
      }`});
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
  }catch{renderer?.dispose();renderer=null;fallback=document.createElement('canvas');fallback.width=768;fallback.height=432;}
}
export function createAtlas(world,onReady=()=>{}) {
  initialize();const started=performance.now();let cache;
  if(renderer){
    const data=fields.update(world),u=material.uniforms;
    u.elevationField.value=data.elevation;u.colorField.value=data.colors;u.fieldSize.value.set(world.width,world.height);u.seaLevel.value=world.seaLevel;u.seed.value=world.seed;
    renderer.render(scene,camera);cache=renderer.domElement;
  }else{renderFallback(world,onReady);cache=fallback;}
  const elapsed=performance.now()-started;queueMicrotask(onReady);scheduleRivers(world,onReady);
  return {elapsed,
    draw(context,x,y,width,height){
      context.save();context.beginPath();context.rect(x,y,width,height);context.clip();context.drawImage(cache,x,y,width,height);
      context.strokeStyle='#476f7b99';context.lineWidth=Math.max(.55,Math.min(1.5,width/1800));context.lineCap='round';context.lineJoin='round';
      for(const path of riverPaths){context.beginPath();let previous=null;for(let i=0;i<path.length;i++){const p=path[i],px=x+p[0]*width,py=y+p[1]*height;if(!previous||Math.abs(p[0]-previous[0])>.5)context.moveTo(px,py);else{const next=path[Math.min(path.length-1,i+1)],last=Math.abs(p[0]-next[0])>.5?p:next;context.quadraticCurveTo(px,py,x+(p[0]+last[0])*.5*width,y+(p[1]+last[1])*.5*height);}previous=p;}context.stroke();}
      for(const p of world.places){if(p.type!=='anomaly')continue;
        context.strokeStyle=p.id==='red-zone'?'#e79783cc':'#a4d6edcc';context.fillStyle=p.id==='red-zone'?'#c3644e29':'#82c8eb20';
        context.lineWidth=1;context.setLineDash([4,6]);context.beginPath();context.ellipse(x+p.x*width,y+p.y*height,.052*width,.082*height,0,0,Math.PI*2);context.fill();context.stroke();
      }
      context.restore();
    },
  };
}
