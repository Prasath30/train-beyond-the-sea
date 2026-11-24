// Each stop is a miniature stage. Solid pieces share vertex-coloured geometry
// after construction so detailing the sets does not multiply their draw calls.
function buildStation(T, index) {
  const group = new T.Group();
  const stage = new T.Group();
  group.add(stage);
  const people = [];
  const motions = [];
  const geo = {
    cube: new T.BoxGeometry(1, 1, 1),
    ball: new T.SphereGeometry(1, 16, 12),
    rock: new T.IcosahedronGeometry(1, 0),
    cone: new T.ConeGeometry(1, 1, 8),
    drum: new T.CylinderGeometry(1, 1, 1, 18),
    quad: new T.PlaneGeometry(1, 1)
  };
  const materials = new Map();
  const unified = new T.MeshStandardMaterial({vertexColors:true, roughness:0.9, side:T.DoubleSide});
  let seed = (index + 2) * 7937;
  function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  function paint(color) {
    if (!materials.has(color)) materials.set(color, new T.MeshBasicMaterial({color}));
    return materials.get(color);
  }
  function shape(parent, geometry, color, x, y, z, a, b, c) {
    const item = new T.Mesh(geometry, paint(color));
    item.position.set(x,y,z);
    item.scale.set(a,b,c);
    parent.add(item);
    return item;
  }
  function box(p,x,y,z,w,h,d,color) { return shape(p,geo.cube,color,x,y,z,w,h,d); }
  function ball(p,x,y,z,rx,ry,rz,color) { return shape(p,geo.ball,color,x,y,z,rx,ry,rz); }
  function rock(p,x,y,z,rx,ry,rz,color) { return shape(p,geo.rock,color,x,y,z,rx,ry,rz); }
  function cone(p,x,y,z,r,h,color) { return shape(p,geo.cone,color,x,y,z,r,h,r); }
  function drum(p,x,y,z,r,h,color) { return shape(p,geo.drum,color,x,y,z,r,h,r); }
  function rod(p,a,b,r,color) {
    const d = new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const mesh = drum(p,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,r,d.length(),color);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
    return mesh;
  }
  function ring(p,x,y,z,r,t,color) { return shape(p,new T.TorusGeometry(r,t,6,26),color,x,y,z,1,1,1); }
  function patch(p,points,triangles,color) {
    const g = new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
    g.setIndex(triangles);
    g.computeVertexNormals();
    return shape(p,g,color,0,0,0,1,1,1);
  }
  function node(p,x=0,y=0,z=0) { const n=new T.Group(); n.position.set(x,y,z); p.add(n); return n; }
  function bake(container) {
    container.updateWorldMatrix(true,true);
    const inverse = container.matrixWorld.clone().invert();
    const xyz=[], normals=[], rgb=[], erase=[];
    const v = new T.Vector3(), n = new T.Vector3();
    container.traverse(m=>{
      if (!m.isMesh || m.material.map) return;
      const g=m.geometry, pos=g.attributes.position, norm=g.attributes.normal;
      const relative=new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld);
      const normalMatrix=new T.Matrix3().getNormalMatrix(relative);
      const {r,g:green,b}=m.material.color;
      const count=g.index ? g.index.count : pos.count;
      for (let i=0;i<count;i++) {
        const k=g.index?g.index.getX(i):i;
        v.fromBufferAttribute(pos,k).applyMatrix4(relative);
        n.fromBufferAttribute(norm,k).applyNormalMatrix(normalMatrix);
        xyz.push(v.x,v.y,v.z); normals.push(n.x,n.y,n.z); rgb.push(r,green,b);
      }
      erase.push(m);
    });
    for (const m of erase) m.removeFromParent();
    const g=new T.BufferGeometry();
    for (const [name,values] of [['position',xyz],['normal',normals],['color',rgb]]) g.setAttribute(name,new T.Float32BufferAttribute(values,3));
    const batch=new T.Mesh(g,unified);
    batch.castShadow=true; batch.receiveShadow=true; container.add(batch);
    return container;
  }
  function lettering(p,x,y,z,w,h,lines,fg,bg) {
    const canvas=document.createElement('canvas');
    canvas.width=768; canvas.height=Math.max(96,Math.round(768*h/w));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle=fg; ctx.lineWidth=3;
    ctx.strokeRect(9,9,canvas.width-18,canvas.height-18);
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=fg;
    lines.forEach((line,i)=>{
      ctx.font='bold '+Math.floor(canvas.height*(i===0?(lines.length===1?.65:.44):.19))+'px Georgia, serif';
      ctx.fillText(line,canvas.width/2,canvas.height*(lines.length===1?.52:(i===0?.37:.77)),canvas.width*.94);
    });
    const tex=new T.CanvasTexture(canvas);
    tex.colorSpace=T.SRGBColorSpace;
    const m=new T.Mesh(geo.quad,new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));
    m.position.set(x,y,z); m.scale.set(w,h,1); p.add(m);
  }
  const ink='#282634', skin='#f4c398', wood='#855334', brass='#c78b42';
  function barrel(p,x,y,z,s=1) {
    ball(p,x,y+.49*s,z,.43*s,.56*s,.43*s,'#9b633c');
    for(const h of [.19,.75]) drum(p,x,y+h*s,z,.40*s,.11*s,'#4d5057');
    drum(p,x,y+.96*s,z,.34*s,.06*s,'#c99563');
  }
  function tree(p,x,y,z,s,colors) {
    rod(p,[x,y,z],[x+.09*s,y+2*s,z],.14*s,'#624936');
    for (let i=0;i<5;i++) {
      const a=i*2.4, dx=Math.cos(a)*.74*s, dz=Math.sin(a)*.55*s;
      rod(p,[x,y+1.05*s,z],[x+dx,y+2.12*s,z+dz],.07*s,'#674e40');
      const tuft=rock(p,x+dx,y+(2.2+random()*.45)*s,z+dz,1.05*s,1.0*s,.92*s,colors[i%colors.length]);
      tuft.rotation.y=a;
    }
    rock(p,x,y+3.02*s,z,.95*s,.83*s,.92*s,colors[1]);
  }
  function gable(p,x,y,z,w,d,h,color) {
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2;
    patch(p,[[x0,y,z0],[x1,y,z0],[x,y+h,z0],[x0,y,z1],[x1,y,z1],[x,y+h,z1]],
      [0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1],color);
  }
  function lantern(p,x,y,z,s=1) {
    rod(p,[x,y+.45*s,z],[x,y+.8*s,z],.025*s,wood);
    ball(p,x,y,z,.27*s,.42*s,.27*s,'#ed8054');
    for(const k of [-.39,-.24,0,.24,.39]) drum(p,x,y+k*s,z,(Math.abs(k)>.35?.15:Math.abs(k)>.1?.235:.27)*s,.034*s,'#a45639');
  }
  function hair(p,color,style) {
    ball(p,0,1.69,-.045,.354,.315,.30,color);
    for (let i=0;i<8;i++) {
      const x=(i-3.5)*.078;
      const z=.27*Math.sqrt(Math.max(.15,1-(x/.37)**2));
      const next=cone(p,x,1.68+(.025*Math.sin(i*2)),z,.086,.21+random()*.07,color);
      next.scale.z=.07; next.rotation.z=Math.PI+.29;
    }
    if (style==='spike') {
      for (let i=0;i<12;i++) {
        const a=i*2.4, r=.07+i*.018;
        const strand=cone(p,Math.cos(a)*r,1.98-i*.009,Math.sin(a)*r-.03,.10,.26+random()*.09,color);
        strand.rotation.z=-Math.cos(a)*.65; strand.rotation.x=Math.sin(a)*.65;
      }
    } else {
      for (const sign of [-1,1]) ball(p,sign*.292,1.54,-.015,.088,.18,.19,color);
    }
  }
  function band(p,color,metal=true) {
    const b=drum(p,0,1.72,-.007,.352,.12,color); b.scale.z=.30;
    if (metal) {
      box(p,0,1.722,.291,.32,.111,.033,'#afb6b8');
      ring(p,.005,1.725,.316,.031,.009,ink);
      rod(p,[-.044,1.708,.317],[.052,1.742,.317],.008,ink);
      for(const s of [-1,1]) ball(p,s*.128,1.722,.313,.009,.009,.005,ink);
    }
  }
  const costumes = {
    luffy:['#b82c2c','#345789','#262331'],zoro:['#43735a','#31423d','#4c643c'],
    naruto:['#eb7727','#373d4b','#f2c552'],kakashi:['#66866b','#384752','#b2c2c7'],
    eren:['#9c6946','#d4c6b6','#47382f'],mikasa:['#946543','#d7cfc8','#2b2b32'],
    yuji:['#294155','#283949','#d98284'],gojo:['#353746','#333642','#e3e3e1']
  };
  function person(id,name,detail,x,z,angle=0) {
    const p=node(group,x,.04,z), [coat,pants,locks]=costumes[id];
    p.rotation.y=angle;
    const sc=id==='gojo'||id==='kakashi'?1.08:1;
    p.scale.setScalar(sc);
    ball(stage,x,.018,z,.47,.021,.30,'#6b6657');
    for (const s of [-1,1]) {
      const foot=s*.128;
      box(p,foot,.32,-.008,.19,.45,.205,pants);
      ball(p,foot,.107,.046,.121,.104,.171,id==='luffy'?'#826343':'#363940');
    }
    const robe=box(p,0,.87,0,.48,.58,.306,coat);
    ball(p,0,1.17,0,.248,.115,.158,coat);
    for(const s of [-1,1]){
      const elbow=s*.318, hand=s*.334;
      rod(p,[s*.2,1.123,0],[elbow,.865,.028],.101,coat);
      rod(p,[elbow,.865,.028],[hand,.715,.073],.084,id==='luffy'?skin:coat);
      ball(p,hand,.688,.078,.081,.097,.081,skin);
    }
    drum(p,0,1.245,0,.105,.15,skin);
    ball(p,0,1.54,0,.338,.342,.297,skin);
    for(const s of [-1,1]){
      ball(p,s*.32,1.53,0,.068,.088,.057,skin);
      ball(p,s*.128,1.54,.261,.048,.057,.021,'#f3dfc8');
      ball(p,s*.127,1.543,.281,.029,.042,.013,'#302b30');
      ball(p,s*.127-.007,1.556,.293,.008,.009,.005,'#f7f1e0');
      rod(p,[s*.083,1.607,.271],[s*.172,1.616,.251],.012,locks);
    }
    ball(p,0,1.476,.295,.036,.036,.026,'#dcaa83');
    patch(p,[[-.058,1.42,.283],[0,1.414,.29],[.059,1.423,.283],[0,1.399,.289]],[0,1,3,1,2,3],'#98675b');
    hair(p,locks,['zoro','naruto','kakashi','yuji','gojo'].includes(id)?'spike':'fringe');
    if(id==='luffy') {
      drum(p,0,1.842,-.008,.487,.056,'#dab15e');
      ball(p,0,1.916,-.012,.319,.202,.292,'#e3bb6a');
      const band=drum(p,0,1.874,-.01,.326,.076,'#a63230'); band.scale.z=.298;
      patch(p,[[-.13,1.17,.158],[.13,1.17,.158],[.09,.637,.158],[-.09,.637,.158]],[0,1,2,0,2,3],skin);
      box(p,0,.6,0,.48,.081,.319,'#d7ae44');
      for(const s of [-1,1]) box(p,s*.128,.48,.005,.222,.22,.22,pants);
      rod(p,[.125,1.456,.278],[.206,1.466,.247],.008,'#895345');
    } else if(id==='zoro') {
      box(p,0,.766,.007,.475,.19,.316,'#879855');
      rod(p,[-.095,1.171,.17],[.14,.843,.17],.021,'#abc0a0');
      for(let k=0;k<3;k++){
        const d=k*.084;
        rod(p,[.26,.79+d,.008],[.75,.30+d,-.14],.038,['#ede4c9','#713b45','#333848'][k]);
        rod(p,[.187,.856+d,.036],[.285,.756+d,0],.043,brass);
        for(const j of [0,1,2]) ball(p,.35,1.48-j*.031,.005,.018,.035,.015,brass);
      }
    } else if(id==='naruto'||id==='kakashi') {
      band(p,'#354755');
      if(id==='naruto') {
        box(p,0,1.064,.159,.474,.185,.04,'#384450'); box(p,0,.875,.193,.031,.535,.02,'#e5cca9');
        for(const s of [-1,1]) for(let k=0;k<3;k++) rod(p,[s*.172,1.495-k*.032,.253],[s*.249,1.52-k*.034,.203],.007,'#755746');
      } else {
        ball(p,0,1.445,.09,.29,.16,.218,'#364859');
        for(const s of [-1,1]) {
          box(p,s*.132,.994,.178,.137,.161,.088,'#869c79'); box(p,s*.132,.836,.17,.137,.114,.075,'#71876c');
        }
      }
    } else if(id==='eren'||id==='mikasa') {
      box(p,0,.884,.155,.156,.47,.018,'#e6dfcd');
      for(const s of [-1,1]) {
        box(p,s*.153,1.018,.164,.114,.074,.03,'#b08561');
        rod(p,[s*.202,1.12,.181],[-s*.149,.635,.183],.024,'#534638');
        box(p,s*.321,.505,-.055,.171,.237,.356,'#939999');
        box(p,s*.32,.506,.131,.154,.057,.025,'#53575a');
        box(p,s*.13,.295,0,.196,.045,.215,'#5d5146');
      }
      if(id==='mikasa'){
        const scarf=drum(p,0,1.242,0,.24,.159,'#943f46');scarf.scale.z=.178;
        const end=box(p,-.102,1.072,.201,.098,.293,.052,'#a34b4a');end.rotation.z=-.16;
        ball(p,-.25,1.434,-.073,.117,.225,.18,locks);
      }
    } else {
      const collar=drum(p,0,1.215,0,.224,.163,id==='yuji'?'#ae4548':coat);collar.scale.z=.18;
      for (let i=0;i<3;i++) ball(p,-.106,1.09-i*.12,.163,.019,.02,.009,brass);
      if(id==='gojo') {
        const blind=drum(p,0,1.564,.01,.344,.12,'#292b37');blind.scale.z=.298;
      } else {
        rod(p,[-.073,1.18,.172],[-.051,1.024,.182],.013,'#b14544');
      }
    }
    bake(p);
    const phase=random()*6;
    motions.push(t=>{p.position.y=.04+.012*Math.sin(t*1.7+phase); p.rotation.z=.009*Math.sin(t*1.35+phase);});
    people.push({name,detail,position:[x,1.54*sc,z]});
  }
  function sunny() {
    // Cambered hull and quarterdeck with brass-trimmed bulwarks.
    const hull = [];
    for (const y of [-1.26,-.17]) for (const z of [-5.9,5.4]) {
      const w=(y<-.5?6.45:8.35)-(z>0?.94:0);
      hull.push([-w,y,z],[w,y,z]);
    }
    patch(stage,hull,[0,1,3,0,3,2,0,4,5,0,5,1,1,5,7,1,7,3,2,3,7,2,7,6,0,2,6,0,6,4],'#974d2d');
    for(let i=0;i<28;i++){
      const z=-5.68+i*.405;
      const width=16.7-(z+5.9)*.17;
      box(stage,0,-.085,z,width,.16,.397,['#cda27b','#dcb18a','#d4a883','#deb88e'][i%4]);
      for(let j=1;j<4;j++) box(stage,-width/2+(j*width/4)+Math.sin(i*1.8)*.8,.002,z,.022,.006,.397,'#a27c5c');
    }
    for(const s of [-1,1]) {
      for(let j=0;j<7;j++){
        const z=-5.55+j*1.66,x=s*(8.13-(z+5.55)*.085);
        box(stage,x,.43,z,.18,.88,.18,'#a85637'); ball(stage,x,.91,z,.125,.115,.125,brass);
      }
      for(const y of [.22,.78]) rod(stage,[s*8.13,y,-5.55],[s*7.28,y,4.48],.064,'#f3cf8a');
    }
    for(let j=0;j<11;j++) {
      box(stage,-8+j*1.6,.43,-5.55,.17,.86,.17,'#a75a36');
      if(j<10) for(const h of [.3,.8]) rod(stage,[-8+j*1.6,h,-5.55],[-6.4+j*1.6,h,-5.55],.056,'#e6b978');
    }
    // Galley windows and tangerines on the upper deck.
    box(stage,4.6,1.01,-3.94,5.62,2.03,3.1,'#edce91');
    box(stage,4.6,2.12,-3.94,5.99,.23,3.4,'#bd6550');
    for(let i=0;i<4;i++) {
      const x=2.66+i*1.25;
      ring(stage,x,1.22,-2.345,.35,.063,'#bf8e4b');
      const pane=drum(stage,x,1.22,-2.39,.328,.03,'#54798b'); pane.rotation.x=Math.PI/2;
      rod(stage,[x-.29,1.22,-2.312],[x+.29,1.22,-2.312],.025,'#d1ab69');
    }
    for(let j=0;j<3;j++){
      const x=3.2+j*1.4;
      tree(stage,x,2.22,-4.23,.61,['#678450','#90a970','#688d57']);
      for(let k=0;k<7;k++) ball(stage,x+(random()-.5)*1.32,3.47+random()*.43,-3.94+random()*.26,.106,.11,.106,'#e58b39');
    }
    // Square-rigged sail, narrow rope ladders and the straw-hat pirate flag.
    const mast=-1.2, mz=-3.66;
    drum(stage,mast,3.37,mz,.18,6.74,'#935e40');
    for(const h of [.43,3.01,5.64,6.34]) drum(stage,mast,h,mz,.203,.095,brass);
    rod(stage,[mast-3.22,5.62,mz],[mast+3.22,5.62,mz],.106,wood);
    const sailpts=[], sailinds=[];
    for(let row=0;row<5;row++) for(let col=0;col<11;col++){
      const u=col/10, v=row/4;
      sailpts.push([mast+(u-.5)*(6.16-.54*v),5.52-2.43*v-.24*Math.sin(Math.PI*u)*v,mz+.11+.59*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)]);
      if(row&&col){const k=row*11+col;sailinds.push(k-12,k-11,k,k-12,k,k-1);}
    }
    patch(stage,sailpts,sailinds,'#f7e7bc');
    const badge=node(stage,mast,4.30,mz+.77);
    for(const s of [-1,1]){
      rod(badge,[-.86,s*.53,0],[.86,-s*.53,0],.063,'#564f48');
      for(const end of [-1,1]) ball(badge,end*.86,end*-s*.53,0,.115,.115,.042,'#564f48');
    }
    ball(badge,0,.045,.018,.444,.424,.087,'#524f4b');
    ball(badge,0,.042,.070,.382,.357,.078,'#faf0cc');
    for(const s of [-1,1]) ball(badge,s*.143,.069,.15,.09,.105,.015,'#4e4943');
    box(badge,0,-.243,.089,.327,.153,.119,'#f5e4b7');
    for(const s of [-1,0,1]) box(badge,s*.076,-.268,.152,.012,.086,.008,'#67605a');
    ball(badge,0,.333,.106,.389,.179,.109,'#dba64c');
    box(badge,0,.30,.204,.686,.052,.018,'#a54737');
    ball(badge,0,.258,.149,.561,.044,.14,'#e5b758');
    for(const s of [-1,1]){
      rod(stage,[mast,6.13,mz],[mast+s*5.5,.45,-.38],.027,'#70685b');
      for(const delta of [0,.46]) rod(stage,[mast+s*(.15+delta),5.72,mz],[mast+s*(3.00+delta),.45,mz+.28],.03,'#78644e');
      for(let k=0;k<10;k++) {
        const t=k/10, x=mast+s*(.15+2.85*t), y=5.72-5.27*t;
        rod(stage,[x,y,mz+t*.28],[x+s*.46,y,mz+t*.28],.022,'#8d795d');
      }
    }
    patch(stage,[[mast,6.69,mz],[mast+1.4,6.43,mz+.12],[mast,6.19,mz]], [0,1,2],'#394247');
    barrel(stage,-4.83,0,-.20,1.0); barrel(stage,-5.36,0,-1.10,.85);
    // Sunny's sun-lion figurehead peeks around the forward bulwark.
    const lion=node(stage,-4.33,1.22,-1.94);
    for(let j=0;j<12;j++){
      const a=j*Math.PI/6;
      const ray=ball(lion,Math.sin(a)*.805,Math.cos(a)*.805,0,.199,.398,.20,j%2?'#df8932':'#eeaa47');
      ray.rotation.z=-a;
    }
    ball(lion,0,0,.04,.738,.742,.435,'#edbf54');
    for(const s of [-1,1]){
      ball(lion,s*.275,.10,.438,.073,.111,.046,'#4f4537');
      ball(lion,s*.222,-.20,.422,.242,.218,.128,'#fff0ab');
    }
    ball(lion,0,-.077,.54,.132,.084,.06,'#654637');
    person('luffy','Monkey D. Luffy','His straw hat catches the sea breeze. There is always room for one more on deck.',-1.32,1.52,-.10);
    person('zoro','Roronoa Zoro','Three swords rest at his hip. He has found a quiet corner of the deck for a nap.',1.51,1.03,.10);
  }
  function ramenBowl(p,x,y,z,s=1){
    const bowl=ball(p,x,y+.042*s,z,.247*s,.143*s,.247*s,'#e8ccaa');
    drum(p,x,y+.116*s,z,.233*s,.034*s,'#a86b40');
    for(let j=0;j<4;j++) {
      const noodle=ring(p,x+(j-1.5)*.054*s,y+.137*s,z,.066*s,.009*s,'#f8d27f');
      noodle.rotation.x=-Math.PI/2;
    }
    ball(p,x+.112*s,y+.145*s,z,.068*s,.025*s,.053*s,'#f8e9bd');
    ball(p,x+.112*s,y+.169*s,z,.031*s,.009*s,.028*s,'#e6a14d');
    for (let j=0;j<2;j++) rod(p,[x-.18*s,y+.15*s,z+(j-.5)*.05*s],[x+.15*s,y+.40*s,z+.16*s+(j-.5)*.05*s],.012*s,'#8f5c38');
  }
  function ramen() {
    box(stage,0,-.20,0,17.8,.39,12.6,'#beb196');
    box(stage,0,-.075,2.63,17.8,.14,5.71,'#cfbb9d');
    for(let i=0;i<54;i++){
      const x=(random()-.5)*17,z=random()*5.65-.23;
      const chip=rock(stage,x,.003,z,.04+random()*.14,.009,.021+random()*.052,i%2?'#bdac8f':'#dec9ad');
      chip.rotation.y=random()*3.1;
    }
    // A weathered open-front timber stand with visible work surfaces.
    box(stage,0,.102,-2.32,7.75,.20,3.95,'#907058');
    box(stage,0,1.52,-4.1,7.58,2.86,.17,'#dcc099');
    for(let j=0;j<11;j++) box(stage,-3.55+j*.71,1.52,-4.001,.055,2.86,.05,'#bc926b');
    for(const x of [-3.77,3.77]){
      box(stage,x,1.52,-2.40,.15,2.86,3.42,'#d8b28d');
      for(const z of [-4.07,-2.31,-.47]) box(stage,x,1.55,z,.22,3.12,.23,'#704934');
    }
    box(stage,0,1.06,-.87,7.27,.18,.87,'#ab7146');
    box(stage,0,.55,-1.06,7.04,.92,.24,'#bc916c');
    for(let j=0;j<15;j++) box(stage,-3.38+j*.483,.56,-.922,.026,.84,.028,'#966e4d');
    box(stage,0,1.38,-3.72,6.92,.11,.54,'#926742');
    box(stage,0,2.01,-3.84,6.92,.089,.36,'#966c4c');
    for(let j=0;j<14;j++) {
      const x=-3.05+j*.46;
      drum(stage,x,2.24,-3.78,.113,.37,['#897650','#9d5b46','#e8cea0','#638384'][j%4]);
      drum(stage,x,2.443,-3.78,.094,.05,'#6d5745');
      if(j%2===0) box(stage,x,1.545,-3.67,.21,.23,.21,'#ded3ae');
    }
    for(const x of [-2.8,-1.36,.13,1.66,2.97]){
      drum(stage,x,.32,.034,.079,.55,'#67564b'); drum(stage,x,.085,.034,.231,.074,'#554e49');
      drum(stage,x,.627,.034,.294,.148,'#bb6653'); drum(stage,x,.558,.034,.287,.043,'#704a3f');
    }
    for(const x of [-2.57,.57,2.56]) ramenBowl(stage,x,1.151,-.76);
    const roof=box(stage,0,3.25,-2.27,8.36,.26,4.45,'#474c53');roof.rotation.x=-.10;
    for(let j=0;j<27;j++) rod(stage,[-4.01+j*.307,3.18,-4.35],[-4.01+j*.307,3.59,-.16],.061,'#5b5b5f');
    box(stage,0,3.205,-.15,8.43,.205,.26,'#714b38');
    box(stage,0,3.757,-1.22,4.02,.90,.198,'#83573b');
    lettering(stage,0,3.757,-1.10,3.82,.73,['一楽','ICHIRAKU RAMEN'],'#693d2e','#f3d69e');
    rod(stage,[-3.84,2.91,-.28],[3.84,2.91,-.28],.048,wood);
    for(let j=0;j<9;j++){
      const x=-3.2+j*.80;
      const curtain=box(stage,x,2.52,-.264,.78,.765,.035,j%2?'#af5145':'#b85c4d');
      curtain.rotation.z=(j%3-1)*.019;
      box(stage,x,2.213,-.235,.726,.029,.012,'#e4bd91');
      if(j>1&&j<7) {
        const letters=['ら','ー','め','ん','亭'];
        lettering(stage,x,2.55,-.233,.47,.45,[letters[j-2]],'#ffe7ba',j%2?'#af5145':'#b85c4d');
      }
    }
    for(const x of [-4.02,4.02]) lantern(stage,x,2.25,.013,1.16);
    for(const s of [-1,1]){
      const x=s*6.13;
      box(stage,x,1.67,-3.73,3.42,3.33,3.19,s>0?'#a8b2a0':'#cf9a77');
      const ledge=box(stage,x,3.39,-3.73,3.65,.24,3.52,s>0?'#617366':'#a76557');ledge.rotation.z=s*.035;
      box(stage,x,.92,-2.105,.86,1.77,.078,'#6a5c4e');
      for(const k of [-1,1]){
        box(stage,x+k*1.06,1.85,-2.099,.54,.73,.08,'#647e83');
        box(stage,x+k*1.06,1.85,-2.036,.043,.73,.02,'#d7bda0');
      }
      tree(stage,s*7.46,0,-.3,1.08,['#66856a','#8fa579','#759569']);
    }
    const banner=node(stage,4.33,0,.43); banner.rotation.z=-.06;
    rod(banner,[0,0,0],[0,2.81,0],.038,'#765d41');
    box(banner,.27,1.96,0,.51,1.54,.033,'#ddb36d');
    lettering(banner,.27,1.98,.022,.45,.79,['麺'],'#855134','#ddb36d');
    person('naruto','Naruto Uzumaki','He is already thinking about a second bowl. The counter feels like home.',-.91,1.64,-.15);
    person('kakashi','Kakashi Hatake','A familiar headband and an easy wave. His ramen is cooling while he takes his time.',1.51,1.17,.14);
  }
  function house(x,z,s,roofColor) {
    const h=node(stage,x,0,z);h.scale.setScalar(s);
    const w=2.15,d=2.26,eave=2.38;
    box(h,0,eave/2,0,w,eave,d,'#d2bd92');
    gable(h,0,eave,0,w+.26,d+.25,.94,roofColor);
    patch(h,[[-w/2,eave,d/2+.003],[w/2,eave,d/2+.003],[0,eave+.86,d/2+.003]],[0,1,2],'#dec99e');
    for (const x of [-.99,0,.99]) box(h,x,1.2,1.143,.088,2.4,.048,'#705744');
    for (const y of [.29,1.29,2.33]) box(h,0,y,1.15,w,.085,.061,'#795b45');
    for(const s of [-1,1]){
      rod(h,[0,3.235,1.16],[s*1.08,2.34,1.16],.059,'#745442');
      rod(h,[s*.89,1.37,1.17],[s*.16,2.24,1.17],.048,'#866448');
      box(h,s*.56,1.876,1.18,.42,.54,.03,'#607b79');
      box(h,s*.56,1.876,1.205,.033,.54,.016,'#d2bb94');
      box(h,s*.56,1.876,1.205,.42,.033,.016,'#d2bb94');
      for(let k=1;k<5;k++){
        const t=k/5;
        rod(h,[s*1.20*t,3.33-.94*t,-1.25],[s*1.20*t,3.33-.94*t,1.25],.019,'#98634d');
      }
    }
    box(h,.37,.57,1.16,.54,1.10,.066,'#826449');
    box(h,-.55,.72,1.17,.49,.55,.044,'#688383');
    box(h,.58,3.15,-.50,.23,.79,.31,'#a07862');
    box(h,.58,3.57,-.50,.288,.076,.36,'#7d6654');
  }
  function shiganshina() {
    box(stage,0,-.16,-.1,19,.31,13,'#aea894');
    box(stage,0,-.045,1.7,16.7,.085,8.6,'#b9a991');
    for(let row=0;row<16;row++) for(let col=0;col<15;col++){
      const z=-3.55+row*.55, x=(col-7)*.75+((row%2)*.34);
      if(Math.abs(x)>(2.5+(z+3)*.29)) continue;
      box(stage,x,.001,z,.716+random()*.024,.014,.49+random()*.030,['#c4b8a4','#cbbca6','#b7ac99','#c6b5a0'][Math.floor(random()*4)]);
    }
    // Wall Maria wraps the old district. An arched opening frames the road.
    const gate=1.26;
    for(let row=0;row<11;row++){
      const w=1.87,h=.53;
      for(let col=-6;col<=6;col++){
        const center=(col+(row%2)*.5)*w;
        const left=center-w*.49,right=center+w*.49,cy=row*h+h/2;
        const aperture=cy<1.7?gate:cy<3.1?gate*Math.sqrt(Math.max(0,1-((cy-1.7)/1.4)**2)):0;
        for(const [lo,hi] of [[left,Math.min(-aperture,right)],[Math.max(aperture,left),right]]){
          if(hi-lo<.025) continue;
          const wall=box(stage,(lo+hi)/2,cy,-5.67+(random()-.5)*.04,hi-lo,h-.014,.72,['#c3bdac','#b4b3a5','#cdc5b2','#bbb9a9'][Math.floor(random()*4)]);
        }
      }
    }
    for(let j=0;j<15;j++){
      const a=Math.PI*j/14;
      const voussoir=box(stage,Math.cos(a)*1.38,1.7+Math.sin(a)*1.45,-5.23,.27,.37,.21,'#998f7e');
      voussoir.rotation.z=a-Math.PI/2;
    }
    for(const s of [-1,1]) {
      box(stage,s*1.41,.86,-5.20,.33,1.72,.25,'#a49a87');
      for(let k=0;k<3;k++) box(stage,s*1.41,.31+k*.53,-5.043,.33,.033,.06,'#8f8779');
      for(let k=0;k<3;k++){
        const x=s*(3.5+k*3.6);
        box(stage,x,3.04,-5.12,.62,6.10,1,'#b5b1a0');
        box(stage,x,5.77,-4.995,.83,.26,1.28,'#c5bfac');
      }
    }
    box(stage,0,5.89,-5.64,24,.20,.96,'#d0cbb8');
    for(let j=-9;j<=9;j++) box(stage,j*1.36,6.08,-5.62,.67,.32,.79,'#bdb8a5');
    for(const s of [-1,1]) for(let k=0;k<3;k++) {
      house(s*(3.15+k*1.91),-3.07+k*1.71,.88+k*.11,k%2?'#a5654c':'#ab6548');
    }
    // Supply cart, corded bundles and the Scout Regiment's split-wing insignia.
    const cart=node(stage,-3.04,0,.81);cart.rotation.y=-.22;
    box(cart,0,.54,0,1.56,.15,.89,'#876745');
    for(const z of [-.41,.41]) {
      box(cart,0,.785,z,1.55,.28,.07,'#9e7950');
      for(const x of [-.54,.54]){
        const rim=ring(cart,x,.35,z*1.31,.303,.045,'#544c40');
        for(let k=0;k<4;k++){
          const a=k*Math.PI/4;
          rod(cart,[x+Math.cos(a)*.28,.35+Math.sin(a)*.28,z*1.31],[x-Math.cos(a)*.28,.35-Math.sin(a)*.28,z*1.31],.018,'#876b4b');
        }
      }
    }
    for(const x of [-.43,.18,.49]) ball(cart,x,.86,-.04,.28,.29,.30,'#bea377');
    barrel(stage,3.19,0,.22,.85);
    const flag=node(stage,2.52,0,-2.07);
    rod(flag,[0,0,0],[0,3.1,0],.044,'#715c49');
    rod(flag,[-.05,2.97,0],[1.05,2.97,0],.04,'#8e795a');
    patch(flag,[[.11,2.88,0],[.98,2.88,0],[.98,1.77,0],[.545,1.47,0],[.11,1.77,0]],[0,1,2,0,2,3,0,3,4],'#506e68');
    for(const s of [-1,1]) for(let j=0;j<4;j++){
      const x=.55+s*j*.068, y=1.905+j*.113;
      patch(flag,[[x,y,.032],[x+s*.11,y+.43,.032],[x+s*.163,y+.378,.032],[x+s*.075,y+.066,.032]],[0,1,2,0,2,3],s<0?'#dedcca':'#8baeb7');
    }
    person('eren','Eren Yeager','He has stopped at the gate, looking up at a slice of open sky.',-1.07,1.47,-.10);
    person('mikasa','Mikasa Ackerman','Her red scarf stirs in the afternoon breeze. She waits at the edge of the square.',1.07,1.22,.12);
  }
  function templeRoof(p,x,y,z,w,d,h){
    // Raised ridge and turned-up corners give a Japanese hip roof its silhouette.
    const vertices=[],indices=[];
    for(let side=0;side<4;side++){
      const corner=[[-1,-1],[1,-1],[1,1],[-1,1]];
      const a=corner[side],b=corner[(side+1)%4],start=vertices.length;
      for(let r=0;r<5;r++) for(let c=0;c<9;c++){
        const v=r/4,t=c/8;
        const sx=(a[0]+(b[0]-a[0])*t),sz=(a[1]+(b[1]-a[1])*t);
        vertices.push([x+sx*(w*.5-v*(w*.5-w*.25)),y+h*v*v+.21*(1-v)**2*(Math.abs(t*2-1))**3,z+sz*d*.5*(1-v)]);
        if(r&&c){const k=start+r*9+c;indices.push(k-10,k-9,k,k-10,k,k-1);}
      }
    }
    patch(p,vertices,indices,'#526264');
    for(const side of [-1,1]){
      for(let j=0;j<31;j++){
        const t=j/30*2-1, xx=x+t*w*.5;
        const y0=y+.21*Math.abs(t)**3;
        rod(p,[xx,y0+.022,z+side*d*.5],[x+t*w*.45,y+.16,z+side*d*.40],.038,'#75807b');
      }
    }
    rod(p,[x-w*.25-.22,y+h+.04,z],[x+w*.25+.22,y+h+.04,z],.128,'#536265');
    for(const s of [-1,1]) ball(p,x+s*(w*.25+.235),y+h+.055,z,.135,.145,.134,'#8f9689');
  }
  function stoneLight(p,x,z,s=1) {
    const l=node(p,x,0,z);l.scale.setScalar(s);
    box(l,0,.12,0,.64,.24,.64,'#8a9285');
    box(l,0,.55,0,.283,.74,.283,'#9eaa97');
    box(l,0,.94,0,.53,.16,.53,'#909b8d');
    box(l,0,1.18,0,.39,.38,.39,'#e6c891');
    for(const dx of [-.21,.21]) for(const dz of [-.21,.21]) box(l,dx,1.18,dz,.054,.41,.054,'#768376');
    const cap=cone(l,0,1.48,0,.51,.32,'#7a897a');cap.rotation.y=Math.PI/8;
    ball(l,0,1.69,0,.117,.13,.117,'#8e9b89');
  }
  function academy(){
    box(stage,0,-.17,-.2,18.6,.33,13,'#899578');
    for (let j=0;j<76;j++){
      const x=(random()-.5)*17.8,z=(random()-.5)*11.8;
      if(Math.abs(x)<2.6) continue;
      const moss=rock(stage,x,.012,z,.15+random()*.42,.028,.12+random()*.25,['#778969','#98a583','#7e9172'][j%3]);
      if(j%8===0) rock(stage,x,.16,z,.46,.34,.31,'#899184');
    }
    for(let row=0;row<12;row++)for(let col=0;col<4;col++){
      const x=(col-1.5)*.98+(row%2)*.095,z=5.92-row*.66;
      box(stage,x,.002,z,.94,.022,.61,['#b1b1a0','#a9ad9b','#b9b9a7'][(row+col)%3]);
    }
    for(let i=0;i<4;i++)box(stage,0,.075+.12*i,-1.68-.43*i,5.2-i*.04,.15+.24*i,.54,'#9ba597');
    box(stage,0,.48,-4.0,8.7,.96,2.49,'#7d8376');
    const hall=node(stage,0,.96,-4.25);
    box(hall,0,1.12,0,7.18,2.24,1.93,'#cfbea2');
    for(let j=0;j<7;j++){
      const x=-3.30+j*1.10;
      box(hall,x,1.13,1.00,.15,2.3,.17,'#655449');
      if(j===6) continue;
      box(hall,x+.55,1.13,1.007,.84,1.74,.06,j===2||j===3?'#756857':'#decfaf');
      for(let n=0;n<5;n++)box(hall,x+.18+n*.18,1.16,1.052,.025,1.66,.022,'#8c7c64');
      for(let n=0;n<4;n++)box(hall,x+.55,.59+n*.39,1.055,.8,.022,.029,'#99836c');
    }
    box(hall,0,2.18,1.03,7.2,.21,.20,'#75624e');
    templeRoof(hall,0,2.31,0,8.88,3.61,1.12);
    box(hall,0,3.46,0,3.94,.35,.62,'#b4aa91');
    templeRoof(hall,0,3.58,0,4.84,1.72,.58);
    // Vermilion gateway at the approach, behind the visitor's close-up positions.
    for(const s of [-1,1]){
      drum(stage,s*2.18,1.87,-1.45,.176,3.74,'#ad5944');
      drum(stage,s*2.18,.26,-1.45,.191,.51,'#4a4a43');
      drum(stage,s*2.18,3.49,-1.45,.22,.135,'#bb6e50');
    }
    box(stage,0,3.00,-1.45,5.15,.176,.22,'#aa5742');
    box(stage,0,3.35,-1.45,.38,.53,.17,'#ae5b46');
    box(stage,0,3.73,-1.45,5.86,.243,.35,'#b7684f');
    box(stage,0,3.884,-1.45,4.2,.121,.42,'#404c4b');
    for(const s of [-1,1]){
      const cap=box(stage,s*2.61,3.939,-1.45,1.10,.12,.43,'#414a48');cap.rotation.z=s*.10;
    }
    for (const s of [-1,1]){
      stoneLight(stage,s*2.87,.30,1.03);stoneLight(stage,s*3.07,-2.49,.9);
      for(const [dx,z,sz] of [[5.14,-3.1,1.51],[6.76,-.2,1.27],[7.93,-4.71,1.68],[4.58,-5.25,1.31]]){
        tree(stage,s*dx,0,z,sz,['#566f5c','#798d70','#607c65']);
      }
    }
    const sign=node(stage,-3.38,0,-.54);
    box(sign,0,1.23,0,.64,2.45,.37,'#a2a798');
    lettering(sign,0,1.46,.197,.47,1.47,['呪','術 高 専'],'#525f58','#b3b6a5');
    person('yuji','Yuji Itadori','He steps away from training to greet you on the path, red hood bright against the trees.',-.98,1.78,-.16);
    person('gojo','Satoru Gojo','He waits by the lanterns with his usual grin. Even the training grounds feel quiet today.',1.40,1.16,.11);
  }
  [sunny,ramen,shiganshina,academy][index]();
  // A timber landing meets the carriage door, then narrows into a gangway.
  for (let i=0;i<22;i++) {
    box(stage,4.1-i*.40,1.21,14.65,.39,.18,2.96,i%3?'#af825b':'#bb9065');
  }
  for (let i=0;i<23;i++) {
    const z=13.15-i*.326;
    const y=1.18-i*.052;
    const plank=box(stage,0,y,z,2.25,.17,.329,i%3?'#ac8059':'#ba9067');
    plank.rotation.x=-.158;
    if(i%5===0)for(const x of [-1,1])drum(stage,x,y-.90,z,.105,1.83,'#6b6252');
  }
  // Short raised threshold bridges the final step on the train.
  box(stage,4.71,1.21,14.65,.85,.18,2.96,'#b08560');
  box(stage,4.72,1.21,16.13,.85,.18,.43,'#b08560');
  bake(stage);
  for(const m of materials.values()) m.dispose();
  return {group,people,update(time){for (const move of motions) move(time);}};
}
