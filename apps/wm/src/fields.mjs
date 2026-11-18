import * as THREE from 'three';
import { paintedRows } from './terrain.mjs';
import {sampleClimateColor} from './sample-climate.mjs';

const palette=[[113,145,101],[71,107,75],[141,159,107],[198,169,118],[204,224,225],[102,91,78]];
const surfacePalette=[[80,108,76],[48,81,57],[110,129,79],[181,149,100],[198,217,222],[87,78,72]];
const smooth=(a,b,value)=>{const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);};
export function createFields({surface=false}={}) {
  let width=0,height=0,elevation,colors,automatic,longitudeCos,longitudeSin,previousWorld,previousHeights,previousBiomes,previousClimate,revision=-1;
  const autoColor=new Float64Array(3);
  const texture=data=>{const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;};
  return {
    update(world){
      if(width!==world.width||height!==world.height){
        elevation?.dispose();colors?.dispose();automatic?.dispose();width=world.width;height=world.height;
        elevation=texture(new Uint8Array(width*height*4));colors=texture(new Uint8Array(width*height*4));
        automatic=texture(new Uint8Array(width*height*4));
        longitudeCos=Float64Array.from({length:width},(_,x)=>Math.cos(x/width*Math.PI*2));
        longitudeSin=Float64Array.from({length:width},(_,x)=>Math.sin(x/width*Math.PI*2));
      }
      const a=elevation.image.data,b=colors.image.data;
      const climate=[world.seed,world.seaLevel,world.sunU,world.sunV].join(':');
      const range=paintedRows(world,previousWorld===world&&previousHeights===world.heights&&previousBiomes===world.biomes&&previousClimate===climate?revision:-1);
      previousWorld=world;previousHeights=world.heights;previousBiomes=world.biomes;previousClimate=climate;revision=range.revision;
      const sunAngle=world.sunU*Math.PI*2,sunY=Math.cos(world.sunV*Math.PI),sunR=Math.sin(world.sunV*Math.PI);
      const sunCos=Math.cos(sunAngle),sunSin=Math.sin(sunAngle);
      for(let y=range.top;y<=range.bottom;y++){
        const latitude=y/(height-1)*Math.PI,ring=Math.sin(latitude),py=Math.cos(latitude);
        for(let x=0;x<width;x++){
          const i=y*width+x,h=world.heights[i],encoded=Math.round((h+1)*32767.5);
          const gx=(world.heights[y*width+(x+1)%width]-world.heights[y*width+(x+width-1)%width])*width/(4*Math.PI*Math.max(.045,ring));
          const gy=(world.heights[Math.min(height-1,y+1)*width+x]-world.heights[Math.max(0,y-1)*width+x])*(height-1)/(2*Math.PI);
          a[i*4]=encoded>>>8;a[i*4+1]=encoded&255;
          a[i*4+2]=Math.round((Math.atan(gx*.03)/Math.PI+.5)*255);a[i*4+3]=Math.round((Math.atan(gy*.03)/Math.PI+.5)*255);
          const heat=(longitudeCos[x]*sunCos+longitudeSin[x]*sunSin)*ring*sunR+py*sunY-Math.max(0,h)*.35;
          const biome=world.biomes[i]||(heat<-.15?4:heat>.7?3:heat>.2?2:1);
          const sampleClimate=world.terrainSource==='alpine-v1';
          if(sampleClimate){sampleClimateColor(world,x/width,y/(height-1),h,heat,autoColor);for(let c=0;c<3;c++)automatic.image.data[i*4+c]=autoColor[c];}
          let c=(surface?surfacePalette:palette)[biome];
          if(!world.biomes[i]&&!sampleClimate){
            const thaw=smooth(-.22,-.03,heat),grass=smooth(.16,.52,heat),dry=smooth(.55,.88,heat);
            const iceWeight=(1-thaw)*(1-grass)*(1-dry),forestWeight=thaw*(1-grass)*(1-dry),grassWeight=grass*(1-dry);
            for(let channel=0;channel<3;channel++)autoColor[channel]=surfacePalette[4][channel]*iceWeight+surfacePalette[1][channel]*forestWeight+surfacePalette[2][channel]*grassWeight+surfacePalette[3][channel]*dry;
            c=autoColor;
          }
          if(!world.biomes[i]&&sampleClimate)c=autoColor;
          b[i*4]=c[0];b[i*4+1]=c[1];b[i*4+2]=c[2];b[i*4+3]=biome;
        }
      }
      elevation.needsUpdate=true;colors.needsUpdate=true;automatic.needsUpdate=world.terrainSource==='alpine-v1';
      return {elevation,colors,automatic};
    },
    dispose(){elevation?.dispose();colors?.dispose();automatic?.dispose();},
  };
}

