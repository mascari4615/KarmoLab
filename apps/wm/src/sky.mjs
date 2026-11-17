import * as THREE from 'three';
export function createWeather(seed,onReady=()=>{}) {
  const initial=new Uint8Array(1024*512*4);for(let i=0;i<initial.length;i+=4){initial[i+1]=initial[i+2]=128;initial[i+3]=255;}
  const t=new THREE.DataTexture(initial,1024,512,THREE.RGBAFormat);t.wrapS=THREE.RepeatWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;
  const worker=new Worker(new URL('./weather-worker.mjs',import.meta.url),{type:'module'});let alive=true;
  t.addEventListener('dispose',()=>{alive=false;worker.terminate();});
  worker.onmessage=({data})=>{worker.terminate();if(!alive)return;t.image.data=data.data;t.needsUpdate=true;onReady('ready');};
  worker.onerror=()=>{worker.terminate();onReady('error');};worker.postMessage(seed);return t;
}
export const weatherGLSL=`
uniform sampler2D weatherField;uniform float time;uniform float cloudAmount;uniform vec3 sunDirection;
float cloudAt(vec3 p){vec2 uv=globeUV(normalize(p));uv.x+=time*.000006;float density=texture2D(weatherField,uv).r;return smoothstep(.60-cloudAmount*.18,.84-cloudAmount*.20,density)*min(1.,cloudAmount*2.);}
`;
