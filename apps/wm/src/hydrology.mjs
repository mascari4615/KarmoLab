// 해안에서 우선 침수한 순서로 함몰지의 유출 방향 연결
export function rivers(world){
 const {width:w,height:h,heights,seaLevel}=world,n=w*h;
 const filled=Float32Array.from(heights),parent=new Int32Array(n).fill(-1),visited=new Uint8Array(n),order=[],heap=[];
 const push=i=>{let k=heap.length;heap.push(i);while(k){const p=(k-1)>>1;if(filled[heap[p]]<=filled[i])break;heap[k]=heap[p];k=p;}heap[k]=i;};
 const pop=()=>{const result=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let c=k*2+1;if(c+1<heap.length&&filled[heap[c+1]]<filled[heap[c]])c++;if(filled[last]<=filled[heap[c]])break;heap[k]=heap[c];k=c;}heap[k]=last;}return result;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(heights[i]>seaLevel)continue;
  visited[i]=1;
  if(heights[y*w+(x+1)%w]>seaLevel||heights[y*w+(x+w-1)%w]>seaLevel||(y>0&&heights[i-w]>seaLevel)||(y<h-1&&heights[i+w]>seaLevel))push(i);
 }
 if(!heap.length)return [];
 while(heap.length){const i=pop();order.push(i);const x=i%w,y=Math.floor(i/w);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if((!dx&&!dy)||y+dy<0||y+dy>=h)continue;const j=(y+dy)*w+(x+dx+w)%w;if(visited[j])continue;
   visited[j]=1;parent[j]=i;filled[j]=Math.max(filled[j],filled[i]+.0000001);push(j);
  }
 }
 const flow=new Float32Array(n).fill(1),threshold=Math.max(35,n*.00125),upstream=new Uint8Array(n);
 for(let k=order.length-1;k>=0;k--){const i=order[k];if(parent[i]>=0){flow[parent[i]]+=flow[i];if(flow[i]>threshold)upstream[parent[i]]=1;}}
 const used=new Uint8Array(n),result=[];
 for(const source of order){
  if(flow[source]<threshold||upstream[source]||heights[source]<=seaLevel)continue;
  let i=source;const path=[];
  while(i>=0&&path.length<1500){path.push([i%w/w,Math.floor(i/w)/(h-1),flow[i]]);if(used[i]||heights[i]<=seaLevel)break;used[i]=1;i=parent[i];}
  if(path.length>5)result.push(path);
 }
 return result;
}
