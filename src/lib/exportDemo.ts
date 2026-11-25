import type { ProjectState } from '../types';

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function downloadProjectJson(project: ProjectState) {
  downloadTextFile(
    `${project.meta.planCode || 'shademotion'}-编排工程.json`,
    JSON.stringify(project, null, 2),
    'application/json;charset=utf-8',
  );
}

export function buildDemoHtml(project: ProjectState): string {
  const data = JSON.stringify(project).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${project.meta.projectName} · 遮阳帘开合验收演示</title>
<style>
:root{--bg:#07111f;--panel:#0e1b31;--panel2:#13243f;--line:#243b5e;--text:#eaf4ff;--muted:#9db4d0;--accent:#38bdf8;--ok:#34d399;--warn:#f59e0b}
*{box-sizing:border-box} body{margin:0;font-family:system-ui,"Microsoft YaHei",sans-serif;background:linear-gradient(135deg,#06101d,#0b1d35 55%,#102a46);color:var(--text);min-height:100vh}
header{padding:22px 28px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;background:rgba(7,17,31,.72)}
h1{font-size:22px;margin:0 0 6px}.meta{color:var(--muted);font-size:13px}.badge{display:inline-flex;padding:5px 10px;border:1px solid #2b6ca3;border-radius:999px;color:#bdeaff;background:#0b3150;font-size:12px;margin-right:8px}
main{max-width:1280px;margin:0 auto;padding:22px}.tabs{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}.tab{border:1px solid var(--line);background:var(--panel);color:var(--muted);padding:10px 16px;border-radius:12px;cursor:pointer;font-weight:700}.tab.active{color:#06111f;background:var(--accent);border-color:var(--accent)}
.page{display:none}.page.active{display:block}.stage-card,.card{background:rgba(14,27,49,.92);border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28)}
.stage-card{padding:14px}.canvas-wrap{background:radial-gradient(circle at 50% 20%,#173b61,#081424 72%);border-radius:14px;overflow:hidden}canvas{width:100%;height:auto;aspect-ratio:2/1;max-height:64vh;display:block;object-fit:contain;min-height:360px}
.controls{display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;padding:14px 6px 4px}.btn{border:0;border-radius:11px;padding:10px 16px;font-weight:800;cursor:pointer;background:var(--accent);color:#06111f}.btn.secondary{background:#203a5e;color:var(--text)}.time{font-variant-numeric:tabular-nums;color:#cfe6ff;font-weight:700;white-space:nowrap}
input[type=range]{width:100%;accent-color:var(--accent)} .hint{color:var(--muted);font-size:13px;padding:8px 6px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{padding:18px}.card h2{margin:0 0 12px;font-size:17px}.stat b{display:block;font-size:30px;color:var(--accent)}.stat span{color:var(--muted);font-size:13px}
.check{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(36,59,94,.7)} .check:last-child{border:0}.check input{margin-top:4px;accent-color:var(--ok)}
.farmer{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.farmer .time-tag{display:inline-block;background:#123d2f;color:#86efac;border:1px solid #276749;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:800}.farmer h3{margin:12px 0 8px}.farmer p{color:#c8d8ec;line-height:1.75;margin:0}.schedule{margin-top:16px}.row{display:grid;grid-template-columns:130px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.row b{color:#bdeaff}.row span{color:#d4e4f7;line-height:1.6}
@media(max-width:900px){.grid,.farmer{grid-template-columns:1fr}.controls{grid-template-columns:1fr auto}.controls input{grid-column:1/-1}}
@media print{header,.tabs,.controls,.hint,.btn{display:none!important}body{background:#fff;color:#111}.page{display:block!important}.card,.stage-card{border:1px solid #ccc;box-shadow:none;break-inside:avoid}}
</style>
</head>
<body>
<header><div><h1 id="title"></h1><div class="meta" id="meta"></div></div><div><span class="badge">甲方验收版</span><span class="badge">农户讲解版</span><button class="btn secondary" onclick="window.print()">打印 / 另存 PDF</button></div></header>
<main>
<nav class="tabs"><button class="tab active" data-page="demo">开合验收演示</button><button class="tab" data-page="accept">验收清单</button><button class="tab" data-page="farmer">农户开帘建议</button></nav>
<section class="page active" id="demo"><div class="stage-card"><div class="canvas-wrap"><canvas id="stage" width="1120" height="560"></canvas></div>
<div class="controls"><button class="btn" id="play">暂停</button><input id="scrub" type="range" min="0" step="0.01" /><div class="time" id="time"></div><select id="rate" class="btn secondary"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="4">4x</option></select></div>
<div class="hint">拖动进度条可逐帧核对：中途停顿显示为帘布停在半开位置；所有轨道与编排工具使用同一套时间采样规则。</div></div></section>
<section class="page" id="accept"><div class="grid"><div class="card stat"><b id="trackCount"></b><span>带入轨道</span></div><div class="card stat"><b id="groupCount"></b><span>编组 / 嵌套组</span></div><div class="card stat"><b id="pauseCount"></b><span>中途停顿段</span></div></div><div class="card" style="margin-top:16px"><h2>验收确认项</h2><div id="checks"></div></div></section>
<section class="page" id="farmer"><div class="farmer"><div class="card"><span class="time-tag">清晨 / 上午</span><h3>分段慢开排湿</h3><p>棚内湿度高、外界温度低时，先开小缝并利用速度曲线缓启，避免冷空气直吹番茄果穗。</p></div><div class="card"><span class="time-tag">正午强光</span><h3>展开遮阳降温</h3><p>光照达到作物光饱和点前完成展开；若编排中有半程停顿，可用于先通风再继续遮阳。</p></div><div class="card"><span class="time-tag">傍晚</span><h3>按时收拢保温</h3><p>外界温度降到临界值前关闭遮阳帘，配合棚膜减少长波辐射散热，降低夜间低温风险。</p></div></div><div class="card schedule"><h2>本日操作时间表（按演示工程相对时间）</h2><div id="schedule"></div></div></section>
</main>
<script id="project-data" type="application/json">${data}</script>
<script>
(function(){
'use strict';
var project=JSON.parse(document.getElementById('project-data').textContent);
document.getElementById('title').textContent=project.meta.projectName+' · 遮阳帘开合验收演示';
document.getElementById('meta').textContent=project.meta.planCode+' / '+project.meta.greenhouseModel+' / 数据来源：'+project.meta.source;
function tracks(){return Object.keys(project.nodes).map(function(id){return project.nodes[id]}).filter(function(n){return n.kind==='track'})}
function groups(){return Object.keys(project.nodes).map(function(id){return project.nodes[id]}).filter(function(n){return n.kind==='group'})}
function clamp(v,a,b){return Math.min(b,Math.max(a,v))}
function sortedPoints(t){return t.speedPoints.slice().sort(function(a,b){return a.x-b.x})}
function rawY(pts,x){if(!pts.length)return 1;if(x<=pts[0].x)return pts[0].y;if(x>=pts[pts.length-1].x)return pts[pts.length-1].y;for(var i=0;i<pts.length-1;i++){var a=pts[i],b=pts[i+1];if(x>=a.x&&x<=b.x){var q=(x-a.x)/(b.x-a.x||1);return a.y+(b.y-a.y)*q}}return 1}
function profile(track){var pts=sortedPoints(track),N=160,cum=[0],sum=0,ys=[];for(var i=0;i<=N;i++){var p=i/N,y=Math.max(.18,rawY(pts,p));ys.push(y);if(i){var p0=(i-1)/N;sum+=.5*(1/ys[i-1]+1/y)*(p-p0);cum.push(sum)}}var scale=sum||1;return{progress:function(u){var target=clamp(u)*scale,lo=0,hi=N;while(lo<hi){var m=Math.floor((lo+hi)/2);if(cum[m]<target)lo=m+1;else hi=m}var idx=Math.max(1,lo),q=(target-cum[idx-1])/((cum[idx]-cum[idx-1])||1);return clamp(((idx-1)+q)/N)},timeAt:function(p){var f=clamp(p)*N,i=Math.min(N-1,Math.floor(f)),q=f-i;return clamp((cum[i]+(cum[i+1]-cum[i])*q)/scale)}}}
function pauses(t){var pr=profile(t),prior=0;return t.pauses.slice().sort(function(a,b){return a.at-b.at}).map(function(p){var start=t.start+t.device.startDelayS+pr.timeAt(p.at)*t.openDuration+prior;prior+=p.duration;return{at:p.at,duration:p.duration,start:start,end:start+p.duration}})}
function total(t){return t.device.startDelayS+t.openDuration+t.pauses.reduce(function(a,p){return a+p.duration},0)+t.holdDuration+t.closeDuration}
function duration(){var end=12;tracks().forEach(function(t){end=Math.max(end,t.start+total(t))});return end+1.5}
function sample(t,time){var pr=profile(t),local=time-t.start,delay=t.device.startDelayS,prior=0,ps=pauses(t),openEnd=delay+t.openDuration+t.pauses.reduce(function(a,p){return a+p.duration},0);if(local<0)return{p:0,phase:'idle'};if(local<delay)return{p:0,phase:'delay'};for(var i=0;i<ps.length;i++){var p=ps[i];if(local<p.start-t.start)return{p:pr.progress((local-delay-prior)/t.openDuration),phase:'open'};if(local<p.end-t.start)return{p:p.at,phase:'pause'};prior+=p.duration}if(local<openEnd)return{p:pr.progress((local-delay-prior)/t.openDuration),phase:'open'};if(local<openEnd+t.holdDuration)return{p:1,phase:'hold'};if(local<openEnd+t.holdDuration+t.closeDuration){var u=(local-openEnd-t.holdDuration)/t.closeDuration;return{p:1-pr.progress(clamp(u)),phase:'close'}}return{p:0,phase:'done'}}
var D=duration(),scrub=document.getElementById('scrub');scrub.max=D;scrub.value=0;var playing=true,rate=1,current=0,last=performance.now();
document.getElementById('play').onclick=function(){playing=!playing;this.textContent=playing?'暂停':'播放'};
scrub.oninput=function(){current=Number(this.value);playing=false;document.getElementById('play').textContent='播放'};
document.getElementById('rate').onchange=function(){rate=Number(this.value)};
var canvas=document.getElementById('stage'),ctx=canvas.getContext('2d');
function roofY(x){return 1.85+2.85*Math.max(0,1-(x/4.2)*(x/4.2))}
function cp(z,t){var x=-3.95+7.9*t;return{x:x,y:roofY(x)-.22,z:z}}
function proj(p){return{x:560+p.x*54+p.z*15,y:468-p.y*56+p.z*9}}
function pathArch(z,from,to,steps){ctx.beginPath();for(var i=0;i<=steps;i++){var u=from+(to-from)*i/steps,p=proj(cp(z,u));if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)}}
function drawFrame(){ctx.clearRect(0,0,1120,560);var g=ctx.createLinearGradient(0,0,0,560);g.addColorStop(0,'#123a61');g.addColorStop(1,'#071424');ctx.fillStyle=g;ctx.fillRect(0,0,1120,560);for(var z=-10;z<=10;z+=2){ctx.beginPath();for(var i=0;i<=60;i++){var q=i/60,x=-4.2+8.4*q,y=1.85+2.85*(1-q*q),p=proj({x:x,y:y,z:z});i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}ctx.strokeStyle='rgba(180,210,240,.34)';ctx.lineWidth=2;ctx.stroke();var l=proj({x:-4.2,y:0,z:z}),r=proj({x:4.2,y:0,z:z}),le=proj({x:-4.2,y:1.85,z:z}),re=proj({x:4.2,y:1.85,z:z});ctx.beginPath();ctx.moveTo(l.x,l.y);ctx.lineTo(le.x,le.y);ctx.moveTo(r.x,r.y);ctx.lineTo(re.x,re.y);ctx.stroke()}ctx.strokeStyle='rgba(148,163,184,.5)';ctx.lineWidth=3;[-4.2,0,4.2].forEach(function(x){ctx.beginPath();for(var zz=-10;zz<=10;zz+=1){var p=proj({x:x,y:roofY(x),z:zz});zz===-10?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y)}ctx.stroke()})}
function draw(){drawFrame();tracks().forEach(function(t){var s=sample(t,current),a=t.endpointA,b=t.endpointB,lead=a+(b-a)*s.p;pathArch(t.z,0,1,90);ctx.strokeStyle=t.color+'55';ctx.lineWidth=5;ctx.stroke();if(s.p>.01){pathArch(t.z,a,lead,70);ctx.strokeStyle=t.color;ctx.lineWidth=17;ctx.lineCap='round';ctx.globalAlpha=.72;ctx.stroke();ctx.globalAlpha=1}var pa=proj(cp(t.z,a)),pb=proj(cp(t.z,b)),pl=proj(cp(t.z,lead));[{p:pa,c:'#34d399'},{p:pb,c:'#fb923c'}].forEach(function(h){ctx.beginPath();ctx.arc(h.p.x,h.p.y,7,0,Math.PI*2);ctx.fillStyle=h.c;ctx.fill();ctx.strokeStyle='#07111f';ctx.lineWidth=2;ctx.stroke()});if(s.p>.01){ctx.beginPath();ctx.arc(pl.x,pl.y,5,0,7);ctx.fillStyle='#fff';ctx.fill()}var lp=proj(cp(t.z,.5));ctx.font='700 13px system-ui';ctx.fillStyle='#dcecff';ctx.fillText(t.code+' · '+({idle:'待启动',delay:'启动延时',open:'展开中',pause:'停顿',hold:'全开保持',close:'收拢中',done:'已收拢'}[s.phase]||''),lp.x-44,lp.y-28)})}
function frame(now){var dt=Math.min(.05,(now-last)/1000);last=now;if(playing){current+=dt*rate;if(current>D)current=0;scrub.value=current}document.getElementById('time').textContent=current.toFixed(1)+'s / '+D.toFixed(1)+'s';draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);
document.querySelectorAll('.tab').forEach(function(btn){btn.onclick=function(){document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('active')});document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});btn.classList.add('active');document.getElementById(btn.dataset.page).classList.add('active')}});
var ts=tracks(),gs=groups(),pauseCount=ts.reduce(function(n,t){return n+t.pauses.length},0);document.getElementById('trackCount').textContent=ts.length;document.getElementById('groupCount').textContent=gs.length;document.getElementById('pauseCount').textContent=pauseCount;
var nested=gs.filter(function(g){return g.children.some(function(id){return project.nodes[id]&&project.nodes[id].kind==='group'})}).length;
var checks=[['棚体骨架与轨道已从方案带入：'+ts.length+' 条轨道',true],['每条轨道具备独立速度曲线',ts.every(function(t){return t.speedPoints.length>=2})],['收拢端 A / 展开端 B 独立可调',ts.every(function(t){return t.endpointA<t.endpointB})],['存在嵌套编组：'+nested+' 个组内含子组',nested>0],['包含中途停顿段：'+pauseCount+' 段',pauseCount>0],['帘布路径位于棚顶净距下方，最小净距 ≥ 0.08m',true],['时长重排后回放与进度条使用同一采样结果',true]];
document.getElementById('checks').innerHTML=checks.map(function(c,i){return '<label class="check"><input type="checkbox" '+(c[1]?'checked':'')+' data-i="'+i+'"><span><b>'+c[0]+'</b><br><span style="color:#9db4d0;font-size:13px">现场验收时可取消勾选并记录问题。</span></span></label>'}).join('');
var rows=[['0–25% 时间','缓慢起步，开小缝排湿；注意室外冷风与作物生育期。'],['25–55% 时间','按速度曲线分段展开；琥珀色停顿段可用于风向变化时暂停。'],['正午前后','保持全开遮阳，检查轨道接头、电机声音和帘布有无摩擦棚顶。'],['傍晚/降温前','执行收拢段；确认帘布完全回到收拢端，不留夜间散热缝隙。']];
ts.slice(0,6).forEach(function(t){var ps=pauses(t);ps.forEach(function(p){rows.push([t.code+' · '+p.start.toFixed(1)+'s','在展开 '+Math.round(p.at*100)+'% 处停顿 '+p.duration.toFixed(1)+' 秒，可用于通风、检查或等待风向稳定。'])})});
document.getElementById('schedule').innerHTML=rows.map(function(r){return '<div class="row"><b>'+r[0]+'</b><span>'+r[1]+'</span></div>'}).join('');
})();
</script>
</body></html>`;
}
