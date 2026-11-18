import * as THREE from 'three';
import { detailBounds, sampleRenderedHeight } from './detail.mjs';
import { spherePoint } from './world.mjs';

export function createDetailFields(uniforms,onReady,renderer){
  const linear=renderer?.extensions.has('OES_texture_float_linear')||false;
  const textures=new Map();
  function textureFor(size,pixels){let texture=textures.get(size);if(!texture){texture=new THREE.DataTexture(pixels||new Float32Array(size*size*4),size,size,THREE.RGBAFormat,THREE.FloatType);texture.minFilter=texture.magFilter=linear?THREE.LinearFilter:THREE.NearestFilter;textures.set(size,texture);}if(pixels)texture.image.data=pixels;texture.needsUpdate=true;return texture;}
  Object.assign(uniforms,{detailField:{value:textureFor(512)},detailBounds:{value:new THREE.Vector4(0,0,1,1)},detailEnabled:{value:0},detailSize:{value:512},detailLinear:{value:Number(linear)},climateSun:{value:new THREE.Vector3()},sourceBounds:{value:new THREE.Vector4(.194,.4,.00148,.00282)}});
  const worker=new Worker(new URL('./detail-worker.mjs',import.meta.url),{type:'module'});
  uniforms.automaticField={value:null};uniforms.sampleClimate={value:0};
  let failedRevision=-1,revision=0,baseRevision=0,sentRevision=-1,sentBaseRevision=-1,working=false,pending=null,currentKey='',currentComplete=false,desiredKey='',lastRequest=null,activeKey='',activeRevision=0,wanted=false,world,readyData=null,active=true,sentDetailBase=null,cancelling=false;
  const status=value=>{if(renderer)renderer.domElement.dataset.detailState=value;};
  const cancel=()=>{if(working&&!cancelling){worker.postMessage({cancel:true});cancelling=true;}};
  function dispatch(){
    if(working||!pending||!world||!active)return;
    status('loading');
    working=true;cancelling=false;activeKey=pending.key;activeRevision=pending.revision;
    const message={...pending},transfers=[];
    if(sentBaseRevision!==baseRevision){const heights=Float32Array.from(world.heights),biomes=Uint8Array.from(world.biomes),detailBaseHeights=world.detailBaseHeights?Float32Array.from(world.detailBaseHeights):undefined;message.world={width:world.width,height:world.height,seed:world.seed,seaLevel:world.seaLevel,regionalDetail:world.regionalDetail,terrainSource:world.terrainSource,heights,biomes,detailBaseHeights,detailStrokes:world.detailStrokes};transfers.push(heights.buffer,biomes.buffer);if(detailBaseHeights)transfers.push(detailBaseHeights.buffer);sentBaseRevision=baseRevision;}
    else if(sentRevision!==revision){message.edits={detailStrokes:world.detailStrokes};if(world.detailBaseHeights!==sentDetailBase){const baseline=world.detailBaseHeights?Float32Array.from(world.detailBaseHeights):undefined;message.edits.detailBaseHeights=baseline;if(baseline)transfers.push(baseline.buffer);}}
    sentDetailBase=world.detailBaseHeights;
    worker.postMessage(message,transfers);sentRevision=revision;pending=null;
  }
  worker.onmessage=({data})=>{
    if(!data.draft){working=false;cancelling=false;}
    if(data.pixels&&data.revision===revision&&wanted&&data.key===desiredKey){
      uniforms.detailField.value=textureFor(data.size,data.pixels);uniforms.detailSize.value=data.size;
      uniforms.detailBounds.value.fromArray(data.bounds);uniforms.detailEnabled.value=1;currentKey=data.key;currentComplete=!data.draft;
      readyData=data;if(renderer){renderer.domElement.dataset.detailBounds=JSON.stringify(data.bounds);renderer.domElement.dataset.detailCenter=JSON.stringify(Array.from(data.pixels.slice((Math.floor(data.size/2)*data.size+Math.floor(data.size/2))*4,(Math.floor(data.size/2)*data.size+Math.floor(data.size/2))*4+4)));}onReady(data);
      if(currentComplete&&pending?.key===data.key&&pending.revision===data.revision)pending=null;
    }
    if(data.error&&data.revision===revision){failedRevision=revision;pending=null;uniforms.detailEnabled.value=0;status('error');sentBaseRevision=-1;onReady({error:true});}
    dispatch();
    if(!working&&!data.error&&failedRevision!==revision)status('ready');
  };
  worker.onerror=()=>{failedRevision=revision;working=false;pending=null;currentKey='';sentBaseRevision=-1;uniforms.detailEnabled.value=0;status('error');onReady({error:true});};
  return {
    update(next,detailOnly=false){const same=next.id===world?.id;if(!detailOnly||!same)baseRevision++;world=next;uniforms.sampleClimate.value=Number(world.terrainSource==='alpine-v1');uniforms.climateSun.value.fromArray(spherePoint(world.sunU,world.sunV));revision++;currentKey='';currentComplete=false;pending=null;if(!same){readyData=null;uniforms.detailEnabled.value=0;}cancel();if(lastRequest)this.request(...lastRequest);},
    request(u,v,spanU,spanV){
      lastRequest=[u,v,spanU,spanV];
      if(!active||failedRevision===revision)return;
      wanted=!(spanU>.8&&spanV>.5);
      if(!wanted){uniforms.detailEnabled.value=0;pending=null;cancel();status('ready');return;}
      const size=renderer&&Math.max(renderer.domElement.clientWidth,renderer.domElement.clientHeight)<1000?512:1024;
      const bounds=detailBounds(u,v,spanU,spanV),key=bounds.join(':')+':'+size;desiredKey=key;
      if(key===currentKey&&currentComplete){pending=null;uniforms.detailEnabled.value=1;return;}
      if(working&&!cancelling&&activeKey===key&&activeRevision===revision){pending=null;return;}
      if(pending?.key===key)return;
      pending={bounds,key,revision,size};cancel();dispatch();
    },
    sample(u,v){return sampleRenderedHeight(world,uniforms.detailEnabled.value?readyData:null,u,v);},
    setActive(value){active=value;if(!value){wanted=false;pending=null;cancel();status('ready');}},
    dispose(){worker.terminate();for(const texture of textures.values())texture.dispose();},
  };
}

