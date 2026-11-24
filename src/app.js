(() => {
'use strict';
const stops = [
  {name:'One Piece', place:'Thousand Sunny', scene:'The Thousand Sunny’s deck', ink:'#994c31'},
  {name:'Naruto', place:'Ichiraku Ramen', scene:'Ichiraku Ramen in Konoha', ink:'#426744'},
  {name:'Attack on Titan', place:'Shiganshina District', scene:'Shiganshina District', ink:'#3d6074'},
  {name:'Jujutsu Kaisen', place:'Tokyo Jujutsu High', scene:'Tokyo Jujutsu High', ink:'#765575'}
];
const $ = id => document.getElementById(id);
const icon = name => '<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
// Each station has a rubber-stamp illustration of its own landmark.
function stamp(index) {
  const drawings = [
    '<path d="M19 48q15-1 29-9l11 2-7 11q-15 10-29 4ZM35 43V19l3 1v22m-6-20Q21 28 21 39q6-3 12-3m6-13 12 9-11 3M15 60q5-4 10-1t10 0 10 0 10-1"/><circle cx="52" cy="40" r="4"/><path d="m52 32 1 3m6 1-2 2m4 3-4 1M36 20l9-1-2 4-6 1"/>',
    '<path d="M15 38q20 5 42 0-4 15-18 17v3h-7v-3q-13-3-17-17Zm0 0q18-7 42 0M21 40q14 5 29 1m-14-6 16-17m-12 18 18-15M23 32q-5-4 0-8m7 8q-5-6 0-11"/><path d="M21 46q3 4 7 5"/><circle cx="45" cy="36" r="3"/>',
    '<path d="M15 53V35l8-3v-6l6 2v4l5-1v-9l5-3 7 4v10l8-2v-4l5 2v25Zm0-15 19-5 12 3 13-3M34 32v21m12-18v19M23 44v-5m6 3v-4m10 3v-4m11 6v-5m-27 14v-3m6 2v-4m10 5v-6"/><path d="m19 29 4-6 6 3m5-5 5-6 7 6M16 56h43"/>',
    '<path d="M15 27q20 4 43 0l-3 5q-19 3-37 0Zm4 11q15 2 34 0v4q-17 2-34-1Zm5-5-2 23h4l3-23m14 0 3 23h4l-3-23M36 33v6m-17 19h35M13 24q23 5 47-1"/><path d="m28 61 8-11 8 11m-10-7h5m-8 4h11"/>'
  ];
  return '<svg class="stamp" viewBox="0 0 74 74" role="presentation" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="37" cy="37" r="34" stroke-width="1.6"/><circle cx="37" cy="37" r="31.5" stroke-width=".75" stroke-dasharray="2.2 1.5"/><g stroke-width="1.8">'+drawings[index]+'</g></svg>';
}
const storageKey = 'memory-railway.tickets.v1';
let entries = {};
try { const saved=JSON.parse(localStorage.getItem(storageKey)||'{}'); if(saved && typeof saved==='object')entries=saved; } catch {}
let selected = 0, bookIndex = 0;
let phase = 'home', personIndex = -1, elapsed = 0, phaseTime = 0, distance = 0, startDistance = 0;
let doorOpen=0, priorStation=null, priorOffset=0, pendingStop=null;
let scene, camera, renderer, railway, station, path, desiredEye, desiredLook, currentLook, lastTime;
let dragX = 0, dragY = 0, dragging = null, dx = 0, dy = 0;
let soundOn = false, audio, master;
const media = matchMedia('(prefers-reduced-motion: reduce)');
const stationButtons = [];
const tabs = [];
stops.forEach((s,i)=>{
  const num=String(i+1).padStart(2,'0');
  const b=document.createElement('button'); b.className='station';
  b.setAttribute('aria-label','Travel to '+s.name+', '+s.place);
  b.setAttribute('aria-pressed','false');
  b.innerHTML='<span class="ticket-no"><b>'+num+'</b> STATION</span>'+stamp(i)+'<span><strong>'+s.name+'</strong><span class="place">'+s.place+'</span></span>';
  b.onclick=()=>ride(i); $('stations').append(b); stationButtons.push(b);
  const t=document.createElement('button'); t.className='tab'; t.textContent=s.name; t.onclick=()=>openPage(i);
  $('book-tabs').append(t); tabs.push(t);
});
function showProgress(i){
  const e=entries[stops[i].name]||{};
  const meta=stationButtons[i].querySelector('.ticket-no');
  meta.lastChild.textContent=' '+([e.status,e.episode?'EP '+e.episode:''].filter(Boolean).join(' · ')||'STATION');
}
stops.forEach((_,i)=>showProgress(i));
const fieldNames=['status','season','episode','date','note'];
function openPage(i){
  bookIndex=i; const entry=entries[stops[i].name]||{};
  $('entry-name').textContent=stops[i].name; $('entry-place').textContent=stops[i].place;
  $('entry-stamp').innerHTML=stamp(i);$('entry-stamp').style.color=stops[i].ink;
  tabs.forEach((t,n)=>t.setAttribute('aria-pressed',String(n===i)));
  fieldNames.forEach(k=>$(k).value=entry[k]||'');
  $('saved').textContent=entry.updated?'Saved on this device':'Stored on this device';
}
function persist(){
  if(!$('entry').checkValidity())return false;
  const entry={updated:true}; fieldNames.forEach(k=>entry[k]=$(k).value.trim());
  entries[stops[bookIndex].name]=entry;showProgress(bookIndex);
  try{localStorage.setItem(storageKey,JSON.stringify(entries));$('saved').textContent='Ticket saved on this device';return true;}
  catch{$('saved').textContent='Storage unavailable · kept for this visit';return false;}
}
$('entry').addEventListener('input',()=>{if($('entry').checkValidity())persist();else $('saved').textContent='Check the highlighted field';});
$('entry').onsubmit=e=>{e.preventDefault();persist();};
function journal(){openPage(selected);$('journal').showModal();$('close').focus();}
$('book').onclick=journal; $('close').onclick=()=>$('journal').close();
$('journal').onclick=e=>{if(e.target!==$('journal'))return;const r=$('journal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('journal').close();};
function chime(){
  if(!soundOn||!audio)return;
  [523.25,659.25].forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.22;
    o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+1.1);o.connect(g).connect(master);o.start(t);o.stop(t+1.2);});
}
$('sound').onclick=async()=>{
  try{
    if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=0;master.connect(audio.destination);
      const buffer=audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate), samples=buffer.getChannelData(0);let prev=0;
      for(let i=0;i<samples.length;i++){prev=(prev+.035*(Math.random()*2-1))/1.035;samples[i]=prev;}
      const n=audio.createBufferSource(),filter=audio.createBiquadFilter();n.buffer=buffer;n.loop=true;filter.type='lowpass';filter.frequency.value=940;n.connect(filter).connect(master);n.start();}
    await audio.resume();soundOn=!soundOn;master.gain.setTargetAtTime(soundOn?.65:0,audio.currentTime,.2);
    $('sound').innerHTML=icon(soundOn?'sound':'mute');$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label','Turn ambient sound '+(soundOn?'off':'on'));if(soundOn)chime();
  }catch{$('announce').textContent='Audio is unavailable in this browser.';}
};
function controls(label,detail,backLabel,backFn,forwardLabel,forwardFn){
  $('focus-label').textContent=label;$('focus-detail').textContent=detail;
  [['back',backLabel,backFn],['forward',forwardLabel,forwardFn]].forEach(([id,t,fn])=>{const el=$(id);el.hidden=!t;el.textContent=t;el.onclick=fn;});
}
const descriptions=['Feel the sea breeze from the Sunny’s deck.','There’s a seat at the ramen counter.','Follow the rooftops to the foot of the wall.','The afternoon is quiet on the school grounds.'];
function updateUI(){
  const s=stops[selected], isHome=phase==='home';
  $('stage').className='stage'+(isHome?'':phase==='visit'?' visit':' travel');$('journey-controls').hidden=isHome;
  stationButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(!isHome&&i===selected)));
  $('people').replaceChildren(); $('caption').textContent=isHome?'Seaside departure':phase==='visit'?s.place:phase==='ride'?'Crossing the sea':'Sea Line carriage';
  if(phase==='ride')controls('Next stop · '+s.name,'Crossing the sea to '+s.place+'…','',null,'Skip ride',arrive);
  if(phase==='returning')controls('Back aboard','Returning to your carriage…','',null,'',null);
  if(phase==='arrived')controls('Arrived · '+s.name,s.place+' · The doors are open.','Next station',()=>ride((selected+1)%4),'Step off the train',visit);
  if(phase==='visit'){
    const p=station?.people[personIndex];
    controls(p?p.name:'Station '+String(selected+1).padStart(2,'0')+' · '+s.name,p?p.detail:descriptions[selected],p?'See whole station':'Return to train',p?()=>focus(-1):board,'Open ticket',journal);
    if(station&&personIndex<0)station.people.forEach((person,i)=>{const b=document.createElement('button');b.className='person';b.textContent=person.name;b.onclick=()=>focus(i);b.hidden=true;$('people').append(b);});
  }
  if(!isHome)$('announce').textContent=$('focus-label').textContent+'. '+$('focus-detail').textContent;
  resize();
}
function removeStation(s){
  if(!s)return;
  scene.remove(s.group);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  s.group.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);
    if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));
  });
  materials.forEach(m=>{if(m.map)textures.add(m.map);m.dispose();});
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
}
function makeStation(i){
  if(!scene)return;
  removeStation(priorStation);priorStation=null;
  if(station?.group.visible){priorStation=station;priorOffset=station.group.position.x;}
  else removeStation(station);
  station=buildStation(THREE,i);station.group.position.set(90,0,-18);scene.add(station.group);
}
function resetLook(){dragX=dragY=dx=dy=0;dragging=null;}
function ride(i){
  if(phase==='visit'){board(i);return;}
  if(phase==='returning'){pendingStop=i;return;}
  const firstRide=phase==='home';
  selected=i;startDistance=distance;phase='ride';phaseTime=elapsed;personIndex=-1;resetLook();
  makeStation(i);
  if(camera)moveCamera([2,2.88,.2],[0,2.4,-14],firstRide?1.35:.85);
  updateUI();revealScene();if(!renderer)arrive();
}
function revealScene(){
  const top=$('stage').getBoundingClientRect().top;
  if(top<0)$('stage').scrollIntoView({block:'start',behavior:media.matches?'instant':'smooth'});
}
function arrive(){if(phase!=='ride')return;phase='arrived';phaseTime=elapsed;distance=startDistance+90;if(station)station.group.position.x=0;removeStation(priorStation);priorStation=null;
  if(camera)moveCamera([1.55,2.85,.64],[0,1.8,-18],.8);
  updateUI();chime();}
