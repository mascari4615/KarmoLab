// 손그림의 북부/남부 산맥 범위 안에서 생성하는 시각 지형. 지명과 실제 고도 미정.
const chains = [
  [[0,.055],[.10,.07],[.20,.045],[.29,.095],[.37,.055],[.46,.12],[.55,.075],[.65,.11],[.75,.06],[.86,.045],[1,.085]],
  [[0,.96],[.12,.93],[.24,.96],[.34,.90],[.43,.96],[.54,.91],[.64,.96],[.74,.91],[.84,.96],[.93,.92],[1,.96]],
];
function segmentDistance(x,y,a,b) {
  const dx=(b[0]-a[0])*1.78,dy=b[1]-a[1], px=(x-a[0])*1.78,py=y-a[1];
  const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy)));
  return [Math.hypot(px-dx*t,py-dy*t),t];
}
export function makeRidges(seed) {
  const segments=[];
  for (let side=0;side<chains.length;side++) {
    const chain=chains[side];
    for(let i=1;i<chain.length;i++) {
      const a=chain[i-1],b=chain[i]; segments.push({a,b,width:.017,height:.55+(i%3)*.07});
      for(let j=0;j<3;j++) {
        const t=(j+.3)/3,root=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
        const sign=side===0?1:-1, bend=Math.sin(i*7+j*3+seed)*.018;
        const middle=[root[0]+bend,root[1]+sign*(.027+j*.004)];
        const tip=[middle[0]+bend*.8,middle[1]+sign*(.025+(i%2)*.018)];
        segments.push({a:root,b:middle,width:.010,height:.42,taper:.45},{a:middle,b:tip,width:.007,height:.24,taper:.9});
      }
    }
  }
  return (u,v) => {
    if(v>.26&&v<.74)return 0;
    let height=0;
    for(const s of segments) {
      if(Math.abs(v-(s.a[1]+s.b[1])*.5)>.13)continue;
      const [distance,t]=segmentDistance(u,v,s.a,s.b);
      const peaks=.64+.36*Math.sin(Math.PI*t)**2;
      height=Math.max(height,s.height*peaks*(1-(s.taper||0)*t)*Math.exp(-distance/(s.width*.65)));
    }
    return height;
  };
}
