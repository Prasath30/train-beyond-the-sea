(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const room = get('room'), canvas = get('view'), audio = get('train-audio');
  const carriage = get('carriage'), country = get('land');
  const width = 1672, height = 941, duration = 15;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = 0, playing = false, sound = true, available = false;
  let look = 0, desiredLook = 0, previousTime = null, pointer = null, frame = 0, renderScene;
  const play = get('play'), turn = get('look'), soundBtn = get('sound');

  let phase='home', sceneTime=0, changing=false;
  let alightT=0, alightFired=new Set(), lastStep='';
  const place=()=>phase==='platform'||phase==='counter';
  const ease=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  const seg=(t,a,b)=>ease((t-a)/(b-a));
  const still={scene:'carriage',zoom:1,x:0,y:0,mix:0,bx:0,by:0};
  // Getting off: stand, walk the aisle to the end door, step onto the platform,
  // walk the lane and push through Ichiraku's noren. Times are seconds.
  const ALIGHT_END=18.9, AT_PLATFORM=8.6, AT_COUNTER=16.95, LANE=12;
  const alightEvents=[[AT_PLATFORM,'platform'],[8.75,'chime'],[9.35,'slide'],[11,'stepdown'],[16.6,'cloth'],[AT_COUNTER,'counter'],[17.05,'enter']];
  function cine(t){
    const aspect=canvas.width/canvas.height;
    const c={scene:'carriage',heading:0,zoom:1,x:0,y:0,mix:0,bx:0,by:0,age:0,
      veil:0,step:'',surface:'wood'};
    if(t<AT_PLATFORM){
      const rise=seg(t,2,3.5), walk=seg(t,4.4,AT_PLATFORM);
      c.heading=.55*seg(t,2.1,3.6)+.45*seg(t,3.4,4.6);
      const center=836+c.heading*(aspect<1?560:390);
      c.zoom=(1+.1*rise)*(1+2.3*walk);
      // Standing lifts the eye; the walk centres the painted end door.
      c.x=(1578-center)*walk;
      c.y=(-30*rise+7*Math.sin(Math.PI*seg(t,2,3.1)))*(1-walk)+(450-470.5)*walk;
      if(t>4.4){
        const s=(t-4.4)*1.85, amp=seg(t,4.4,5)*(1-seg(t,8,AT_PLATFORM));
        c.by+=amp*7*Math.cos(2*Math.PI*s)/c.zoom;c.bx=amp*5*Math.sin(Math.PI*s)/c.zoom;
        if(amp>.3)c.step='w'+Math.floor(s+.5);
      }
    }else if(t<AT_COUNTER){
      c.scene='platform';c.age=t-AT_PLATFORM;
      c.by=.012*Math.sin(Math.PI*seg(t,10.85,11.6));
      const w=seg(t,LANE,16.9);c.zoom=1.05+1.75*w;c.mix=w;c.x=.565;c.y=.535;
      if(t>LANE){
        const s=(t-LANE)*1.8, amp=seg(t,LANE,12.5)*(1-seg(t,16.3,16.9));
        c.by+=amp*.0075*Math.cos(2*Math.PI*s)/c.zoom;c.bx=amp*.0035*Math.sin(Math.PI*s)/c.zoom;
        if(amp>.3){c.step='s'+Math.floor(s+.5);c.surface='stone';}
      }
    }else{
      // Sitting down on the stool beside Naruto.
      c.scene='counter';c.age=t-AT_COUNTER;
      const sit=seg(t,17.15,18.8);c.zoom=1.13-.13*sit;c.by=-.032*(1-sit);
    }
    const platformCut=.82*(1-seg(Math.abs(t-AT_PLATFORM),0,.62));
    const counterCut=.72*(1-seg(Math.abs(t-AT_COUNTER),0,.62));
    c.veil=Math.max(platformCut,counterCut);
    return c;
  }
  const routeSound=konohaSound();
  const openTicket=konohaTicket(()=>travel(false),()=>{previousTime=null;requestDraw();});
  const veil=document.createElement('div');veil.className='veil';room.append(veil);
  const caption=room.querySelector('.caption p'), heading=room.querySelector('h1');

  // Trace the actual glass openings. The window rails belong to the carriage layer.
  function glassStencil() {
    const matte = document.createElement('canvas');
    matte.width = width; matte.height = height;
    const c = matte.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, width, height); c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(68, -2); c.lineTo(692,-2); c.lineTo(1043,191);
    c.quadraticCurveTo(1054,197,1053,220); c.lineTo(1053,489);
    c.quadraticCurveTo(1054,514,1041,528); c.lineTo(68,696); c.closePath(); c.fill();
    const panes = [
      [[1182,215],[1260,259],[1264,266],[1264,332],[1182,302]],
      [[1182,329],[1264,355],[1264,475],[1260,492],[1182,508]],
      [[1316,292],[1335,304],[1337,310],[1337,358],[1316,351]],
      [[1316,372],[1337,377],[1337,473],[1332,480],[1316,483]],
      [[1369,326],[1378,332],[1380,336],[1380,375],[1369,371]],
      [[1369,387],[1381,391],[1381,466],[1369,469]],
      [[1403,349],[1410,354],[1410,384],[1403,382]],
      [[1403,396],[1411,399],[1411,458],[1403,461]],
      [[1430,365],[1436,369],[1436,390],[1430,388]],
      [[1430,399],[1436,402],[1436,453],[1430,455]]
    ];
    for (const poly of panes) {
      c.beginPath(); poly.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill();
    }
    return matte;
  }
  const vertex = 'attribute vec2 pos;varying vec2 uv;void main(){uv=vec2(pos.x*.5+.5,.5-pos.y*.5);gl_Position=vec4(pos,0.,1.);}';
  const fragment = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D cabin,land,mask,approach,platform,counter;
    uniform float location,age,arrival,aspect;
    uniform vec2 fov;
    uniform float turn,travel,motion;
    uniform vec4 cam;
    uniform vec2 bob;
    const vec2 size=vec2(1672.,941.);
    float mirrorCoord(float x){return 1.-abs(mod(x,2.)-1.);}
    void main(){
      if(location>.5){
        bool indoors=location>1.5;
        vec2 crop=min(vec2(1.),vec2(aspect*941./1672.,1672./(941.*aspect)));
        vec2 anchor=indoors?vec2(.615,.465):vec2(.515,.48);
        float settle=1.-exp(-age*.60);
        // cam: zoom, focus point, focus mix. Walking pushes the view into the painting.
        vec2 view=crop/cam.x;
        vec2 center=mix(anchor*(1.-crop)+.5*crop,cam.yz,cam.w)+bob;
        center=clamp(center,view*.5,1.-view*.5);
        vec2 at=center+(uv-.5)*view*(1.-.023*settle);
        if(indoors){
          // Soft heat shimmer above the broth and a slight breathing motion in the sleeve.
          vec2 steamArea=(at-vec2(.474,.554))/vec2(.06,.10);
          float plume=exp(-dot(steamArea,steamArea));
          at.x+=.0008*plume*sin(at.y*95.+age*1.7);
          vec2 sleeve=(at-vec2(.77,.67))/vec2(.15,.20);
          at.y+=.0017*sin(age*1.5)*exp(-dot(sleeve,sleeve));
          vec2 arm=(at-vec2(.547,.55))/vec2(.068,.12);
          at.y+=(.0035*sin(age*1.1)+.002*sin(age*2.2))*exp(-dot(arm,arm));
          // The nearest chopstick tips dip with the wrist, localized to the bowl.
          vec2 tips=(at-vec2(.508,.638))/vec2(.024,.034);
          at.y+=.0027*sin(age*1.1)*exp(-dot(tips,tips));
          vec3 paint=texture2D(counter,at).rgb;
          float curl=sin(steamArea.y*4.+age*1.2)*.30;
          float mist=plume*exp(-10.*pow(steamArea.x-curl,2.))*(.5+.5*sin(age*1.7+steamArea.y*6.));
          paint=mix(paint,vec3(.99,.84,.68),mist*.15);
          gl_FragColor=vec4(paint,1.);
        }else{
          vec2 cloth=(at-vec2(.572,.477))/vec2(.058,.055);
          at.y+=.0012*sin(age*1.8+at.x*48.)*exp(-dot(cloth,cloth));
          gl_FragColor=vec4(texture2D(platform,at).rgb,1.);
        }
        return;
      }
      // Project a camera ray onto the painted set. A head turn changes the perspective.
      vec2 ray=(uv*2.-1.)*fov/cam.x;
      float s=sin(turn),c=cos(turn),z=c-ray.x*s;
      vec2 p=vec2(836.,470.5)+952.*vec2((ray.x*c+s)/z,ray.y/z)+cam.yz+bob;
      p.y+=motion*(.51*sin(travel*3.3)+.22*sin(travel*8.7));
      vec2 st=p/size;
      vec3 inner=texture2D(cabin,st).rgb;
      float glass=texture2D(mask,st).r;
      vec3 color=inner;
      if(glass>.001){
        // All panes share the same world horizon, even where the train wall recedes.
        float v=(p.y-425.)/880.+.532;
        float u=(p.x-60.)*.00052+.082;
        float fields=smoothstep(.633,1.04,v);
        float village=smoothstep(.525,.645,v);
        float shift=travel*(.00043+.0014*village+.033*fields);
        vec2 sampleAt=vec2(mirrorCoord(u+shift),clamp(v,.001,.999));
        vec3 outside=texture2D(land,sampleAt).rgb;
        vec2 townAt=vec2(clamp(u-.074+.008*travel-.13*(1.-smoothstep(.8,1.6,aspect)),.002,.998),clamp(v,.002,.998));
        outside=mix(outside,texture2D(approach,townAt).rgb,arrival);
        // Close telegraph poles move towards the near edge; their apparent size
        // increases with perspective. Far hills and sky retain a stable horizon.
        float opacity=0., wire=0.;
        for(int i=0;i<9;i++){
          float d=6.+float(i)*19.-mod(travel*5.9,19.);
          if(d>1.){
            float inv=1./d;
            float x=1550.-16050.*inv;
            float top=425.-6450.*inv, bottom=425.+3300.*inv;
            float w=clamp(90.*inv,1.1,22.);
            float stem=(1.-smoothstep(w*.5,w*.5+1.3,abs(p.x-x)))*smoothstep(top,top+1.5,p.y)*(1.-smoothstep(bottom,bottom+2.,p.y));
            float arm=(1.-smoothstep(w*.19,w*.19+1.,abs(p.y-top-250.*inv)))*(1.-smoothstep(w*3.7,w*3.7+1.,abs(p.x-x)));
            float ceramic=(1.-smoothstep(w*.27,w*.27+1.,abs(abs(p.x-x)-w*2.75)))*(1.-smoothstep(w*.53,w*.53+1.,abs(p.y-top-230.*inv)));
            opacity=max(opacity,max(max(stem,arm),ceramic)*clamp(.96-d*.004,.16,.88));
            float farInv=1./(d+19.),farX=1550.-16050.*farInv;
            float along=(p.x-x)/(farX-x);
            if(along>=0.&&along<=1.){
              float y=mix(top+250.*inv,425.-6200.*farInv,along)+along*(1.-along)*290.*inv;
              wire=max(wire,(1.-smoothstep(.27,1.1,abs(p.y-y)))*clamp(9.*inv,.1,.38));
            }
          }
        }
        outside=mix(outside,vec3(.218,.185,.178),max(wire,opacity));
        color=mix(inner,outside,glass);
      }
      // A soft passing shadow crosses the window jamb, upholstery and sill.
      float shadowPos=mod(travel*355.+310.,2270.)-340.;
      float shadow=1.-smoothstep(15.,72.,abs(p.x+.40*(p.y-430.)-shadowPos));
      color*=1.-shadow*.18*(1.-glass)*motion;
      gl_FragColor=vec4(color,1.);
    }`;
  function webglScene(gl, stencil) {
    function compile(type, text) {
      const s=gl.createShader(type); gl.shaderSource(s,text); gl.compileShader(s);
      if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(program); if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(program,'pos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    const loc = n => gl.getUniformLocation(program,n);
    [carriage,country,stencil,get('approach'),get('platform'),get('counter')].forEach((source,i)=>{
      gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);gl.uniform1i(loc(['cabin','land','mask','approach','platform','counter'][i]),i);
    });
    const u={fov:loc('fov'),turn:loc('turn'),travel:loc('travel'),motion:loc('motion'),arrival:loc('arrival'),location:loc('location'),age:loc('age'),aspect:loc('aspect'),cam:loc('cam'),bob:loc('bob')};
    return (time, heading, distance, sway, view=still) => {
      gl.viewport(0,0,canvas.width,canvas.height);
      const aspect=canvas.width/canvas.height;
      gl.uniform1f(u.location,view.scene==='counter'?2:view.scene==='platform'?1:0);
      gl.uniform4f(u.cam,view.zoom,view.x,view.y,view.mix);gl.uniform2f(u.bob,view.bx,view.by);
      gl.uniform1f(u.age,reduced.matches?0:sceneTime);gl.uniform1f(u.aspect,aspect);
      gl.uniform1f(u.arrival,arrivalMix());
      const center=836+heading*(heading>0?(aspect<1?560:390):345);
      const yaw=Math.atan((center-836)/952);
      const halfAngle=Math.min(Math.atan(Math.min(765,423*aspect)/952),Math.atan(824/952)-Math.abs(yaw));
      const horizontal=Math.min(Math.tan(halfAngle),.483*Math.cos(yaw)/((1/aspect)+.483*Math.abs(Math.sin(yaw))));
      const vertical=horizontal/aspect;
      gl.uniform2f(u.fov,horizontal,vertical);
      gl.uniform1f(u.turn,yaw);gl.uniform1f(u.travel,distance);gl.uniform1f(u.motion,sway);
      // Project the notebook from its location in the painting back onto the display.
      const bookX=(1237-836)/952,bookY=(753-470.5)/952;
      const z=Math.sin(yaw)*bookX+Math.cos(yaw);
      positionBook((1+(Math.cos(yaw)*bookX-Math.sin(yaw))/z/horizontal)/2,(1+bookY/z/vertical)/2);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    };
  }
  // Canvas compositing also works on devices that disable hardware acceleration.
  function flatScene(stencil) {
    const c=canvas.getContext('2d'), layer=document.createElement('canvas');
    layer.width=width;layer.height=height;const work=layer.getContext('2d');
    const cutout=document.createElement('canvas');cutout.width=width;cutout.height=height;
    const cut=cutout.getContext('2d');cut.drawImage(carriage,0,0);
    const mask=stencil.getContext('2d').getImageData(0,0,width,height);
    for(let i=0;i<mask.data.length;i+=4)mask.data[i+3]=mask.data[i];
    const transparentMask=document.createElement('canvas');transparentMask.width=width;transparentMask.height=height;
    transparentMask.getContext('2d').putImageData(mask,0,0);
    cut.globalCompositeOperation='destination-out';cut.drawImage(transparentMask,0,0);
    return (time,heading,dist,sway,view=still)=>{
      const aspect=canvas.width/canvas.height;const cropH=Math.min(880,1500/aspect);
      const cropW=cropH*aspect*(1-Math.abs(heading)*.22)/view.zoom,actualH=cropW/aspect;
      const x=clamp(836+heading*(aspect<1?560:390)-cropW/2+view.x+view.bx,0,width-cropW);
      if(view.scene!=='carriage'){
        const cw=canvas.width,ch=canvas.height;
        const img=get(view.scene),scale=Math.max(cw/img.naturalWidth,ch/img.naturalHeight)*view.zoom;
        const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
        let ix=(cw-w)*(view.scene==='counter'?.615:.515),iy=(ch-h)*.48;
        ix+=(cw/2-view.x*w-ix)*view.mix;iy+=(ch/2-view.y*h-iy)*view.mix;
        ix=clamp(ix-view.bx*w,cw-w,0);iy=clamp(iy-view.by*h,ch-h,0);
        c.drawImage(img,ix,iy,w,h);
        positionBook(-1,-1);return;
      }
      const start=dist*1.8;
      work.drawImage(country,start,0,width-80,height,0,-10,width,718);
      for(let y=481;y<701;y+=4){
        const speed=1.9+Math.pow((y-481)/220,1.8)*25;
        const offset=(dist*speed)%width;
        const sourceY=(y+10)*height/718;
        work.drawImage(country,offset,sourceY,width-offset,5.3,0,y,width-offset,4);
        if(offset>.1)work.drawImage(country,0,sourceY,offset,5.3,width-offset,y,offset,4);
      }
      work.globalAlpha=arrivalMix();
      work.drawImage(get('approach'),dist*2.5,0,width-70,height,0,-10,width,718);
      work.globalAlpha=1;
      positionBook((1237-x)/cropW,(753-(height-actualH)/2)/actualH);
      const y=clamp((height-actualH)/2+Math.sin(time*4)*sway+view.y+view.by,0,height-actualH);
      work.drawImage(cutout,0,0);c.drawImage(layer,x,y,cropW,actualH,0,0,canvas.width,canvas.height);
    };
  }
  function resize() {
    const ratio=Math.min(window.devicePixelRatio||1,1.7,2400/Math.max(1,canvas.clientWidth));
    canvas.width=Math.max(1,Math.round(canvas.clientWidth*ratio));canvas.height=Math.max(1,Math.round(canvas.clientHeight*ratio));requestDraw();
  }
  function positionBook(x,y){
    const book=get('notebook');
    book.hidden=phase!=='home'||x<.04||x>.96||y<.10||y>.94;
    if(!book.hidden){book.style.left=(100*x)+'%';book.style.top=(100*y)+'%';}
  }
  function arrivalMix(){
    if(place()||phase==='arrived'||phase==='alight')return 1;
    const t=phase==='return'?duration-elapsed:phase==='out'?elapsed:0;
    const v=clamp((t-3.8)/6.5,0,1);return v*v*(3-2*v);
  }
  function travel(back){
    phase=back?'return':'out';playing=true;elapsed=0;sceneTime=0;desiredLook=0;
    previousTime=null;get('state').textContent=back?'Returning to the Sea Line.':'Departing for Konoha.';
    routeSound.set('',sound&&!document.hidden);syncAudio();showControls();requestDraw();
  }
  function startAlight(at){
    phase='alight';alightT=at;playing=true;previousTime=null;lastStep='';
    alightFired=new Set(alightEvents.filter(([time])=>time<at).map(([,name])=>name));
    routeSound.set(at>=AT_PLATFORM?'platform':'',sound&&!document.hidden);
    veil.style.transition='none';
    get('state').textContent=at>=AT_PLATFORM?'Walking down the lane to Ichiraku.':'Arrived at Konoha. Getting off the train.';
    showControls();requestDraw();
  }
  function stageAlight(c){
    veil.style.opacity=c.veil;
  }
  function clearAlight(){
    veil.style.opacity='';veil.style.transition='';
  }
  function finishAlight(){
    clearAlight();phase='counter';playing=false;sceneTime=ALIGHT_END-AT_COUNTER;previousTime=null;
    routeSound.reset();routeSound.set('counter',sound&&!document.hidden);
    get('state').textContent='At Ichiraku Ramen with Naruto.';
    showControls();requestDraw();
  }
  function skipAlight(){
    if(changing)return;
    changing=true;playing=false;veil.style.transition='';veil.style.opacity='';veil.classList.add('down');
    setTimeout(()=>{
      alightT=ALIGHT_END;finishAlight();
      requestAnimationFrame(()=>{veil.classList.remove('down');changing=false;play.focus({preventScroll:true});});
    },reduced.matches?0:270);
  }
  function alightSounds(c){
    for(const [time,name] of alightEvents){
      if(alightT<time||alightFired.has(name))continue;
      alightFired.add(name);
      const on=sound&&!document.hidden;
      if(name==='platform'||name==='counter')routeSound.set(name,on);
      else if(name==='enter')routeSound.enter();
      else routeSound[name]();
    }
    if(c.step&&c.step!==lastStep){lastStep=c.step;routeSound.step(c.surface);}
  }
  function syncPlaceSound(){
    const on=sound&&!document.hidden;
    if(phase==='alight')routeSound.set(alightT>=AT_COUNTER?'counter':alightT>=AT_PLATFORM?'platform':'',on);
    else routeSound.set(phase,on&&place());
  }
  function street(next){
    if(changing)return;
    changing=true;veil.classList.add('down');
    if(next==='counter'){routeSound.set(next,sound&&!document.hidden);routeSound.enter();}
    const delay=reduced.matches?0:270;
    setTimeout(()=>{
      if(next==='return')travel(true);
      else{
        phase=next;sceneTime=0;previousTime=null;routeSound.reset();
        routeSound.set(phase,sound&&!document.hidden);
        get('state').textContent=next==='counter'?'At Ichiraku Ramen with Naruto.':'On the platform in Konoha.';
        showControls();requestDraw();
      }
      requestAnimationFrame(()=>{veil.classList.remove('down');changing=false;play.focus({preventScroll:true});});
    },delay);
  }
  function showControls(){
    const onTrain=phase==='out'||phase==='return';
    room.classList.toggle('playing',playing&&phase!=='alight');room.classList.toggle('place-view',place());
    room.classList.toggle('parked',!onTrain);
    const labels={home:['The Train Beyond the Sea','Window seat','Open ticket book'],
      out:['Sea Line to Konoha','Next stop, Konoha',playing?'Pause ride':'Resume ride'],
      arrived:['Naruto','Konoha','Step outside'],
      alight:['Naruto · Konoha','Walking to Ichiraku',playing?'Pause walk':'Keep walking'],
      platform:['Konoha','Village platform',reduced.matches?'Enter Ichiraku':'Walk to Ichiraku'],
      counter:['Naruto · Konoha','Ichiraku Ramen','Write a memory'],
      return:['Konoha to Sea Line','The return journey',playing?'Pause ride':'Resume ride']};
    const [above,title,label]=labels[phase];
    caption.textContent=above;heading.textContent=title;get('play-label').textContent=label;
    get('play-path').setAttribute('d',playing?'M6 5h4v14H6z M14 5h4v14h-4z':'m8 5 11 7-11 7z');
    let secondary=desiredLook>.45?'Look out window':'Look toward aisle';
    if(place())secondary=phase==='counter'?'Return to platform':'Return to train';
    if(phase==='alight')secondary='Skip to Ichiraku';
    get('look-label').textContent=secondary;turn.setAttribute('aria-label',secondary);
    setProgress();
    if(phase!=='home')get('notebook').hidden=true;
    canvas.setAttribute('aria-label',place()?(phase==='platform'?'A wooden platform in Konoha, looking toward Ichiraku Ramen.':'Naruto sits beside you at the ramen counter.'):'View from the window seat. Drag or use the arrow keys to look around.');
    carriage.setAttribute('aria-hidden',String(place()));
  }
  function setProgress(){
    const time='0:'+String(Math.ceil(duration-elapsed)).padStart(2,'0');
    if(get('clock').textContent!==time)get('clock').textContent=time;
    get('progress').style.transform='scaleX('+elapsed/duration+')';
  }
  let audioAttempt=0;
  function syncAudio(){
    const attempt=++audioAttempt;
    if(!playing||!sound||document.hidden||(phase!=='out'&&phase!=='return')){audio.pause();return;}
    if(Number.isFinite(audio.duration))audio.currentTime=Math.min(elapsed,audio.duration);
    audio.play().catch(()=>{if(attempt===audioAttempt)get('state').textContent='Train audio could not play. Toggle sound to retry.';});
  }
  function togglePlay(){
    if(!available||changing||get('ticket').open)return;
    if(phase==='home'){openTicket(true);return;}
    if(phase==='arrived'){street('platform');return;}
    if(phase==='platform'){if(reduced.matches)street('counter');else startAlight(LANE);return;}
    if(phase==='counter'){openTicket(false,true);return;}
    playing=!playing;previousTime=null;
    syncAudio();showControls();requestDraw();
  }
  function setLook(value){
    desiredLook=clamp(value,-1,1);
    const aisle=desiredLook>.45;
    const label=aisle?'Look out window':'Look toward aisle';
    get('look-label').textContent=aisle?'Look out window':'Look toward aisle';turn.setAttribute('aria-label',label);
    requestDraw();
  }
  function draw(now){
    frame=0;if(document.hidden||!renderScene)return;
    const dt=previousTime===null?0:(now-previousTime)/1000;
    previousTime=now;
    if(phase==='alight'){
      if(playing)alightT=Math.min(ALIGHT_END,alightT+Math.min(dt,.1)*1.5);
      const c=cine(alightT);
      look=desiredLook=c.heading;sceneTime=c.age;
      stageAlight(c);alightSounds(c);
      renderScene(duration,c.heading,13,0,c);
      if(alightT>=ALIGHT_END)finishAlight();
      else if(playing)requestDraw();else previousTime=null;
      return;
    }
    if(place()){sceneTime+=dt;routeSound.tick(sceneTime);}
    if(playing){
      elapsed=Math.min(duration,elapsed+dt);
      if(elapsed>=duration){
        const arriving=phase==='out';
        playing=false;syncAudio();phase=arriving?'arrived':'home';
        if(phase==='home'){elapsed=0;look=desiredLook=0;}
        get('state').textContent=phase==='arrived'?'Arrived at Konoha.':'Back at your window seat.';
        showControls();
        if(arriving&&!reduced.matches){startAlight(0);return;}
      }else setProgress();
    }
    look=reduced.matches?desiredLook:look+(desiredLook-look)*(1-Math.exp(-Math.min(dt,.1)*6));
    if(Math.abs(desiredLook-look)<.00025)look=desiredLook;
    // A linear deceleration covers half the usual distance in the final four seconds.
    const slow=clamp(elapsed-11,0,4),dist=Math.min(elapsed,11)+slow-slow*slow/8;
    renderScene(elapsed,look,dist,reduced.matches?0:(playing?1-slow/4:0),place()?{...still,scene:phase}:still);
    if(playing||look!==desiredLook||place()&&!get('ticket').open&&!reduced.matches)requestDraw();else previousTime=null;
  }
  function requestDraw(){if(!frame&&renderScene&&!document.hidden)frame=requestAnimationFrame(draw);}
  play.onclick=togglePlay;
  turn.onclick=()=>{if(phase==='alight'){skipAlight();return;}if(place())street(phase==='counter'?'platform':'return');else setLook(desiredLook>.45?0:1);};
  get('notebook').onclick=()=>openTicket(true);
  soundBtn.onclick=()=>{sound=!sound;soundBtn.setAttribute('aria-pressed',String(sound));
    const label=sound?'Mute train sound':'Enable train sound';soundBtn.setAttribute('aria-label',label);soundBtn.title=label;
    get('sound-path').setAttribute('d',sound?'M4 9h4l5-4v14l-5-4H4z M16 8q4 4 0 8m3-11q7 7 0 14':'M4 9h4l5-4v14l-5-4H4z M16 9l6 6m0-6-6 6');syncAudio();syncPlaceSound();};
  canvas.onpointerdown=e=>{pointer={id:e.pointerId,x:e.clientX,from:desiredLook};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!place()&&phase!=='alight'&&pointer?.id===e.pointerId)setLook(pointer.from+(pointer.x-e.clientX)/Math.min(430,canvas.clientWidth*.62));};
  canvas.onlostpointercapture=()=>{pointer=null;};
  window.addEventListener('keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey||get('ticket').open||changing)return;
    if(!place()&&phase!=='alight'&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();setLook(desiredLook+(e.key==='ArrowRight'?.24:-.24));}
    else if(e.code==='Space'&&document.activeElement?.tagName!=='BUTTON'){e.preventDefault();togglePlay();}
  });
  document.addEventListener('visibilitychange',()=>{
    syncPlaceSound();
    syncAudio();
    if(!document.hidden)requestDraw();
  });
  function initialise(){
    const stencil=glassStencil();
    try {
      const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false});
      renderScene=gl?webglScene(gl,stencil):flatScene(stencil);
    } catch (err) {
      canvas.hidden=true; get('state').textContent='The still image is available. Animated rendering could not start.';
      play.disabled=turn.disabled=true;console.error(err);return;
    }
    available=true;play.disabled=turn.disabled=false;showControls();resize();new ResizeObserver(resize).observe(canvas);
  }
  play.disabled=turn.disabled=true;
  Promise.all([carriage,country,get('approach'),get('platform'),get('counter')].map(img=>img.decode())).then(initialise).catch(e=>{get('state').textContent='The scene could not load.';console.error(e);});
})();