function visit(){
  phase='visit';phaseTime=elapsed;resetLook();personIndex=-1;
  if(camera)walk(false);
  updateUI();
}
const walkPoints=[[4.75,2.89,.03],[4.86,2.88,-1.66],[4.57,2.9,-3.35],[2.65,2.92,-3.95],[.24,2.9,-3.99],[0,2.7,-6.3]];
function walk(reverse){
  const points=reverse?[...walkPoints].reverse().concat([[1.55,2.85,.64]]):walkPoints;
  const look=reverse?[0,1.8,-18]:[0,1.85,-18];
  moveCamera(points[points.length-1],look,2.2);
  path.curve=new THREE.CatmullRomCurve3([camera.position.clone(),...points.map(p=>new THREE.Vector3(...p))]);
}
function board(next=null){
  pendingStop=typeof next==='number'?next:null;phase='returning';phaseTime=elapsed;resetLook();personIndex=-1;
  if(camera)walk(true);updateUI();
  if(!renderer)finishBoarding();
}
function finishBoarding(){
  phase='arrived';const next=pendingStop;pendingStop=null;
  if(next!==null)ride(next);else updateUI();
}
function focus(i){personIndex=i;resetLook();
  if(camera&&i>=0){const [x,y,z]=station.people[i].position;moveCamera([x+.52,y+.38,z-18+4.35],[x,y-.24,z-18],1.05);}
  else if(camera)moveCamera([0,2.7,-6.3],[0,1.85,-18],1.1);
  updateUI();}
