const w=document.getElementById("warning"),a=document.getElementById("ambience"),enter=document.getElementById("enter");
function playGlitchSound(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx)return;
  try{
    const ctx=new AudioCtx(),now=ctx.currentTime,master=ctx.createGain();
    master.gain.value=.32;master.connect(ctx.destination);
    const tone=ctx.createOscillator(),toneGain=ctx.createGain();
    tone.type="square";tone.frequency.setValueAtTime(760,now);tone.frequency.exponentialRampToValueAtTime(105,now+.2);
    toneGain.gain.setValueAtTime(.0001,now);toneGain.gain.linearRampToValueAtTime(.075,now+.012);toneGain.gain.exponentialRampToValueAtTime(.0001,now+.22);
    tone.connect(toneGain);toneGain.connect(master);tone.start(now);tone.stop(now+.23);
    const frames=Math.floor(ctx.sampleRate*.19),buffer=ctx.createBuffer(1,frames,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<frames;i++)data[i]=(Math.random()*2-1)*(1-i/frames);
    const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),noiseGain=ctx.createGain();
    noise.buffer=buffer;filter.type="highpass";filter.frequency.value=1300;noiseGain.gain.setValueAtTime(.0001,now);noiseGain.gain.linearRampToValueAtTime(.12,now+.01);noiseGain.gain.exponentialRampToValueAtTime(.0001,now+.19);
    noise.connect(filter);filter.connect(noiseGain);noiseGain.connect(master);noise.start(now);noise.stop(now+.2);
    setTimeout(()=>ctx.close().catch(()=>{}),400);
  }catch(error){/* Sound is an enhancement; keep the entrance working if audio is unavailable. */}
}
enter.onclick=()=>{if(w.classList.contains("is-leaving"))return;enter.disabled=true;playGlitchSound();w.classList.add("is-leaving");setTimeout(()=>w.remove(),900);a.volume=.2;a.play().catch(()=>{})};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("on"));document.querySelectorAll(".panel").forEach(x=>x.classList.remove("on"));b.classList.add("on");document.getElementById(b.dataset.tab).classList.add("on")});
const box=document.getElementById("lightbox"),big=document.getElementById("big");let imgs=[],pos=0;function refresh(){imgs=[...document.querySelector(".panel.on").querySelectorAll(".gallery img")]}function open(i){refresh();if(!imgs.length)return;pos=(i+imgs.length)%imgs.length;big.src=imgs[pos].src;box.classList.add("on")}document.querySelectorAll(".gallery img").forEach(im=>im.onclick=()=>open([...document.querySelector(".panel.on").querySelectorAll(".gallery img")].indexOf(im)));document.getElementById("close").onclick=()=>box.classList.remove("on");document.getElementById("prev").onclick=()=>open(pos-1);document.getElementById("next").onclick=()=>open(pos+1);document.onkeydown=e=>{if(e.key=="Escape")box.classList.remove("on");if(e.key=="ArrowLeft")open(pos-1);if(e.key=="ArrowRight")open(pos+1)};
// Glitch typography: preserve real word spacing and the hero's original line break.
function makeGlitch(el){
  if(!el || el.dataset.glitched) return;
  el.dataset.glitched='1';
  el.classList.add('glitch-text');
  if(el.matches('.hero h1')) return; // Keep the original <br> and <em> structure.
  const raw=el.textContent.replace(/\s+/g,' ').trim();
  el.dataset.text=raw;
  el.setAttribute('aria-label',raw);
  el.textContent='';
  const words=raw.split(' ');
  words.forEach((word,wi)=>{
    const w=document.createElement('span');
    w.className='glitch-word';
    [...word].forEach((ch,i)=>{
      const c=document.createElement('span');
      c.className='char';
      c.style.setProperty('--i',i);
      c.textContent=ch;
      w.appendChild(c);
    });
    el.appendChild(w);
    if(wi<words.length-1) el.appendChild(document.createTextNode(' '));
  });
  const len=raw.length;
  if(el.matches('.panel h2')) el.classList.add(len>48?'title-long':len>30?'title-medium':'title-short');
  if(el.matches('.tab')) el.classList.add(len>48?'tab-long':len>32?'tab-medium':'tab-short');
}
[...document.querySelectorAll('.profile h2,.index h2,.panel h2,.tab,.hero h1')].forEach(makeGlitch);
