// Konoha's paper ticket shares the existing railway journal's on-device format.
function konohaTicket(depart, invalidate) {
  const $=id=>document.getElementById(id);
  const dialog=$('ticket'), key='memory-railway.tickets.v1';
  let atDeparture=false;
  function records(){
    const all=JSON.parse(localStorage.getItem(key)||'{}');
    if(!all||typeof all!=='object'||Array.isArray(all))throw Error('Invalid ticket collection');
    return all;
  }
  function current(){try{return records().Naruto||{};}catch{return {};}}
  function ticketPage(message=''){
    const ticket=current();
    $('memory').hidden=true;$('passage').hidden=false;$('depart').hidden=!atDeparture;
    const progress=[ticket.status,ticket.season?'Season '+ticket.season:'',ticket.episode?'Episode '+ticket.episode:''].filter(Boolean).join(' · ');
    $('kept').hidden=!progress&&!ticket.note;$('watch-line').textContent=progress;
    $('memory-line').textContent=ticket.note||'';
    $('edit').textContent=ticket.note||progress?'Edit memory':'Write a memory';
    $('save-state').textContent=message||'Memories stay in this browser';
  }
  function edit(){
    const ticket=current();$('passage').hidden=true;$('memory').hidden=false;
    $('watch-status').value=ticket.status||'';$('episode').value=ticket.episode||'';$('note').value=ticket.note||'';
    $('save-state').textContent='Memories stay in this browser';$('note').focus();
  }
  $('memory').onsubmit=e=>{
    e.preventDefault();
    try{
      const all=records();
      all.Naruto={...all.Naruto,status:$('watch-status').value,episode:$('episode').value,note:$('note').value.trim(),updated:true};
      localStorage.setItem(key,JSON.stringify(all));
      ticketPage('Memory saved on this device.');$('close-ticket').focus();
    }catch{$('save-state').textContent='This browser could not save the ticket. Your text is still here.';}
  };
  $('close-ticket').onclick=()=>dialog.close();$('edit').onclick=edit;
  $('cancel-edit').onclick=()=>{ticketPage();$('edit').focus();};
  $('depart').onclick=()=>{dialog.close();depart();};
  dialog.addEventListener('close',invalidate);
  return (departure,write=false)=>{
    atDeparture=departure;ticketPage();dialog.showModal();
    if(write)edit();else (departure?$('depart'):$('edit')).focus();
  };
}

// Short, locally synthesised sounds carry across the platform and counter cuts.
function konohaSound(){
  let ctx,bus,fx,air,noiseBuf,scene='',enabled=false,nextClink=0;
  function prepare(){
    if(ctx)return;
    ctx=new AudioContext();bus=ctx.createGain();bus.gain.value=0;bus.connect(ctx.destination);
    fx=ctx.createGain();fx.gain.value=.9;fx.connect(ctx.destination);
    const data=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),out=data.getChannelData(0);
    let last=0;for(let i=0;i<out.length;i++){last=(last+.085*(Math.random()*2-1))/1.085;out[i]=last;}
    noiseBuf=data;const noise=ctx.createBufferSource();noise.buffer=data;noise.loop=true;
    air=ctx.createBiquadFilter();air.type='lowpass';noise.connect(air).connect(bus);noise.start();
  }
  function set(place,on){
    scene=place;enabled=on;
    if(on&&!ctx){try{prepare();}catch{return;}}
    if(!ctx)return;
    if(on&&ctx.state==='suspended')ctx.resume().catch(()=>{});
    const active=on&&['platform','counter'].includes(place);
    air.frequency.setTargetAtTime(place==='counter'?410:1450,ctx.currentTime,.35);
    bus.gain.setTargetAtTime(active?(place==='counter'?.19:.13):0,ctx.currentTime,.2);
  }
  function tap(frequency,length,gain,delay=0,out=bus){
    if(!ctx||!enabled)return;
    const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();
    o.frequency.value=frequency;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.004);
    g.gain.exponentialRampToValueAtTime(.0001,t+length);o.connect(g).connect(out);o.start(t);o.stop(t+length+.01);
  }
  // Band-passed noise for footsteps, the door and the noren cloth.
  function burst(frequency,q,length,gain,delay=0){
    if(!ctx||!enabled)return;
    const t=ctx.currentTime+delay,s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=noiseBuf;f.type='bandpass';f.frequency.value=frequency;f.Q.value=q;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+length*.25);
    g.gain.exponentialRampToValueAtTime(.0001,t+length);s.connect(f).connect(g).connect(fx);
    s.start(t,Math.random()*2);s.stop(t+length+.02);
  }
  const effects={
    chime(){tap(659,1.3,.09,0,fx);tap(523,1.7,.09,.5,fx);},
    slide(){burst(650,.6,1.05,.2);tap(68,.3,.16,.95,fx);},
    stepdown(){tap(72,.16,.26,0,fx);burst(2400,1.2,.07,.07);},
    cloth(){burst(2300,.5,.5,.08);},
    step(surface){if(surface==='wood'){tap(86,.11,.2,0,fx);burst(1700,1.2,.06,.04);}else{tap(128,.06,.1,0,fx);burst(3100,1.5,.05,.06);}}
  };
  return {set,...effects,enter(){tap(1680,.20,.13);tap(2800,.12,.04,.09);},tick(t){
    if(!enabled||scene!=='counter'||t<nextClink)return;
    nextClink=t+6.4+Math.random()*4;tap(1460,.23,.13);tap(2340,.12,.042,.04);
  },reset(){nextClink=3.6;}};
}
