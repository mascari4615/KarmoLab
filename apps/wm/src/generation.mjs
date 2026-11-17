export function generateWorld(options,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('취소됨','AbortError'));return;}
  const worker=new Worker(new URL('./generation-worker.mjs',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>{finish();reject(new Error('지형 생성 시간이 초과됐어요. 다시 시도해 주세요.'));},30000);
  const finish=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);};
  const abort=()=>{finish();reject(new DOMException('취소됨','AbortError'));};signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=({data})=>{finish();data.error?reject(new Error(data.error)):resolve(data.world);};
  worker.onerror=()=>{finish();reject(new Error('지형을 생성하지 못했어요. 다시 시도해 주세요.'));};worker.postMessage(options);
});}