export const detailGLSL=`
uniform sampler2D detailField;uniform vec4 detailBounds;uniform float detailEnabled;uniform float detailSize;uniform float detailLinear;uniform vec3 climateSun;uniform vec4 sourceBounds;
uniform sampler2D automaticField;uniform float sampleClimate;
vec2 detailPosition(vec2 uv){return vec2(fract(uv.x-detailBounds.x+.5)-.5,uv.y-detailBounds.y)/detailBounds.zw+.5;}
float detailWeight(vec2 uv){vec2 t=detailPosition(uv);vec2 edge=min(t,1.-t);return detailEnabled*smoothstep(0.,.08,min(edge.x,edge.y));}
float surfaceHeightAt(vec2 uv){
 float weight=detailWeight(uv);if(weight<=0.)return smoothHeightAt(uv);
 vec2 p=detailPosition(uv)*(detailSize-1.),t=(p+.5)/detailSize;float h=0.;
 if(detailLinear>.5)h=texture2D(detailField,t).r;
 else{vec2 base=(floor(p)+.5)/detailSize,f=fract(p),d=vec2(1./detailSize);h=mix(mix(texture2D(detailField,base).r,texture2D(detailField,base+vec2(d.x,0.)).r,f.x),mix(texture2D(detailField,base+vec2(0.,d.y)).r,texture2D(detailField,base+d).r,f.x),f.y);}
 if(weight>=1.)return h;return mix(smoothHeightAt(uv),h,weight);
}
vec2 surfaceStep(){return mix(1./fieldSize,detailBounds.zw/(detailSize-1.),detailEnabled);}
vec2 surfaceGradientAt(vec2 uv){
 float weight=detailWeight(uv);if(weight<=0.)return gradientAt(uv);
 vec2 p=detailPosition(uv)*(detailSize-1.),t=(p+.5)/detailSize,g=vec2(0.);
 if(detailLinear>.5)g=texture2D(detailField,t).ba;
 else{vec2 base=(floor(p)+.5)/detailSize,f=fract(p),d=vec2(1./detailSize);g=mix(mix(texture2D(detailField,base).ba,texture2D(detailField,base+vec2(d.x,0.)).ba,f.x),mix(texture2D(detailField,base+vec2(0.,d.y)).ba,texture2D(detailField,base+d).ba,f.x),f.y);}
 if(weight>=1.)return g;return mix(gradientAt(uv),g,weight);
}
vec3 surfaceColorAt(vec2 uv){
 vec3 base=colorAt(uv);if(detailWeight(uv)<.5)return base;
 float biome=floor(texture2D(detailField,(floor(detailPosition(uv)*detailSize)+.5)/detailSize).g+.5)-1.;
 if(biome<-.5)return base;
 if(biome<.5&&sampleClimate>.5)return texture2D(automaticField,fieldUV(uv)).rgb;
 if(biome>5.5){float h=surfaceHeightAt(uv);vec3 forest=vec3(.23,.31,.22),meadow=vec3(.43,.46,.31),rock=vec3(.47,.46,.42);vec2 t=(uv-sourceBounds.xy)/sourceBounds.zw+.5;float edge=min(min(t.x,1.-t.x),min(t.y,1.-t.y));return mix(base,mix(mix(forest,meadow,smoothstep(.035,.065,h)),rock,smoothstep(.06,.085,h)),smoothstep(0.,.14,edge));}
 if(biome<.5){float lon=uv.x*6.2831853,lat=uv.y*3.14159265;vec3 p=vec3(-cos(lon)*sin(lat),cos(lat),sin(lon)*sin(lat));float heat=dot(p,climateSun)-max(0.,surfaceHeightAt(uv))*.35;vec3 c=mix(vec3(.776,.851,.871),vec3(.188,.318,.224),smoothstep(-.22,-.03,heat));c=mix(c,vec3(.431,.506,.310),smoothstep(.16,.52,heat));return mix(c,vec3(.710,.584,.392),smoothstep(.55,.88,heat));}
 if(biome<1.5)return vec3(.19,.32,.22);if(biome<2.5)return vec3(.43,.51,.31);
 if(biome<3.5)return vec3(.71,.58,.39);if(biome<4.5)return vec3(.78,.85,.87);return vec3(.34,.30,.28);
}
`;
