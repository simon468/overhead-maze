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
  scene.background = new THREE.Color(0x233630);
  const camera = new THREE.OrthographicCamera(-10,10,10,-10,.1,120);
  scene.add(new THREE.HemisphereLight(0xfff5ce,0x678b79,1.85));
  const sun = new THREE.DirectionalLight(0xffe6ad,2.3);
  sun.position.set(-8,18,7); scene.add(sun);
  function mesh(geometry,color,emission=0) {
    const item=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive:emission,flatShading:true}));
    scene.add(item); return item;
  }
  const foundation=mesh(new THREE.BoxGeometry(1,.4,1),0x9e8863);
  const wallShape=new THREE.BoxGeometry(1,.67,1);
  const wallMaterial=new THREE.MeshStandardMaterial({color:0xffffff});
  const actor=mesh(new THREE.OctahedronGeometry(.39),0xffbd52,0x874009);
  const ring=mesh(new THREE.TorusGeometry(.32,.075,8,32),0x83ffbd,0x27895b);
  ring.rotation.x=-Math.PI/2;
  const beacon=mesh(new THREE.OctahedronGeometry(.19),0xb5ffdf,0x308e66);
  let stage=1,size,grid,walls,x,z,moves,won;
  const held = new Map();
  const radius = 0.35;
  const speed = 3.2;
  let lastFrame;
  function resize() {
    const {width,height}=canvas.getBoundingClientRect();
    const aspect=width/height, span=(size+1.5)/2;
    camera.left=-span*Math.max(1,aspect); camera.right=-camera.left;
    camera.top=span*Math.max(1,1/aspect); camera.bottom=-camera.top;
    camera.updateProjectionMatrix(); renderer.setSize(width,height,false);
  }
  function restart() {
    held.clear();
    x=z=1; moves=0; won=false; actor.position.set(x,.5,z);
    el('moves').textContent='0 moves'; el('win').hidden=true;
  }
  function newMaze() {
    size=Math.min(9+stage*2,25); grid=carve(size);
    if(walls){scene.remove(walls); walls.dispose();}
    const count=grid.flat().reduce((a,b)=>a+b,0);
    walls=new THREE.InstancedMesh(wallShape,wallMaterial,count);
    let index=0;
    grid.forEach((row,rz)=>row.forEach((wall,rx)=>{
      if(!wall)return;
      walls.setMatrixAt(index,new THREE.Matrix4().makeTranslation(rx,.335,rz));
      walls.setColorAt(index++,new THREE.Color([0x436a51,0x496e54,0x53765a][Math.floor(Math.random()*3)]));
    }));
    scene.add(walls);
    const mid=(size-1)/2;
    foundation.position.set(mid,-.2,mid); foundation.scale.set(size,1,size);
    camera.position.set(mid,35,mid+10); camera.lookAt(mid,0,mid);
    ring.position.set(size-2,.09,size-2); beacon.position.set(size-2,.42,size-2);
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
    if (won || !held.size) return;
    const active = new Set(held.values());
    const dx = Number(active.has('right')) - Number(active.has('left'));
    const dz = Number(active.has('down')) - Number(active.has('up'));
    const distance = seconds * speed / (Math.hypot(dx, dz) || 1);
    const oldCol = Math.round(x), oldRow = Math.round(z);
    x = advance(x, z, dx * distance, true);
    z = advance(z, x, dz * distance, false);
    const col = Math.round(x), row = Math.round(z);
    if (col !== oldCol || row !== oldRow) {
      moves++;
      el('moves').textContent = moves + (moves === 1 ? ' move' : ' moves');
    }
    if (Math.hypot(x - (size - 2), z - (size - 2)) < 0.42) {
      won = true;
      held.clear();
      el('score').textContent = 'Maze ' + stage + ' completed in ' + moves + ' moves.';
      el('win').hidden = false;
      el('next').focus();
    }
  }
  const keys = {arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down'};
  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (keys[key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) held.set(key, keys[key]);
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
      held.set(event.pointerId, button.dataset.dir);
    };
    button.onlostpointercapture = button.onpointerup = button.onpointercancel = event => held.delete(event.pointerId);
    button.onclick = event => {
      if (event.detail === 0) {
        held.set('activation', button.dataset.dir);
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
    actor.position.set(x,.48+.04*Math.sin(t/230),z);
    actor.rotation.y=t/750; beacon.rotation.y=-t/650;
    renderer.render(scene,camera);
  });
}
try {play();} catch(error) {el('error').textContent='Unable to start the 3D view. Open this game in a browser with WebGL enabled.';console.error(error);}