export const fieldGLSL=`
uniform sampler2D elevationField; uniform sampler2D colorField;
uniform vec2 fieldSize; uniform float seaLevel; uniform float snowLevel; uniform float seed;
vec2 fieldUV(vec2 uv){return vec2(uv.x+.5/fieldSize.x,(uv.y*(fieldSize.y-1.)+.5)/fieldSize.y);}
float heightAt(vec2 uv){vec2 value=texture2D(elevationField,fieldUV(uv)).rg;return dot(value,vec2(65280.,255.))/32767.5-1.;}
vec2 gradientAt(vec2 uv){return tan((texture2D(elevationField,fieldUV(uv)).ba-.5)*3.14159265)/.03;}
float globeSlopeHeightAt(vec2 uv){float cap=min(uv.y,1.-uv.y);return mix(heightAt(vec2(0.,step(.5,uv.y))),heightAt(uv),smoothstep(0.,.06,cap));}
float smoothHeightAt(vec2 uv){
 vec2 pixel=vec2(uv.x*fieldSize.x,uv.y*(fieldSize.y-1.)),base=floor(pixel),f=fract(pixel),f2=f*f,f3=f2*f;
 vec2 w0=(1.-3.*f+3.*f2-f3)/6.,w1=(4.-6.*f2+3.*f3)/6.,w2=(1.+3.*f+3.*f2-3.*f3)/6.,w3=f3/6.;
 vec2 g0=w0+w1,g1=w2+w3,p0=(base-1.+w1/g0+.5)/fieldSize,p1=(base+1.+w3/g1+.5)/fieldSize;
 vec2 a=texture2D(elevationField,p0).rg,b=texture2D(elevationField,vec2(p1.x,p0.y)).rg,c=texture2D(elevationField,vec2(p0.x,p1.y)).rg,d=texture2D(elevationField,p1).rg;
 vec2 value=mix(mix(a,b,g1.x),mix(c,d,g1.x),g1.y);float result=dot(value,vec2(65280.,255.))/32767.5-1.;float cap=min(uv.y,1.-uv.y);return mix(heightAt(vec2(0.,step(.5,uv.y))),result,smoothstep(0.,.06,cap));
}
vec3 colorAt(vec2 uv){
  vec2 d=1./fieldSize;
  return (texture2D(colorField,fieldUV(uv)).rgb*4.+texture2D(colorField,fieldUV(uv+d)).rgb+texture2D(colorField,fieldUV(uv-d)).rgb+texture2D(colorField,fieldUV(uv+vec2(d.x,-d.y))).rgb+texture2D(colorField,fieldUV(uv+vec2(-d.x,d.y))).rgb)/8.;
}
vec2 globeUV(vec3 p){return vec2(fract(atan(p.z,-p.x)/6.28318530718),acos(clamp(p.y,-1.,1.))/3.14159265359);}
float fieldHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);}
float fieldNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fieldHash(i),fieldHash(i+vec2(1,0)),f.x),mix(fieldHash(i+vec2(0,1)),fieldHash(i+vec2(1,1)),f.x),f.y);}
vec3 fieldNoiseGradient(vec2 p){vec2 i=floor(p),f=fract(p),s=f*f*(3.-2.*f),d=6.*f*(1.-f);float a=fieldHash(i),b=fieldHash(i+vec2(1,0)),c=fieldHash(i+vec2(0,1)),e=fieldHash(i+vec2(1,1));return vec3(mix(mix(a,b,s.x),mix(c,e,s.x),s.y),mix(b-a,e-c,s.y)*d.x,mix(c-a,e-b,s.x)*d.y);}
vec3 terrainColor(vec2 uv,float h){
 vec3 color=colorAt(uv);float rock=clamp((h-seaLevel-.13)*4.5,0.,.85),snow=clamp((h-seaLevel-snowLevel)*9.,0.,.9);
 color=mix(color,vec3(.66,.61,.52),rock);color=mix(color,vec3(.92,.92,.88),snow);
 float variation=fieldNoise(uv*vec2(190.,107.))*.65+fieldNoise(uv*vec2(63.,35.))*.35;
 return color*(.94+variation*.12);
}`;
