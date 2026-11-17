export function observePerformance(stage) {
  let last = performance.now(), samples = [], longTasks = 0, interaction = null;
  const pointers = new Set();
  if (typeof PerformanceObserver !== 'undefined') {
    try { new PerformanceObserver(list => { longTasks += list.getEntries().length; stage.dataset.longTasks = String(longTasks); }).observe({ type: 'longtask', buffered: true }); } catch {}
    try {new PerformanceObserver(list=>{stage.dataset.slowFrame=JSON.stringify(list.getEntries().map(entry=>({duration:entry.duration,blocking:entry.blockingDuration,scripts:entry.scripts?.map(script=>({duration:script.duration,function:script.sourceFunctionName,source:script.sourceURL}))})).slice(-3));}).observe({type:'long-animation-frame',buffered:true});}catch{}
  }
  const begin = event => {
    if (event.target.tagName !== 'CANVAS') return;
    const now = performance.now();
    interaction ??= {start:now,last:now,samples:[],tasks:longTasks};
    interaction.last = now;
    if (event.type === 'pointerdown') pointers.add(event.pointerId);
  };
  for (const type of ['pointerdown','wheel','keydown']) stage.addEventListener(type,begin,{capture:true,passive:true});
  stage.addEventListener('pointermove',()=>{if(interaction&&pointers.size)interaction.last=performance.now();},{passive:true});
  for (const type of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(type,event=>{pointers.delete(event.pointerId);if(interaction)interaction.last=performance.now();},{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{last=performance.now();samples=[];interaction=null;pointers.clear();});
  const stats = values => {
    const sorted=[...values].sort((a,b)=>a-b);
    return {mean:(values.reduce((a,b)=>a+b,0)/values.length).toFixed(2),p95:sorted[Math.floor(sorted.length*.95)].toFixed(2),max:sorted.at(-1).toFixed(2)};
  };
  function frame(now) {
    const delta=now-last;last=now;
    if (!document.hidden) {
      samples.push(delta);
      if(interaction){
        interaction.samples.push(delta);
        if(!pointers.size&&now-interaction.last>700){
          const result=stats(interaction.samples);
          stage.dataset.interaction=JSON.stringify({...result,frames:interaction.samples.length,duration:Math.round(now-interaction.start),longTasks:longTasks-interaction.tasks});
          interaction=null;
        }
      }
    }
    if (samples.length >= 120) {
      const result=stats(samples);
      stage.dataset.frameMeanMs=result.mean;stage.dataset.frameP95Ms=result.p95;samples=[];
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
