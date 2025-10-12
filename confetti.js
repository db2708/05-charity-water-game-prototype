/* Simple confetti effect for winning screen */
function showConfetti() {
  const confettiContainer = document.createElement('div');
  confettiContainer.id = 'confettiContainer';
  confettiContainer.style.position = 'fixed';
  confettiContainer.style.left = '0';
  confettiContainer.style.top = '0';
  confettiContainer.style.width = '100vw';
  confettiContainer.style.height = '100vh';
  confettiContainer.style.pointerEvents = 'none';
  confettiContainer.style.zIndex = '100';
  document.body.appendChild(confettiContainer);

  // Create 60 confetti pieces
  for(let i=0;i<60;i++){
    const conf = document.createElement('div');
    conf.className = 'confetti';
    conf.style.position = 'absolute';
    conf.style.width = '10px';
    conf.style.height = '18px';
    conf.style.background = `hsl(${Math.random()*360},90%,60%)`;
    conf.style.left = Math.random()*100 + 'vw';
    conf.style.top = '-30px';
    conf.style.borderRadius = '3px';
    conf.style.opacity = '0.85';
    confettiContainer.appendChild(conf);
    // Animate falling
    const duration = 1200 + Math.random()*1200;
    conf.animate([
      { transform: `translateY(0) rotate(0deg)` },
      { transform: `translateY(${80+Math.random()*60}vh) rotate(${Math.random()*360}deg)` }
    ], {
      duration,
      easing: 'ease-in',
      fill: 'forwards'
    });
    setTimeout(()=>{ conf.remove(); }, duration+400);
  }
  // Remove container after 2.5s
  setTimeout(()=>{ confettiContainer.remove(); }, 2500);
}

window.showConfetti = showConfetti;
