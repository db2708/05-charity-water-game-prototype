/* script.js
   Charity Drops — suika-style merge game
   Basic physics, merging, preview, settings, score, game-over
*/

(() => {
  // --- DOM ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const wellBox = document.getElementById('wellBox');
  const jerryEl = document.getElementById('jerry');
  const currentDropEl = document.getElementById('currentDrop');
  const scoreEl = document.getElementById('score');
  const highEl = document.getElementById('highscore');
  const nextPreview = document.getElementById('nextPreview');

  const titleModal = document.getElementById('titleModal');
  const startBtn = document.getElementById('startBtn');
  const cbModeCheckbox = document.getElementById('cbMode');
  const dropOrderPreview = document.getElementById('dropOrderPreview');

  const settingsModal = document.getElementById('settingsModal');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeSettings = document.getElementById('closeSettings');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const cbModeSettings = document.getElementById('cbModeSettings');
  const soundToggle = document.getElementById('soundToggle');

  const restartBtn = document.getElementById('restartBtn');
  const pauseOverlay = document.getElementById('pauseOverlay');

  const gameOverModal = document.getElementById('gameOverModal');
  const finalScoreEl = document.getElementById('finalScore');
  const goHomeBtn = document.getElementById('goHomeBtn');
  const restartGameBtn = document.getElementById('restartGameBtn');

  const winModal = document.getElementById('winModal');
  const winHomeBtn = document.getElementById('winHomeBtn');
  const winRestartBtn = document.getElementById('winRestartBtn');

  // --- State ---
  let W = 820, H = 624;
  canvas.width = W; canvas.height = H;

  // Make well even taller
  // Well is about 60% as wide and 20% taller
  let well = { x: W*0.20, y: 10, width: W*0.60, height: H-20 };

  // Matter.js physics setup
  const { Engine, Render, World, Bodies, Body, Events, Composite } = window.Matter;
  const engine = Engine.create();
  const world = engine.world;
  world.gravity.y = 1.2; // gentle gravity

  // Add static boundary walls and floor to keep balls inside the well
  function addBoundaries() {
    // Remove old boundaries if they exist
    if(world._boundaries) {
      for(const b of world._boundaries) World.remove(world, b);
    }
    // Left wall (make it wider and taller so balls can't escape)
    const leftWall = Bodies.rectangle(
      well.x - 8, // move wall slightly outside visual edge
      well.y + well.height/2,
      24, // wider wall
      well.height + 48, // taller wall
      { isStatic: true }
    );
    // Right wall (same adjustment)
    const rightWall = Bodies.rectangle(
      well.x + well.width + 8,
      well.y + well.height/2,
      24,
      well.height + 48,
      { isStatic: true }
    );
    // Floor
    const floor = Bodies.rectangle(well.x + well.width/2, well.y + well.height, well.width, 12, { isStatic: true });
    // Top (optional, for game over detection)
    // const ceiling = Bodies.rectangle(well.x + well.width/2, well.y, well.width, 8, { isStatic: true });
    World.add(world, [leftWall, rightWall, floor]);
    world._boundaries = [leftWall, rightWall, floor];
  }

  // Call boundaries setup after canvas/well sizing

  let dropBodies = [];
  let currentDropSize = 1;
  let nextDropSize = 1;

  let running = false;
  let paused = false;
  let score = 0;
  let highScore = parseInt(localStorage.getItem('cw_highscore') || '0', 10);

  // Load settings from localStorage
  let cbMode = localStorage.getItem('cw_cbMode') === 'true';
  let soundEnabled = localStorage.getItem('cw_soundEnabled') !== 'false';

  // jerry position
  let jerryX = well.x + well.width/2;
  let jerryTargetX = jerryX;

  // sizes/colors
  // Now allow up to 9 drop sizes
  const MAX_SIZE = 9;
  const baseRadius = 18; // slightly smaller starting ball
  // Each drop is 1.28x larger than the previous one
  function radiusForSize(s){ return baseRadius * Math.pow(1.28, s-1); }
  // Varying shades of blue for drops 1-9
  const COLORS = [
    '#b3dafe', // light blue
    '#8ecafc', // slightly deeper
    '#6bbafc', // medium light
    '#4faafc', // medium
    '#2e9df7', // charity: water blue
    '#2179c4', // deeper blue
    '#185a9d', // rich blue
    '#133e7c', // dark blue
    '#0a2540'  // very dark blue
  ];
  function colorForSize(s){ return COLORS[(s-1) % COLORS.length]; }
  // Scoring for each drop size as specified
  const DROP_POINTS = [1,3,6,10,15,21,28,36,45];
  function scoreForNewDrop(size){
    // size is 1-based
    return DROP_POINTS[size-1] || 0;
  }

  // audio
  const audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;
  function playMergeSound(){
    if(!audioCtx || !soundEnabled) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 420; g.gain.value = 0.001;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.06, now+0.02);
    o.frequency.exponentialRampToValueAtTime(700, now+0.18);
    o.start(now); o.stop(now+0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.28);
  }
  function playPlaceSound(){
    if(!audioCtx || !soundEnabled) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.value = 180; g.gain.value = 0.02;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.linearRampToValueAtTime(0.04, now+0.02);
    o.start(now); o.stop(now+0.16);
    g.gain.linearRampToValueAtTime(0.0001, now+0.16);
  }

  // utils
  // Fisher-Yates shuffle for drop selection
  // Weighted drop bag: drop 1: 40%, drop 2: 30%, drop 3: 20%, drop 4: 8%, drop 5: 2%
  // Make the first drop slightly less common for more variety
  const DROP_WEIGHTS = [28, 30, 20, 8, 2];
  let dropBag = [];
  function refillDropBag() {
    dropBag = [];
    for(let i=0; i<5; i++) {
      for(let j=0; j<DROP_WEIGHTS[i]; j++) {
        dropBag.push(i+1);
      }
    }
    // Fisher-Yates shuffle
    for(let i = dropBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = dropBag[i];
      dropBag[i] = dropBag[j];
      dropBag[j] = temp;
    }
  }

  function randWeightedSize() {
    if(dropBag.length === 0) refillDropBag();
    return dropBag.pop();
  }
  function createDrop(size,x,y){
    // Create a Matter.js circle body for the drop
    // Lower friction and frictionAir so drops roll off each other faster
    const radius = radiusForSize(size);
    // Increase friction for more ball-to-ball resistance
      const body = Bodies.circle(x, y, radius, {
        restitution: 0.25, // higher bounce, less squish
        friction: 0.080,    // more resistance to sliding
        frictionStatic: 0.6, // more resistance to compression
        frictionAir: 0.01, // less air drag
      label: 'drop',
      render: { fillStyle: colorForSize(size) }
    });
    body.size = size;
    body.radius = radius;
    body.color = colorForSize(size);
    body.id = Math.random().toString(36).slice(2,8);
    World.add(world, body);
    return body;
  }

  // --- UI updates ---
  function updateScoreUI(){
    // Prevent score from going below 0
    if (score < 0) score = 0;
    scoreEl.textContent = score;
    highEl.textContent = highScore;
  }
  function updatePreviewUI(){
    const s = currentDropSize;
    // Show the next drop (n+1th) in the preview
    const nextS = nextDropSize;
    nextPreview.style.background = colorForSize(nextS);
    nextPreview.style.width = nextPreview.style.height = '32px';
    nextPreview.textContent = cbMode ? String(nextS) : '';
    
    // Update current drop element
    currentDropEl.style.background = colorForSize(s);
    currentDropEl.style.width = currentDropEl.style.height = Math.max(28, radiusForSize(s)*1.5) + 'px';
    currentDropEl.textContent = cbMode ? String(s) : '';
    
    // Update checkboxes to match state
    if(typeof cbModeCheckbox !== 'undefined') cbModeCheckbox.checked = cbMode;
    if(typeof cbModeSettings !== 'undefined') cbModeSettings.checked = cbMode;
    if(typeof soundToggle !== 'undefined') soundToggle.checked = soundEnabled;
  }
  function renderDropOrderPreview(){
    dropOrderPreview.innerHTML = '';
  for(let s=1;s<=MAX_SIZE;s++){
      const el = document.createElement('div');
      el.className = 'orderItem';
      el.style.background = colorForSize(s);
      el.textContent = cbMode ? String(s) : '';
      dropOrderPreview.appendChild(el);
    }
  }

  // --- Initialization ---
  function init(){
  fitCanvas();
  drops = [];
  score = 0;
  // Load settings from localStorage on init
  cbMode = localStorage.getItem('cw_cbMode') === 'true';
  soundEnabled = localStorage.getItem('cw_soundEnabled') !== 'false';
  currentDropSize = randWeightedSize();
  nextDropSize = randWeightedSize();
  updateScoreUI();
  updatePreviewUI();
  renderDropOrderPreview();
  renderJerry();
  // Sync checkboxes to stored settings
  if(typeof cbModeCheckbox !== 'undefined') cbModeCheckbox.checked = cbMode;
  if(typeof cbModeSettings !== 'undefined') cbModeSettings.checked = cbMode;
  if(typeof soundToggle !== 'undefined') soundToggle.checked = soundEnabled;
  titleModal.style.display = 'flex';
  settingsModal.classList.add('hidden');
  gameOverModal.classList.add('hidden');
  pauseOverlay.style.display = 'none';
  running = false;
  paused = false;
  }

  function fitCanvas(){
    // keep internal resolution fixed but adjust well DOM
    W = canvas.width; H = canvas.height;
    well = { x: W*0.20, y: 10, width: W*0.60, height: H-20 };
    wellBox.style.left = (well.x / W * 100) + '%';
    wellBox.style.right = ((W - (well.x + well.width))/W * 100) + '%';
    wellBox.style.top = well.y + 'px';
    wellBox.style.bottom = (H - (well.y + well.height)) + 'px';
  // Constrain jerryX so the jerrycan stays fully inside the well
  const jerryHalf = 56/2;
  jerryX = Math.max(well.x + jerryHalf, Math.min(well.x + well.width - jerryHalf, jerryX));
  jerryTargetX = jerryX;
    addBoundaries();
  }

  function renderJerry(){
    // Use the jerry-can-UD.png image instead of SVG
    jerryEl.innerHTML = '';
    const size = 56;
    const img = document.createElement('img');
    img.src = 'img/jerry-can-UD.png';
    img.alt = 'Jerrycan';
  img.style.display = 'block';
  img.style.maxWidth = size + 'px';
  img.style.height = 'auto';
  img.style.marginBottom = '6px'; // slight bottom margin for spacing
    jerryEl.appendChild(img);
    jerryEl.style.left = (jerryX - size/2) + 'px';
  }

  // --- Game actions ---
  function startGame(){
    titleModal.style.display = 'none';
    settingsModal.classList.add('hidden');
    gameOverModal.classList.add('hidden');
    running = true;
    paused = false;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function placeDropAt(x){
    if(paused || !running) return;
  // Constrain within well bounds using the current drop's radius
  const radius = radiusForSize(currentDropSize);
  const minx = well.x + radius;
  const maxx = well.x + well.width - radius;
  x = Math.max(minx, Math.min(maxx, x));
  // Spawn balls above the wellBox, matching the new jerrycan position
    const spawnY = 8 + 56/2; // jerrycan top + half its height
    const body = createDrop(currentDropSize, x, spawnY);
    dropBodies.push(body);
    playPlaceSound();
    // move queue
    currentDropSize = nextDropSize;
    nextDropSize = randWeightedSize();
    updatePreviewUI();
  }

  function restartGame(fullReset=true){
    // Remove all drops from the physics world and clear dropBodies
    if (dropBodies && dropBodies.length) {
      for (const body of dropBodies) {
        World.remove(world, body);
      }
    }
    dropBodies = [];
    score = 0;
    // Reset the drop bag for a fresh shuffle
    refillDropBag();
    currentDropSize = randWeightedSize();
    nextDropSize = randWeightedSize();
    updateScoreUI();
    updatePreviewUI();
    renderDropOrderPreview();
    paused = false;
    pauseOverlay.style.display = 'none';
    gameOverModal.classList.add('hidden');
    if(fullReset){
      // reset highscore left intact
    }
  }

  function endGame(){
    running = false;
    gameOverModal.classList.remove('hidden');
    finalScoreEl.textContent = score;
    if(score > highScore){ highScore = score; localStorage.setItem('cw_highscore', String(highScore)); }
    updateScoreUI();
  }

  // --- Physics & collision ---
  function step(){
    // Use Matter.js to update physics
    Engine.update(engine, 1000/60);

    // Merge logic: if two balls of the same type touch, combine them
    for(let i=0;i<dropBodies.length;i++){
      for(let j=i+1;j<dropBodies.length;j++){
        const A = dropBodies[i], B = dropBodies[j];
        const dx = B.position.x - A.position.x, dy = B.position.y - A.position.y;
        const dist = Math.hypot(dx,dy);
        const minDist = A.radius + B.radius;
  const MERGE_THRESHOLD = 1; // merge as soon as balls touch
        if(A.size === B.size && dist < minDist * MERGE_THRESHOLD){
          // Merge A and B into a new drop
          const newSize = Math.min(A.size+1, MAX_SIZE);
          const newX = (A.position.x + B.position.x)/2;
          const newY = (A.position.y + B.position.y)/2;
          const newDrop = createDrop(newSize, newX, newY);
          World.remove(world, A);
          World.remove(world, B);
          dropBodies.splice(j,1);
          dropBodies.splice(i,1);
          dropBodies.push(newDrop);
          score += scoreForNewDrop(newSize);
          playMergeSound();
          updateScoreUI();
            // Win condition: if a drop of size 9 is created, show win modal and confetti
            if(newSize === 9){
              setTimeout(()=>{
                const winModal = document.getElementById('winModal');
                if(winModal) winModal.classList.remove('hidden');
                if(window.showConfetti) window.showConfetti();
              }, 600); // delay for effect
            }
          break;
        }
      }
    }

    // Track drops above the upper bound for game over
    if(!step.dropTimers) step.dropTimers = {};
    for(let body of dropBodies){
      if(body.position.y - body.radius < well.y + 2){
        if(!step.dropTimers[body.id]) step.dropTimers[body.id] = 0;
        step.dropTimers[body.id] += 1/60;
    if(step.dropTimers[body.id] >= 1.5){
          endGame();
          break;
        }
      } else {
        step.dropTimers[body.id] = 0;
      }
    }
    // Clean up timers for drops that no longer exist
    for(const id in step.dropTimers){
      if(!dropBodies.some(b => b.id === id)){
        delete step.dropTimers[id];
      }
    }
  }

  // --- Rendering ---
  function render(){
    ctx.clearRect(0,0,W,H);
    // draw drops using Matter.js positions
    // sort by y for painter's order
    const sorted = dropBodies.slice().sort((a,b)=>a.position.y-b.position.y);
    for(let d of sorted){
      // shadow
      ctx.beginPath();
      ctx.ellipse(d.position.x, d.position.y + d.radius*0.4, d.radius*0.95, d.radius*0.45, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fill();

      // main circle
      ctx.beginPath();
      ctx.arc(d.position.x, d.position.y, d.radius, 0, Math.PI*2);
      ctx.fillStyle = d.color;
      ctx.fill();

      // gloss highlight
      ctx.beginPath();
      ctx.ellipse(d.position.x - d.radius*0.28, d.position.y - d.radius*0.36, d.radius*0.42, d.radius*0.62, -0.5, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fill();

      // color-blind number or label if active
      if(cbMode){
        ctx.fillStyle = '#fff';
        ctx.font = (d.radius*0.9|0) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(d.size), d.position.x, d.position.y);
      }
    }



  // update DOM jerry position
  jerryEl.style.left = (jerryX - 56) + 'px';
  // update current drop position to follow jerrycan
  const dropSize = Math.max(28, radiusForSize(currentDropSize)*1.5);
  currentDropEl.style.left = (jerryX - dropSize) + 'px';
  }

  // --- Main loop ---
  function loop(){
    if(!running) return;
    if(paused){ requestAnimationFrame(loop); return; }
    // smooth jerry movement toward target
    const dx = jerryTargetX - jerryX;
    jerryX += dx * Math.min(1, 0.18);
    step();
    render();
    requestAnimationFrame(loop);
  }

  // --- Input handling ---
  // mouse move over canvas -> move jerry target X
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const jerryHalf = 56/2;
    jerryTargetX = Math.max(well.x + jerryHalf, Math.min(well.x + well.width - jerryHalf, x));
  });
  // touch move
  canvas.addEventListener('touchmove', (ev) => {
    ev.preventDefault();
    const t = ev.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = ((t.clientX - rect.left) / rect.width) * W;
    const jerryHalf = 56/2;
    jerryTargetX = Math.max(well.x + jerryHalf, Math.min(well.x + well.width - jerryHalf, x));
  }, { passive:false });

  // click to drop (only if within well area visually)
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    // check if clicked inside well area (use well box)
    if(x >= well.x && x <= well.x + well.width && y >= well.y && y <= well.y + well.height + 40){
      placeDropAt(x);
    } else {
      // allow clicking above well near jerry to drop too
      placeDropAt(jerryX);
    }
  });

  // keyboard controls
  window.addEventListener('keydown', (e) => {
    if(!running && e.key === ' '){ startGame(); return; }
    if(e.key === 'ArrowLeft'){ jerryTargetX -= 18; }
    if(e.key === 'ArrowRight'){ jerryTargetX += 18; }
    if(e.key === ' ' || e.key === 'Enter'){ placeDropAt(jerryX); }
    if(e.key === 'p'){ togglePause(); }
  });

  // settings & controls
  settingsBtn.addEventListener('click', ()=>{ settingsModal.classList.remove('hidden'); settingsModal.style.display='flex'; });
  closeSettings.addEventListener('click', closeSettingsFn);
  closeSettingsBtn.addEventListener('click', closeSettingsFn);
  function closeSettingsFn(){
    settingsModal.classList.add('hidden');
    settingsModal.style.display='none';
  }

  startBtn.addEventListener('click', ()=>{
  cbMode = cbModeCheckbox.checked;
  localStorage.setItem('cw_cbMode', cbMode);
  cbModeSettings.checked = cbMode;
  updatePreviewUI();
  renderDropOrderPreview();
  startGame();
  });
  cbModeSettings.addEventListener('change', ()=>{
  cbMode = cbModeSettings.checked;
  localStorage.setItem('cw_cbMode', cbMode);
  cbModeCheckbox.checked = cbMode;
  updatePreviewUI();
  renderDropOrderPreview();
  });
  cbModeCheckbox.addEventListener('change', ()=>{
  cbMode = cbModeCheckbox.checked;
  localStorage.setItem('cw_cbMode', cbMode);
  cbModeSettings.checked = cbMode;
  updatePreviewUI();
  renderDropOrderPreview();
  });

  soundToggle.addEventListener('change', ()=>{
  soundEnabled = soundToggle.checked;
  localStorage.setItem('cw_soundEnabled', soundEnabled);
  });

  restartBtn.addEventListener('click', ()=>{ restartGame(true); });

  goHomeBtn.addEventListener('click', ()=>{
  // Home button: fully reset game, close game over modal, and show instructions
  restartGame(true);
  gameOverModal.classList.add('hidden');
  titleModal.style.display = 'flex';
  });
  restartGameBtn.addEventListener('click', ()=>{
  // Restart button: same as top-right restart: fully reset and start new game
  restartGame(true);
  startGame();
  });

  if(winHomeBtn) winHomeBtn.addEventListener('click', () => {
    // Home: clear board, reset drop order, close win modal, show instructions
    const winModal = document.getElementById('winModal');
    restartGame(true); // full reset: clears board, resets drop order
    if(winModal) winModal.classList.add('hidden');
    titleModal.style.display = 'flex';
  });
  if(winRestartBtn) winRestartBtn.addEventListener('click', () => {
    // Restart: clear board, reset drop order, close win modal, start new game
    const winModal = document.getElementById('winModal');
    restartGame(true); // full reset: clears board, resets drop order
    if(winModal) winModal.classList.add('hidden');
    startGame();
  });

  // pause toggle (simple)
  function togglePause(){
    paused = !paused;
    pauseOverlay.style.display = paused ? 'flex' : 'none';
    if(!paused) { lastTime = performance.now(); }
  }
  // easy pause from UI
  pauseOverlay.addEventListener('click', togglePause);

  // place sound play
  function playPlaceSound(){
    if(!audioCtx || !soundEnabled) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 160; g.gain.value = 0.001;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.03, now+0.02);
    o.start(now); o.stop(now+0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.12);
  }

  // small helper so clicking settings when audio not interacted will not block on browser autoplay
  document.addEventListener('click', () => {
    if(audioCtx && audioCtx.state === 'suspended') { audioCtx.resume(); }
  }, { once:true });

  // finally, initialize UI
  updateScoreUI();
  updatePreviewUI();
  renderDropOrderPreview();
  init();

  // expose some debug on window (optional)
  window._charityDrops = { restartGame, startGame, placeDropAt };
})();
