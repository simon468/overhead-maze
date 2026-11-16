const el = id => document.getElementById(id);
const directions = {left:[-1,0], up:[0,-1], right:[1,0], down:[0,1]};
function carve(size) {
  const grid = Array.from({length:size}, () => Array(size).fill(1));
  const stack = [[1,1]];
  grid[1][1] = 0;
  while (stack.length) {
    const [x,z] = stack[stack.length-1];
    const choices = Object.values(directions).filter(([dx,dz]) => {
      const nx=x+2*dx, nz=z+2*dz;
      return nx>0 && nz>0 && nx<size-1 && nz<size-1 && grid[nz][nx];
    });
    if (!choices.length) { stack.pop(); continue; }
    const [dx,dz] = choices[Math.floor(Math.random()*choices.length)];
    grid[z+dz][x+dx] = grid[z+2*dz][x+2*dx] = 0;
    stack.push([x+2*dx,z+2*dz]);
  }
  return grid;
}
function play() {
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x131315);
  const camera = new THREE.OrthographicCamera(-10,10,10,-10,.1,120);
  scene.add(new THREE.HemisphereLight(0xffffff,0x828288,0.9));
  const sun = new THREE.DirectionalLight(0xffffff,1.1);
  sun.position.set(-8,18,7); scene.add(sun);
  function mesh(geometry,color,emission=0) {
    const item=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive:emission,flatShading:true}));
    scene.add(item); return item;
  }
  const foundation=mesh(new THREE.BoxGeometry(1,.4,1),0x626267);
  const wallShape=new THREE.BoxGeometry(1,.67,1);
  const wallMaterial=new THREE.MeshStandardMaterial({color:0xffffff});
  const actor=mesh(new THREE.OctahedronGeometry(.39),0xadffff,0x00d8da);
  const ring=mesh(new THREE.TorusGeometry(.32,.075,8,32),0xff99e8,0xff15b2);
  ring.rotation.x=-Math.PI/2;
  const beacon=mesh(new THREE.OctahedronGeometry(.19),0xffc0f4,0xff27c1);
  const lanternLight = new THREE.PointLight(0x12fff4, 20, 4.3);
  const goalLight = new THREE.PointLight(0xff28cb, 7, 2.5);
  scene.add(lanternLight, goalLight);
  const pixels = el('pixels');
  const ink = pixels.getContext('2d');
  const sparks = [];
  let burstStart;
  function startBurst() {
    const origin = beacon.getWorldPosition(new THREE.Vector3()).project(camera);
    const colors = ['#ff47ce', '#ffb1ec', '#50fff0', '#edffff'];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < (reduced ? 48 : 210); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.08 + Math.random() * 0.57) * (reduced ? 0.4 : 1);
      sparks.push({
        x: (origin.x + 1) / 2, y: (1 - origin.y) / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        width: 1 + Math.floor(Math.random() * 4),
        color: colors[i % colors.length]
      });
    }
    burstStart = performance.now();
  }
  function drawBurst(now) {
    if (burstStart === undefined) return;
    const age = Math.max(0, (now - burstStart) / 1000);
    ink.clearRect(0, 0, pixels.width, pixels.height);
    if (age >= 1.25) {
      burstStart = undefined;
      sparks.length = 0;
      el('win').hidden = false;
      el('next').focus();
      return;
    }
    const span = Math.min(pixels.width, pixels.height);
    const travel = 1 - Math.exp(-3 * age);
    for (const spark of sparks) {
      ink.fillStyle = spark.color;
      const px = spark.x * pixels.width + spark.vx * span * travel;
      const py = spark.y * pixels.height + (spark.vy * travel + 0.12 * age * age) * span;
      const width = Math.ceil(spark.width * (1 - age / 1.25));
      ink.fillRect(Math.round(px), Math.round(py), width, width);
    }
  }
  let stage=1,size,grid,walls,x,z,won;
  const held = new Map();
  const radius = 0.35;
  const baseSpeed = 4.32;
  const boostSeconds = 2;
  let heldSeconds = 0;
  function press(control, direction) {
    if (!held.size) heldSeconds = 0;
    held.set(control, direction);
  }
  let lastFrame;
  let aspect = 1;
  let overviewStart;
  const overviewMs = 5000;
  const pickups = new THREE.Group();
  const pickupShape = new THREE.TorusGeometry(.31,.09,6,4);
  const pickupMaterial = new THREE.MeshBasicMaterial({color:0xc8ff36});
  scene.add(pickups);
  function placePickups() {
    pickups.clear();
    const ends = [];
    for (let row=1; row<size-1; row++) {
      for (let col=1; col<size-1; col++) {
        if (grid[row][col] || (row===1 && col===1) || (row===size-2 && col===size-2)) continue;
        const exits = Object.values(directions).filter(([dx,dz]) => !grid[row+dz][col+dx]);
        if (exits.length===1) ends.push([col,row]);
      }
    }
    const count = Math.ceil(ends.length/4);
    for (let i=0; i<count; i++) {
      const [col,row] = ends.splice(Math.floor(Math.random()*ends.length),1)[0];
      const item = new THREE.Mesh(pickupShape,pickupMaterial);
      item.position.set(col,.38,row);
      item.rotation.x = -Math.PI/2;
      pickups.add(item);
    }
  }
  function frameCamera(now) {
    let blend = 0;
    if (overviewStart !== undefined) {
      const elapsed = now - overviewStart;
      if (elapsed >= overviewMs) {
        if (startedAt !== undefined) startedAt += overviewMs;
        overviewStart = undefined;
        el('overview').hidden = true;
      } else {
        const ramp = THREE.MathUtils.clamp(Math.min(elapsed, overviewMs-elapsed)/800,0,1);
        blend = ramp*ramp*(3-2*ramp);
        el('overview').hidden = false;
        el('overview').textContent = 'Map view · Timer paused · ' + Math.ceil((overviewMs-elapsed)/1000) + 's';
      }
    }
    const span = THREE.MathUtils.lerp(5.4,(size+1.5)/2,blend);
    const halfW = span*Math.max(1,aspect), halfH = span*Math.max(1,1/aspect);
    const mid = (size-1)/2;
    const follow = (v,half) => half >= mid ? mid : THREE.MathUtils.clamp(v,half-.5,size-.5-half);
    const cx = THREE.MathUtils.lerp(follow(x,halfW),mid,blend);
    const cz = THREE.MathUtils.lerp(follow(z,halfH*1.04),mid,blend);
    camera.position.set(cx,35,cz+10); camera.lookAt(cx,0,cz);
    camera.left=-halfW; camera.right=halfW; camera.top=halfH; camera.bottom=-halfH;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  function resize() {
    const {width,height}=canvas.getBoundingClientRect();
    aspect=width/height;
    pixels.width=Math.max(1,Math.round(width/3)); pixels.height=Math.max(1,Math.round(height/3));
    renderer.setSize(width,height,false); frameCamera(performance.now());
  }
  const trailLife = 25000;
  const marks = [];
  const trail = new THREE.InstancedMesh(new THREE.CircleGeometry(.11,8),
    new THREE.MeshBasicMaterial({color:0x48cfcf,transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false}),1024);
  trail.count=0; trail.frustumCulled=false; scene.add(trail);
  const stamp = new THREE.Object3D();
  const trailTint = new THREE.Color();
  stamp.rotation.x=-Math.PI/2;
  function drawTrail(now) {
    while (marks.length && now-marks[0].time>=trailLife) marks.shift();
    const prev=marks[marks.length-1];
    if (!won && overviewStart===undefined && (!prev || Math.hypot(x-prev.x,z-prev.z)>=.24)) {
      marks.push({x,z,time:now});
    }
    trail.count=marks.length;
    marks.forEach((mark,i)=>{
      stamp.position.set(mark.x,.015,mark.z);
      const strength=1-(now-mark.time)/trailLife;
      stamp.scale.setScalar(.45+.55*strength);
      trail.setColorAt(i,trailTint.setRGB(strength,strength,strength));
      stamp.updateMatrix();
      trail.setMatrixAt(i,stamp.matrix);
    });
    trail.instanceMatrix.needsUpdate=true;
    if (trail.instanceColor) trail.instanceColor.needsUpdate=true;
  }
  let startedAt;
  let displayedSeconds;
  function updateTimer(now) {
    const seconds = startedAt === undefined ? 0 : Math.floor(((overviewStart ?? now) - startedAt) / 1000);
    const time = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    if (seconds !== displayedSeconds) {
      displayedSeconds = seconds;
      el('timer').textContent = 'Time ' + time;
    }
    return time;
  }
  function restart() {
    held.clear();
    overviewStart = undefined; el('overview').hidden = true;
    pickups.children.forEach(item => item.visible=true);
    marks.length=0; trail.count=0;
    burstStart = undefined;
    sparks.length = 0;
    ink.clearRect(0, 0, pixels.width, pixels.height);
    x=z=1; startedAt=undefined; won=false; actor.position.set(x,.5,z);
    updateTimer(performance.now()); el('win').hidden=true;
  }
  function newMaze() {
    size=2*Math.round((Math.min(9+stage*2,25)*Math.sqrt(10)-1)/2)+1; grid=carve(size); placePickups();
    if(walls){scene.remove(walls); walls.dispose();}
    const count=grid.flat().reduce((a,b)=>a+b,0);
    walls=new THREE.InstancedMesh(wallShape,wallMaterial,count);
    let index=0;
    grid.forEach((row,rz)=>row.forEach((wall,rx)=>{
      if(!wall)return;
      walls.setMatrixAt(index,new THREE.Matrix4().makeTranslation(rx,.335,rz));
      walls.setColorAt(index++,new THREE.Color([0x303035,0x333338,0x36363a][Math.floor(Math.random()*3)]));
    }));
    scene.add(walls);
    const mid=(size-1)/2;
    foundation.position.set(mid,-.2,mid); foundation.scale.set(size,1,size);
    camera.position.set(mid,35,mid+10); camera.lookAt(mid,0,mid);
    goalLight.position.set(size-2, 0.8, size-2); ring.position.set(size-2,.09,size-2); beacon.position.set(size-2,.42,size-2);
    el('level').textContent='Maze '+stage; restart(); resize();
  }
  // Check the leading edge against every wall touched by the lantern's width.
  function advance(position, across, delta, horizontal) {
    if (!delta) return position;
    const sign = Math.sign(delta);
    const target = position + delta;
    const ahead = Math.round(target + sign * radius);
    for (let i = Math.round(across - radius + 1e-8); i <= Math.round(across + radius - 1e-8); i++) {
      if (horizontal ? grid[i][ahead] : grid[ahead][i]) {
        return ahead - sign * (0.5 + radius);
      }
    }
    return target;
  }
  function move(seconds) {
    if (won || overviewStart !== undefined || !held.size) return;
    const active = new Set(held.values());
    const dx = Number(active.has('right')) - Number(active.has('left'));
    const dz = Number(active.has('down')) - Number(active.has('up'));
    heldSeconds = Math.min(boostSeconds, heldSeconds + seconds);
    const speed = baseSpeed * (1 + 0.5 * heldSeconds / boostSeconds);
    const distance = seconds * speed / (Math.hypot(dx, dz) || 1);
    const oldX = x, oldZ = z;
    x = advance(x, z, dx * distance, true);
    z = advance(z, x, dz * distance, false);
    if (startedAt === undefined && (x !== oldX || z !== oldZ)) startedAt = performance.now();
    const found = pickups.children.find(item => item.visible && Math.hypot(x-item.position.x,z-item.position.z)<.42);
    if (found) {
      found.visible=false;
      overviewStart=performance.now();
      heldSeconds=0;
    }
    if (Math.hypot(x - (size - 2), z - (size - 2)) < 0.42) {
      won = true;
      held.clear();
      el('score').textContent = 'Maze ' + stage + ' completed in ' + updateTimer(performance.now()) + '.';
      startBurst();
    }
  }
  const keys = {arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down'};
  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (keys[key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) press(key, keys[key]);
    }
  });
  window.addEventListener('keyup', event => held.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) held.clear(); });
  document.querySelectorAll('[data-dir]').forEach(button => {
    button.style.touchAction = 'none';
    button.onpointerdown = event => {
      if (event.button !== 0) return;
      button.setPointerCapture(event.pointerId);
      press(event.pointerId, button.dataset.dir);
    };
    button.onlostpointercapture = button.onpointerup = button.onpointercancel = event => held.delete(event.pointerId);
    button.onclick = event => {
      if (event.detail === 0) {
        press('activation', button.dataset.dir);
        move(0.05);
        held.delete('activation');
      }
    };
  });
  el('restart').onclick=restart; el('next').onclick=()=>{stage++;newMaze();};
  newMaze(); new ResizeObserver(resize).observe(canvas.parentElement);
  renderer.setAnimationLoop(t=>{
    move(Math.min((t - (lastFrame ?? t)) / 1000, 0.05));
    lastFrame = t;
    const now=performance.now();
    frameCamera(now); drawTrail(now);
    if (!won) updateTimer(now);
    actor.position.set(x,.48+.04*Math.sin(t/230),z);
    lanternLight.position.set(x, 0.85, z);
    drawBurst(t);
    actor.rotation.y=t/750; beacon.rotation.y=-t/650;
    renderer.render(scene,camera);
  });
}
try {play();} catch(error) {el('error').textContent='Unable to start the 3D view. Open this game in a browser with WebGL enabled.';console.error(error);}
