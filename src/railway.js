// A sea crossing built from a few batched meshes. Distances are in metres.
function buildRailway(T, scene) {
  const train = new T.Group();
  scene.add(train);
  scene.fog = new T.Fog(0xf3cfaf, 56, 210);
  scene.add(new T.HemisphereLight(0xfff2d8, 0x96afb3, 1.65));
  const sunlight = new T.DirectionalLight(0xffdfae, 2.05);
  sunlight.position.set(-16, 24, 12);
  scene.add(sunlight);
  const fill = new T.DirectionalLight(0xb8daef, .52);
  fill.position.set(15, 8, -20);
  scene.add(fill);

  const surface = new T.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .02 });
  const color = new T.Color();
  const transform = new T.Object3D();
  const point = new T.Vector3(), normal = new T.Vector3(), normalMatrix = new T.Matrix3();
  const cube = new T.BoxGeometry(1, 1, 1);
  const orb = new T.SphereGeometry(1, 14, 9);
  const pipe = new T.CylinderGeometry(1, 1, 1, 16);
  const wedge = new T.ConeGeometry(1, 1, 7);
  const materials = new Map();
  function painted(hex) {
    if (!materials.has(hex)) materials.set(hex, new T.MeshBasicMaterial({ color: hex }));
    return materials.get(hex);
  }
  // Merge the fixed hardware, woodwork, lanterns and foliage into single draws.
  function workshop(parent) {
    const positions = [], normals = [], colors = [], indices = [];
    function shape(geo, x, y, z, w, h, d, tint, rx = 0, ry = 0, rz = 0) {
      const offset = positions.length / 3;
      transform.position.set(x, y, z); transform.rotation.set(rx, ry, rz);
      transform.scale.set(w, h, d); transform.updateMatrix();
      normalMatrix.getNormalMatrix(transform.matrix);
      color.set(tint);
      const vertices = geo.attributes.position, vertexNormals = geo.attributes.normal;
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(transform.matrix);
        normal.fromBufferAttribute(vertexNormals, i).applyNormalMatrix(normalMatrix);
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(color.r, color.g, color.b);
      }
      for (let i = 0; i < geo.index.count; i++) indices.push(offset + geo.index.getX(i));
    }
    function box(x,y,z,w,h,d,c,rx,ry,rz) { shape(cube,x,y,z,w,h,d,c,rx,ry,rz); }
    function ball(x,y,z,w,h,d,c,rx,ry,rz) { shape(orb,x,y,z,w,h,d,c,rx,ry,rz); }
    function cyl(x,y,z,r,h,c,rx,ry,rz) { shape(pipe,x,y,z,r,h,r,c,rx,ry,rz); }
    function beam(a,b,r,c) {
      const mid = new T.Vector3().addVectors(a,b).multiplyScalar(.5);
      const dir = new T.Vector3().subVectors(b,a);
      const quat = new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0), dir.clone().normalize());
      const rot = new T.Euler().setFromQuaternion(quat);
      cyl(mid.x,mid.y,mid.z,r,dir.length(),c,rot.x,rot.y,rot.z);
    }
    function finish() {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals,3));
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors,3));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      const mesh = new T.Mesh(geometry,surface);
      parent.add(mesh);
      return mesh;
    }
    return {shape,box,ball,cyl,beam,finish};
  }
  const v = (x,y,z) => new T.Vector3(x,y,z);
  let seed = 107;
  function random() {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  }

  const skyMaterial = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: {
      high: {value: new T.Color(0x669eb3)}, middle: {value:new T.Color(0xb6d5d5)},
      low: {value:new T.Color(0xffdab7)}, sunny: {value:new T.Color(0xfff3c5)}
    },
    vertexShader: `
      varying vec3 dir;
      void main() {
        dir = position;
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `
      varying vec3 dir;
      uniform vec3 high, middle, low, sunny;
      void main() {
        vec3 d = normalize(dir);
        vec3 sun = normalize(vec3(-.63,.201,-1.));
        float dist = distance(d, sun);
        vec3 col = mix(low, middle, smoothstep(-.11,.29,d.y));
        col = mix(col, high, smoothstep(.19,.78,d.y));
        col = mix(col,sunny,.36 * exp(-dist * 5.4));
        col = mix(col,sunny,1. - smoothstep(.052,.054,dist));
        gl_FragColor = vec4(col,1.);
        #include <colorspace_fragment>
      }`
  });
  const sky = new T.Mesh(new T.SphereGeometry(1,42,20),skyMaterial);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  const waterMat = new T.ShaderMaterial({
    uniforms: {t:{value:0},travel:{value:0}, nearColor:{value:new T.Color(0x6fa4a7)},farColor:{value:new T.Color(0xc8cfc2)}, glint:{value:new T.Color(0xffebbb)}},
    vertexShader: `
      varying vec3 world;
      void main(){world=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader: `
      varying vec3 world;
      uniform float t, travel; uniform vec3 nearColor, farColor, glint;
      float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 a=floor(p), f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(a),hash(a+vec2(1.,0.)),f.x),mix(hash(a+vec2(0.,1.)),hash(a+1.),f.x),f.y);
      }
      void main(){
        vec2 p=world.xz; p.x+=travel;
        vec3 eye=normalize(world-cameraPosition);
        float horizon=pow(max(0.,1.-abs(eye.y)),6.);
        float n=noise(p*vec2(.14,2.4)+vec2(.155*t,.14*t));
        float second=noise(p*vec2(.075,.94)+vec2(-.11*t,.1*t));
        float sheen=smoothstep(.65,.82,n)*smoothstep(.38,.60,second);
        float shine=exp(-pow((eye.x+.534)*5.3,2.))*smoothstep(.0,.7,-eye.z);
        vec3 col=mix(nearColor,farColor,horizon*.85);
        col+=vec3(.015,.024,.024)*(second-.5);
        col=mix(col,glint,sheen*(.18+.68*shine)*(1.-horizon*.65)+shine*.10);
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`
  });
  const sea = new T.Mesh(new T.PlaneGeometry(1200,1200),waterMat);
  sea.rotation.x=-Math.PI/2; sea.position.y=-1.72; scene.add(sea);

  // Distant headlands in three broken layers, leaving a band of open horizon.
  const coast = new T.Group(); scene.add(coast);
  function headland(radius,from,to,height,tint,phase) {
    const verts=[], indices=[], shades=[];
    const n=54; const base=new T.Color(tint);
    for(let i=0;i<=n;i++){
      const u=i/n, a=from+(to-from)*u;
      const profile=(.55+.21*Math.sin(u*9+phase)+.12*Math.cos(u*18-phase)+.1*Math.sin(u*32+phase));
      const h=Math.pow(Math.sin(Math.PI*u),.65)*profile*height-1.65;
      const x=radius*Math.sin(a), z=-radius*Math.cos(a);
      verts.push(x,-2,z,x,h,z);
      for(const k of [.94,1.04]) shades.push(base.r*k,base.g*k,base.b*k);
      if(i) {const j=i*2; indices.push(j-2,j-1,j,j-1,j+1,j);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('color',new T.Float32BufferAttribute(shades,3));g.setIndex(indices);
    coast.add(new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:false})));
  }
  headland(128,-2.2,-.79,19,0xacc3c1,2);headland(134,-.31,.96,16,0xb6c8bd,.2);
  headland(110,-1.73,-.96,15,0x9eb8af,1);headland(115,.27,1.55,19,0xa1baaf,.3);
  headland(120,1.74,3.4,13,0xb0c3b8,1);headland(100,-3.1,-2.13,12,0xb0c3b8,5);

  // Clouds are hand-shaped, multi-lobed silhouettes painted on transparent cards.
  function cloudTexture() {
    const canvas=document.createElement('canvas'); canvas.width=320;canvas.height=128;
    const c=canvas.getContext('2d');
    const lobes=[[56,90,47,16],[95,78,53,22],[124,62,46,36],[154,52,38,33],[180,70,51,33],[218,79,44,24],[257,88,48,14],[138,91,104,13]];
    const grad=c.createLinearGradient(0,18,0,105);
    grad.addColorStop(0,'#fff8df');grad.addColorStop(.64,'#ffe9ce');grad.addColorStop(1,'#edccb9');
    c.fillStyle=grad;c.beginPath();
    for(const [x,y,w,h] of lobes) {c.moveTo(x+w,y);c.ellipse(x,y,w,h,0,0,Math.PI*2);}
    c.fill();
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;return tex;
  }
  const cloudMat=new T.SpriteMaterial({map:cloudTexture(),transparent:true,opacity:.85,depthWrite:false,fog:false});
  const clouds=[];
  for(let i=0;i<25;i++){
    const angle=-Math.PI+(i+random()*.5)/25*Math.PI*2;
    const sprite=new T.Sprite(cloudMat);
    const size=12+random()*25;
    sprite.position.set(105*Math.sin(angle),8+random()*24,-105*Math.cos(angle));
    sprite.scale.set(size,size*(.16+random()*.12),1);sprite.renderOrder=-3;
    coast.add(sprite);clouds.push([sprite,sprite.position.x]);
  }
  const door=new T.Group(); train.add(door);
  const doorParts=workshop(door);
  const car=workshop(train);
  const emerald=0x286c62, deep=0x184940, mint=0x438075, ivory=0xf4e2b7, brass=0xcfaa68;
  const teak=0x8a593b, darkWood=0x573e32, iron=0x384846, velvet=0x965b4f;
  // Undercarriage, leaf springs, paired flanged wheels and buffer beams.
  car.box(0,.96,0,11.38,.39,2.65,iron);
  car.box(0,.73,0,3.9,.42,1.73,0x34413f);
  for(const x of [-4.08,-2.86,2.86,4.08]) {
    car.cyl(x,.44,0,.15,2.32,iron,Math.PI/2);
    for(const side of [-1,1]){
      car.cyl(x,.44,side*.99,.46,.21,0x343d3b,Math.PI/2);
      car.cyl(x,.44,side*1.12,.34,.08,0x4c5752,Math.PI/2);
      car.cyl(x,.44,side*1.17,.14,.06,0x7c8270,Math.PI/2);
    }
  }
  for(const x of [-3.48,3.48]) for(const side of [-1,1]){
    car.box(x,.62,side*1.22,2.14,.2,.1,0x36463f);
    car.box(x,.5,side*1.23,1.35,.09,.12,0x575f51);
  }
  car.box(0,1.18,0,11.62,.24,2.98,darkWood);
  for(let i=0;i<13;i++) car.box(0,1.303,(i-6)*.224,11.43,.025,.216,[0xa77550,0xb8855c,0xac7952][i%3]);
  // Barrel roof is made in strips with a separate interior lining.
  for(let i=0;i<18;i++){
    const a=(i/18-.5)*Math.PI, b=((i+1)/18-.5)*Math.PI;
    const y1=3.59+.48*Math.cos(a),y2=3.59+.48*Math.cos(b),z1=1.57*Math.sin(a),z2=1.57*Math.sin(b);
    const slope=-Math.atan2(y2-y1,z2-z1), width=Math.hypot(y2-y1,z2-z1)+.007;
    car.box(0,(y1+y2)/2,(z1+z2)/2,11.79,.09,width,0x596760,slope);
    car.box(0,(y1+y2)/2-.068,(z1+z2)/2,11.57,.048,width,ivory,slope);
  }
  for(const x of [-3.7,-1.85,0,1.85,3.7]){
    car.ball(x,4.125,0,.28,.10,.22,0x677068);
    car.cyl(x,3.69,0,.18,.06,brass);
    car.ball(x,3.615,0,.155,.09,.155,0xffe6aa);
  }
  // Paired windows have hardwood jambs, dark gaskets and small brass sash locks.
  const sashes=[-3.45,-2.08,-.7,.7,2.08,3.45];
  for(const side of [-1,1]){
    const z=side*1.46;
    function panel(y,zPos,w,h,d,tint){
      if(side===1){car.box(0,y,zPos,w,h,d,tint);return;}
      const left=4.25, right=5.51;
      car.box((left-w/2)/2,y,zPos,left+w/2,h,d,tint);
      car.box((right+w/2)/2,y,zPos,w/2-right,h,d,tint);
      doorParts.box((left+right)/2,y,zPos, right-left,h,d,tint);
    }
    panel(1.76,z,11.57,.91,.14,emerald);
    panel(1.83,z+side*.079,11.55,.38,.028,mint);
    panel(1.42,z+side*.087,11.56,.045,.03,brass);
    panel(2.16,z,11.57,.13,.19,ivory);
    panel(2.08,z+side*.089,11.56,.034,.03,brass);
    car.box(0,3.5,z,11.58,.31,.18,ivory);
    car.box(0,3.64,z,11.81,.105,.23,deep);
    panel(2.23,z-side*.08,11.46,.10,.16,teak);
    for(const x of [-5.6,-4.16,-2.77,-1.39,0,1.39,2.77,4.16,5.6]){
      car.box(x,2.8,z,.13,1.23,.16,ivory);
      car.box(x,2.78,z-side*.088,.105,1.15,.04,teak);
    }
    for(const x of sashes){
      const w=1.22;
      for(const edge of [-1,1]){
        car.box(x+edge*w/2,2.805,z,.052,1.12,.12,darkWood);
        car.box(x,2.805+edge*.55,z,w,.052,.12,darkWood);
      }
      car.box(x,3.16,z,w,.038,.09,teak);
      car.box(x,2.276,z-side*.079,.13,.034,.032,brass);
      car.box(x,1.78,z-side*.104,1.21,.59,.047,teak);
    }
    for(const x of [-4.89,4.89]){
      const frame=(side===-1&&x>0)?doorParts:car;
      frame.box(x,1.75,z+side*.105,1.19,.80,.054,deep);
      for(const dx of [-.47,0,.47]) frame.box(x+dx,2.8,z,.055,1.24,.16,deep);
      frame.box(x,3.33,z,1,.07,.18,deep);
      frame.box(x,2.27,z,1,.074,.18,deep);
      frame.box(x+.31,2.14,z+side*.14,.13,.054,.055,brass);
      car.box(x,.999,z+side*.15,1.32,.08,.37,iron);
      car.box(x,.992,z+side*.32,1.27,.03,.035,brass);
    }
    // Long inward-facing upholstered benches and embroidered piping.
    for(const x of [-2.08,2.08]){
      car.box(x,1.48,side*1.02,3.57,.32,.77,darkWood);
      car.box(x,1.695,side*1.01,3.63,.18,.80,velvet);
      car.box(x,1.72,side*.615,3.47,.026,.032,0xba8169);
      car.box(x,1.91,side*1.34,3.63,.46,.17,velvet,side*.09);
      car.box(x,2.122,side*1.34,3.57,.036,.18,0xc28f72);
      for(const dx of [-1.15,0,1.15]) {
        car.box(x+dx,1.929,side*1.245,.022,.305,.018,0x825447);
        car.ball(x+dx,1.971,side*1.23,.045,.038,.02,0xc08666);
      }
    }
    for(const x of [-3.87,-.25,.25,3.87]){
      car.cyl(x,1.83,side*.68,.027,.28,brass);
      car.box(x,1.99,side*.94,.09,.084,.63,teak);
    }
    for(const x of [-3.6,-1.19,1.19,3.6]){
      car.beam(v(x,3.52,side*1.34),v(x,3.37,side*.96),.026,brass);
    }
    for(const r of [.95,1.12,1.27]) car.box(0,3.365,side*r,7.35,.027,.025,brass);
  }
  // Driver's end, leather bellows, front glazing and a round amber headlight.
  for(const end of [-1,1]){
    const x=end*5.7;
    car.box(x,1.74,0,.2,.87,2.95,emerald);
    car.box(x+end*.1,2.12,0,.08,.115,2.94,ivory);
    car.box(x,3.48,0,.23,.27,2.96,ivory);
    for(const z of [-1.40,-.53,.53,1.4]){
      car.box(x,2.8,z,.23,1.22,.13,ivory);
      car.box(x-end*.125,2.8,z,.04,1.22,.09,teak);
    }
    for(const z of [-.98,0,.98]){
      car.box(x,3.17,z,.13,.06,z===0?.98:.77,teak);
      car.box(x,2.3,z,.17,.09,z===0?.98:.79,darkWood);
    }
    car.box(x+end*.12,1.65,0,.072,.8,.92,deep);
    car.cyl(x+end*.18,1.83,0,.265,.13,darkWood,0,0,Math.PI/2);
    car.cyl(x+end*.25,1.83,0,.215,.09,brass,0,0,Math.PI/2);
    car.cyl(x+end*.305,1.83,0,.157,.04,0xffefb8,0,0,Math.PI/2);
    for(const z of [-1.16,1.16]){
      car.cyl(x+end*.12,1.53,z,.108,.075,brass,0,0,Math.PI/2);
      car.cyl(x+end*.161,1.53,z,.073,.04,0xc5684d,0,0,Math.PI/2);
      car.box(x+end*.12,.95,z,.4,.13,.3,iron);
    }
    car.box(x+end*.23,.82,0,.72,.18,.28,iron);
  }
  // A hatbox, leather travel case, striped scarf and a sleeping ginger cat.
  car.box(-2.5,3.58,-1.10,.92,.34,.48,0x985f3d,0,.06);
  for(const x of [-2.78,-2.22])car.box(x,3.59,-1.10,.053,.355,.49,0xd6ac65,0,.06);
  car.box(-2.49,3.78,-1.1,.23,.047,.078,teak);
  car.cyl(2.78,3.51,1.13,.25,.26,0xd6a970);
  car.cyl(2.78,3.63,1.13,.263,.063,0xa47748);
  car.ball(-1.2,1.89,-1.01,.34,.147,.228,0xc08b55,0,-.31);
  car.ball(-.98,1.99,-.95,.16,.14,.145,0xd4a06a);
  car.shape(wedge,-1.074,2.108,-.972,.061,.123,.065,0x945f43,0,0,.14);
  car.shape(wedge,-.901,2.109,-.974,.061,.123,.065,0x945f43,0,0,-.14);
  car.ball(-1.33,1.831,-.837,.207,.058,.071,0xab7951,0,.31);
  for(const x of [-1.04,-.922]) car.box(x,2.006,-.817,.039,.009,.011,0x503d31);
  car.finish();

  function makeSign(text,sub,background,foreground,width,height,x,y,z,ry) {
    const cv=document.createElement('canvas');cv.width=800;cv.height=200;
    const c=cv.getContext('2d');
    c.fillStyle=background;c.fillRect(0,0,800,200);
    c.strokeStyle=foreground;c.lineWidth=3;c.strokeRect(10,10,780,180);
    c.textAlign='center';c.textBaseline='middle';c.fillStyle=foreground;
    c.font='bold 72px Georgia, serif';c.fillText(text,400,sub?75:100,720);
    if(sub){c.font='31px Georgia, serif';c.fillText(sub,400,145,700);}
    const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    const sign=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:tex}));
    sign.position.set(x,y,z);sign.rotation.y=ry;train.add(sign);
  }
  for(const side of [-1,1]){
    makeSign('SEA LINE','海 原 鉄 道','#305c50','#f4dfad',2.38,.54,0,1.76,side*1.568,side===1?0:Math.PI);
  }
  for(const end of [-1,1])makeSign('海 原 行','SEA LINE','#393f35','#f7e7b7',.94,.26,end*5.822,3.49,0,end*Math.PI/2);
  const rails = workshop(scene);
  for(const side of [-1,1]) {
    rails.box(0,-.114,side*.99,260,.17,.105,0x5f6c66);
    rails.box(0,-.025,side*.99,260,.055,.155,0x9b9b88);
    rails.box(0,-.386,side*.99,260,.264,.27,0x625a48);
    rails.box(0,-.57,side*.99,260,.14,.38,0x4e554b);
  }
  rails.finish();
  const road=new T.Group();scene.add(road);
  const bed=workshop(road);
  for(let i=-93;i<=93;i++){
    const x=i*.72;
    bed.box(x,-.249,0,.221,.136,2.76,i%3===0?0x8b7356:0x78664e);
    for(const z of [-1.12,1.12]) bed.box(x,-.164,z,.085,.042,.083,0x666c61);
  }
  for(let i=-10;i<=10;i++){
    const x=i*7.2;
    bed.box(x,-.688,0,.41,.29,3.15,0x746f5e);
    for(const s of [-1,1]){
      bed.cyl(x,-1.63,s*1.03,.20,2.01,0x766f5c);
      bed.cyl(x,-1.32,s*1.03,.213,.083,0x505e55);
      bed.beam(v(x,-1.55,s*1.03),v(x+1.95,-.67,s*1.03),.082,0x7b735d);
      bed.beam(v(x,-1.55,s*1.03),v(x-1.95,-.67,s*1.03),.082,0x7b735d);
    }
  }
  bed.finish();

  const posts=new T.Group();scene.add(posts);
  const poles=workshop(posts);
  for(let i=-4;i<=4;i++){
    const x=10.8+i*21.6;
    poles.cyl(x,1.40,-2.13,.10,6.21,teak);
    poles.box(x,4.18,-2.13,.13,.13,1.59,darkWood);
    for(const z of [-2.7,-1.56]){
      poles.cyl(x,4.32,z,.066,.21,0x98b6a7);
      poles.cyl(x,4.41,z,.082,.056,0xb6ceba);
      if(i===4)continue;
      for(let j=0;j<4;j++){
        const h=(u)=>4.45-.39*4*u*(1-u);
        poles.beam(v(x+21.6*j/4,h(j/4),z),v(x+21.6*(j+1)/4,h((j+1)/4),z),.012,0x676b5d);
      }
    }
  }
  poles.finish();

  function island() {
    const g=new T.Group(), q=workshop(g);
    q.ball(0,-1.73,0,5.9,.89,2.8,0x9b9b79);
    q.ball(-.4,-1.18,-.15,4.9,.66,2.24,0xa6ab7b);
    q.ball(1.95,-1.31,.74,2.28,.40,1.57,0x8b9e7c);
    for(let i=0;i<14;i++){
      const x=(random()-.5)*7.8,z=(random()-.5)*2.4;
      const h=1.0+random()*1.7;
      q.cyl(x,-.53+h*.19,z,.075,h*.5,0x6b7460);
      q.shape(wedge,x,-.52+h*.61,z,h*.26,h*.84,h*.28,[0x689681,0x78957d,0x729681][i%3]);
    }
    q.finish();return g;
  }
  const islands=[];
  for(const [x,z,scale] of [[-31,-52,1.25],[46,-42,1],[-63,26,.67],[28,68,1.6]]){
    const g=island();g.position.set(x,0,z);g.scale.setScalar(scale);scene.add(g);islands.push([g,x]);
  }
  const beacon=new T.Group(); const lightHouse=workshop(beacon);
  lightHouse.ball(0,-1.79,0,3.36,1.05,2.07,0x939884);
  lightHouse.cyl(0,1.32,0,.55,4.1,0xf4e0b5);
  for(const y of [.4,2.2])lightHouse.cyl(0,y,0,.563,.55,0xab6154);
  lightHouse.cyl(0,3.4,0,.73,.15,iron);
  lightHouse.cyl(0,3.73,0,.38,.54,0xffe3a2);
  for(const x of [-.32,.32])for(const z of [-.2,.2])lightHouse.cyl(x,3.73,z,.038,.57,iron);
  lightHouse.shape(wedge,0,4.15,0,.69,.42,.69,0xa95b50);
  lightHouse.finish();beacon.position.set(-22,0,-38);scene.add(beacon);islands.push([beacon,-22]);

  function sailboat(x,z,size){
    const g=new T.Group(), hull=workshop(g);
    hull.ball(0,0,0,1.16,.22,.35,0x9d6247);
    hull.box(0,.15,0,1.72,.11,.62,ivory);
    hull.cyl(.09,.99,0,.035,1.83,teak);
    hull.finish();
    function sail(pts,tint){
      const geo=new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pts,3));geo.computeVertexNormals();
      const mat=new T.MeshStandardMaterial({color:tint,side:T.DoubleSide,roughness:.95});
      g.add(new T.Mesh(geo,mat));
    }
    sail([.12,1.88,0,.12,.34,0,1.02,.34,.06],0xf7dbac);
    sail([.015,1.69,0,-.86,.35,.05,.01,.35,0],0xca8d70);
    g.position.set(x,-1.59,z);g.scale.setScalar(size);g.rotation.y=-.24;scene.add(g);return [g,x];
  }
  const boats=[sailboat(-14,-25,.83),sailboat(23,-34,1.03)];
  const birds=[];
  for(let i=0;i<8;i++){
    const bird=new T.Group();
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute([-.55,0,.03,-.28,.15,0,-.07,.075,0,0,.005,-.02,.07,.075,0,.28,.15,0,.55,0,.03],3));
    bird.add(new T.Line(geometry,new T.LineBasicMaterial({color:0x7c8f88})));
    scene.add(bird);birds.push(bird);
  }

  function update(time, displacement) {
    waterMat.uniforms.t.value=time;
    waterMat.uniforms.travel.value=displacement;
    road.position.x=-(displacement%7.2);
    posts.position.x=-(displacement%21.6);
    train.position.y=Math.sin(displacement*3)*.012;
    for(const [obj,x] of islands){
      obj.position.x=((x-displacement*.5+135)%270+270)%270-135;
    }
    for(const [boat,x] of boats){
      boat.position.x=((x-displacement*.62+time*.06+90)%180+180)%180-90;
      boat.position.y=-1.58+.055*Math.sin(time*1.17+x);boat.rotation.z=.035*Math.sin(time*.95+x);
    }
    for(const [cloud,x] of clouds)cloud.position.x=x+Math.sin(time*.016+x)*1.7;
    for(let i=0;i<birds.length;i++){
      const a=time*.045+i*.13;
      birds[i].position.set(-21+Math.sin(a)*9+i*1.41,7.11+i*.22+Math.sin(a*5+i)*.39,-30+Math.cos(a)*3+i*.53);
      birds[i].rotation.z=Math.sin(time*2.2+i)*.13;
    }
  }
  update(0,0);
  doorParts.finish();
  return {train,update,setDoor(open){door.position.x=-1.34*open;door.position.z=-.115*open;}};
}