function home(){phase='home';phaseTime=elapsed;personIndex=-1;resetLook();if(station)station.group.visible=false;removeStation(priorStation);priorStation=null;pendingStop=null;
  if(camera){const pose=homePose();moveCamera(pose[0],pose[1],1.2);}updateUI();}
$('home').onclick=e=>{e.preventDefault();home();};$('action').onclick=()=>ride(selected);
function homePose(){return innerWidth<=680?[[12,6.2,15],[0,3.35,0]]:[[12.5,6.4,13.5],[-.35,2,0]];}
function moveCamera(to,target,seconds){
  desiredEye.fromArray(to);desiredLook.fromArray(target);
  path={start:elapsed,duration:media.matches?.01:seconds,eye:camera.position.clone(),look:currentLook.clone()};
}
function resize(){
  if(!renderer)return;const box=$('world').getBoundingClientRect();if(!box.width||!box.height)return;
  renderer.setSize(box.width,box.height,false);camera.aspect=box.width/box.height;
  camera.fov=phase==='visit'?(camera.aspect<1.25?58:43):phase==='home'?(camera.aspect<1?46:42):60;
  camera.clearViewOffset();
  if(phase==='home'){
    const mobile=innerWidth<=680;
    camera.setViewOffset(box.width,box.height,mobile?0:-box.width*.19,mobile?-box.height*.21:0,box.width,box.height);
  }
  camera.updateProjectionMatrix();
}
const ease=t=>t*t*(3-2*t);
function animate(now){
  requestAnimationFrame(animate);
  if(document.hidden){lastTime=now;return;}
  const dt=lastTime===undefined?0:Math.min(.1,(now-lastTime)/1000);lastTime=now;elapsed+=dt;
  if(phase==='ride'){
    const t=Math.min(1,(elapsed-phaseTime)/(media.matches?.7:5.8));
    const eased=ease(t);distance=startDistance+90*eased;station.group.position.x=90*(1-eased);
    if(priorStation)priorStation.group.position.x=priorOffset-90*eased;
    if(t===1)arrive();
  }else if(phase==='home'&&!media.matches)distance+=dt*1.8;
  const targetDoor=['arrived','visit','returning'].includes(phase)?1:0;
  doorOpen+=(targetDoor-doorOpen)*Math.min(1,dt*5);
  railway.setDoor(doorOpen);railway.update(media.matches?0:elapsed,distance);
  if(station&&station.group.visible)station.update(media.matches?0:elapsed);
  if(path){const t=Math.min(1,(elapsed-path.start)/path.duration);if(path.curve)path.curve.getPointAt(ease(t),camera.position);else camera.position.lerpVectors(path.eye,desiredEye,ease(t));currentLook.lerpVectors(path.look,desiredLook,ease(t));if(t===1){path=null;if(phase==='returning')finishBoarding();}}
  dx+=(dragX-dx)*Math.min(1,dt*10);dy+=(dragY-dy)*Math.min(1,dt*10);
  camera.lookAt(currentLook.x+dx,currentLook.y+dy,currentLook.z);
  if(phase==='visit'&&personIndex<0&&station){
    camera.updateMatrixWorld();
    station.people.forEach((p,i)=>{const tag=$('people').children[i];if(!tag)return;
      const pos=new THREE.Vector3(...p.position);pos.y+=.52;pos.add(station.group.position).project(camera);
      tag.hidden=!!path||Math.abs(pos.x)>.95||Math.abs(pos.y)>.94||pos.z>1;
      tag.style.left=(50+50*pos.x)+'%';tag.style.top=(50-50*pos.y)+'%';
    });
  }
  renderer.render(scene,camera);
}
function init(){
  const T=THREE;scene=new T.Scene();camera=new T.PerspectiveCamera(42,1,.09,440);
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'default',alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
  $('world').append(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D train and anime scenery');
  railway=buildRailway(T,scene);
  const [eye,look]=homePose();desiredEye=new T.Vector3(...eye);desiredLook=new T.Vector3(...look);currentLook=desiredLook.clone();camera.position.copy(desiredEye);
  new ResizeObserver(resize).observe($('world'));resize();requestAnimationFrame(animate);
}
$('world').onpointerdown=e=>{if(phase==='home')return;dragging={x:e.clientX,y:e.clientY,dx:dragX,dy:dragY};e.currentTarget.setPointerCapture(e.pointerId);};
$('world').onpointermove=e=>{if(!dragging)return;dragX=Math.max(-1.7,Math.min(1.7,dragging.dx+(dragging.x-e.clientX)*.009));dragY=Math.max(-.75,Math.min(.75,dragging.dy+(e.clientY-dragging.y)*.008));};
$('world').onpointerup=$('world').onpointercancel=()=>{dragging=null;};
try{init();}catch(e){console.error(e);renderer=null;scene=null;camera=null;$('error').hidden=false;}
})();
