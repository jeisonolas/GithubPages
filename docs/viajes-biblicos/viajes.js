// Motor compartido de los mapas. Cada página define antes CFG (mapa y textos) y VIAJES (etapas y paradas).
// Una parada puede llevar fx: 'noche' | 'tormenta' | 'lluvia' | 'tinieblas' | 'amanecer' | 'gloria'.

// ---------- Decorado ----------
document.body.insertAdjacentHTML('beforeend', `
<div id="fx"><i class="noche"></i><i class="tinieblas"></i><i class="amanecer"></i><i class="gloria"></i><i class="lluvia"></i><i class="rayo"></i></div>
<div id="vin"></div>
<div id="titulo"></div>
<svg id="rosa" viewBox="0 0 100 100"><circle cx="50" cy="52" r="42" fill="#f6ecd6" opacity=".78"/>
  <g fill="none" stroke="#3b2a17" stroke-width="1.2"><circle cx="50" cy="52" r="33"/><circle cx="50" cy="52" r="28" stroke-dasharray="1 3"/></g>
  <g stroke="#3b2a17" stroke-width=".8"><path d="M50 16 56 52 50 88 44 52Z" fill="#f6ecd6"/><path d="M50 16 50 88 44 52Z" fill="#8a3b12"/>
  <path d="M14 52 50 46 86 52 50 58Z" fill="#f6ecd6"/><path d="M14 52 86 52 50 58Z" fill="#8a3b12"/></g>
  <text x="50" y="14" text-anchor="middle" font-size="10" font-family="Georgia" fill="#3b2a17">N</text></svg>`);

const SVG = {
  barco:`<svg viewBox="0 0 48 48"><path d="M5 31h38l-6 10H11z" fill="#6b3a17" stroke="#2b1a0c" stroke-width="1.5"/><path d="M24 5v26" stroke="#2b1a0c" stroke-width="2"/><path d="M26 8c9 4 13 11 13 20H26z" fill="#f4e6c3" stroke="#2b1a0c" stroke-width="1.2"/><path d="M22 12c-6 3-9 9-10 16h10z" fill="#e3cf9f" stroke="#2b1a0c" stroke-width="1.2"/><path d="M24 5l8 2-8 2z" fill="#a5341c"/></svg>`,
  caminante:`<svg viewBox="0 0 48 48"><circle cx="22" cy="10" r="5" fill="#e8c9a0" stroke="#2b1a0c" stroke-width="1.2"/><path d="M14 43l4-25c1-3 7-3 8 0l5 25z" fill="#a8703a" stroke="#2b1a0c" stroke-width="1.2"/><path d="M36 13v30" stroke="#4a2c12" stroke-width="2.4" stroke-linecap="round"/><path d="M26 23l10 2" stroke="#a8703a" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  huellas:`<svg viewBox="0 0 48 48"><g fill="#f6ecd6" stroke="#2b1a0c" stroke-width="1.6"><ellipse cx="17" cy="30" rx="6" ry="10" transform="rotate(-12 17 30)"/><ellipse cx="32" cy="18" rx="6" ry="10" transform="rotate(12 32 18)"/></g></svg>`
};

// ---------- Sonido (sintetizado con Web Audio; apagado hasta que se pulse el botón) ----------
const Snd = {
  on: localStorage.vbSonido === '1', ctx:null, quiero:null, suena:null, nodos:[], reloj:null,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    this.ctx = new C();
    const n = this.ctx.sampleRate*2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let k=0;k<n;k++) d[k] = Math.random()*2-1;
    this.ruido = b;
    this.out = this.ctx.createGain(); this.out.gain.value = .55; this.out.connect(this.ctx.destination);
  },
  listo() { return this.on && this.ctx; },
  // ruido filtrado en bucle; vaiven > 0 lo hace subir y bajar como olas o rachas
  capa(tipo, frec, vol, vaiven, ritmo) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.ruido; s.loop = true; f.type = tipo; f.frequency.value = frec; g.gain.value = 0;
    s.connect(f).connect(g).connect(this.out); s.start();
    g.gain.setTargetAtTime(vol, c.currentTime, .6);
    this.nodos.push({ s, g });
    if (vaiven) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = ritmo; og.gain.value = vaiven;
      o.connect(og).connect(g.gain); o.start(); this.nodos.push({ s:o }); }
  },
  ambiente(tipo) { this.quiero = tipo; this.aplicar(); },
  aplicar() {
    if (!this.listo() || this.quiero === this.suena) return;
    this.callar(); this.suena = this.quiero;
    if (this.suena === 'mar') this.capa('lowpass', 420, .5, .3, .13);
    if (this.suena === 'tormenta') { this.capa('highpass', 1800, .12); this.capa('bandpass', 380, .45, .3, .21); }
    if (this.suena === 'lluvia') this.capa('highpass', 1800, .1);
    if (this.suena === 'pasos') this.reloj = setInterval(() => this.golpe(220, .09, .5), 460);
  },
  callar() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this.nodos.forEach(n => { if (n.g) n.g.gain.setTargetAtTime(0, t, .25); n.s.stop(t+1.5); });
    this.nodos = []; clearInterval(this.reloj); this.suena = null;
  },
  tono(frec, dura, vol, forma, cuando) {
    if (!this.listo()) return;
    const c = this.ctx, t = c.currentTime + (cuando||0), o = c.createOscillator(), g = c.createGain();
    o.type = forma || 'sine'; o.frequency.value = frec;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t+dura);
    o.connect(g).connect(this.out); o.start(t); o.stop(t+dura);
  },
  golpe(frec, dura, vol, cuando) {
    if (!this.listo()) return;
    const c = this.ctx, t = c.currentTime + (cuando||0), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.ruido; s.loop = true; f.type = 'lowpass'; f.frequency.value = frec;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t+.03); g.gain.exponentialRampToValueAtTime(.0001, t+dura);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random()); s.stop(t+dura);
  },
  campana() { this.tono(660, 1.4, .22); this.tono(990, 1.1, .1); this.tono(1320, .8, .05); },
  acierto() { this.tono(523, .25, .2); this.tono(784, .55, .2, 'sine', .14); },
  fallo()   { this.tono(150, .4, .25, 'triangle'); },
  trueno()  { this.golpe(170, 2.4, .9, .25); },
  alternar() {
    this.on = !this.on; localStorage.vbSonido = this.on ? '1' : '0';
    if (this.on) { this.init(); this.aplicar(); this.campana(); } else if (this.ctx) this.callar();
  }
};
// Si quedó encendido de una visita anterior, el navegador exige un gesto antes de sonar.
['pointerdown','keydown'].forEach(ev => addEventListener(ev, () => { if (Snd.on) { Snd.init(); Snd.aplicar(); } }));

// ---------- Mapa ----------
const map = L.map('map', { minZoom:CFG.minZoom, maxZoom:CFG.maxZoom }).setView(VIAJES[0].paradas[0].ll, CFG.zoom);
L.tileLayer(CFG.tiles, { maxNativeZoom:CFG.maxNativeZoom, maxZoom:CFG.maxZoom, attribution:CFG.atribucion }).addTo(map);

const gBase = L.layerGroup().addTo(map), gLegs = L.layerGroup().addTo(map), gDots = L.layerGroup().addTo(map);
const icono = (mar, viaja, oeste) => L.divIcon({ className:`pablo ${mar?'mar':'anda'} ${viaja?'viaja':''}`,
  html:`<div style="transform:scaleX(${oeste?-1:1})">${mar ? SVG.barco : SVG[CFG.caminante||'caminante']}</div>`, iconSize:[42,42], iconAnchor:[21,24] });
const marker = L.marker(VIAJES[0].paradas[0].ll, { icon:icono(), zIndexOffset:1000, interactive:false }).addTo(map);

let v = 0, i = 0, anim = null, timer = null, rayos = null, puntos = 0;
const respondidas = {};
const totalQ = VIAJES.reduce((s,x)=>s+x.paradas.filter(p=>p.q).length,0);
const $ = id => document.getElementById(id);
const P = () => VIAJES[v].paradas;
const zoom = () => VIAJES[v].zoom || CFG.zoom;
const tramo = k => [P()[k-1].ll, ...(P()[k].via||[]), P()[k].ll];
const estilo = (k, tenue) => ({ color:VIAJES[v].color, weight:tenue?2:4, opacity:tenue?.45:.95, dashArray:P()[k].mar?'2 9':null,
  lineCap:'round', className:!tenue && P()[k].mar ? 'ola' : '' });
const pad = () => innerWidth>800 ? { paddingTopLeft:[50,90], paddingBottomRight:[420,50] }
                                 : { paddingTopLeft:[30,70], paddingBottomRight:[30,innerHeight*0.55] };

// Con el mapa sin tamaño (pestaña o panel oculto) flyToBounds lanza un error; ahí basta con centrar.
const volar = (b, o) => { const s = map.getSize(); if (s.x && s.y) map.flyToBounds(b, o); else map.setView(b.getCenter(), o.maxZoom-1); };

// Los efectos de noche y gloria se centran en el marcador.
function foco() { const pt = map.latLngToContainerPoint(marker.getLatLng());
  $('fx').style.setProperty('--x', pt.x+'px'); $('fx').style.setProperty('--y', pt.y+'px'); }
map.on('move zoom', foco);

function efecto(fx) {
  $('fx').className = fx || '';
  clearTimeout(rayos);
  if (fx === 'tormenta') (function rayo() {
    rayos = setTimeout(() => { const r = $('fx').querySelector('.rayo'); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
      Snd.trueno(); rayo(); }, 2500 + Math.random()*5500);
  })();
}
const ambienteDe = p => p.fx==='tormenta' ? 'tormenta' : p.fx==='lluvia' ? 'lluvia' : p.mar ? 'mar' : null;

function tabs() {
  $('top').innerHTML = `<a class="tab" href="./" title="Viajes bíblicos">←</a>`
    + VIAJES.map((x,k)=>`<button class="tab ${k===v?'on':''}" style="${k===v?'background:'+x.color:''}" data-k="${k}">${x.nombre}</button>`).join('')
    + `<span id="score">⭐ ${puntos} / ${totalQ*10}</span><button class="tab" id="snd" title="Sonido">${Snd.on?'🔊':'🔇'}</button>`;
  $('top').querySelectorAll('button[data-k]').forEach(b => b.onclick = () => ir(+b.dataset.k, 0, false));
  $('snd').onclick = () => { Snd.alternar(); tabs(); };
}

function dibujarPuntos(hasta) {
  gDots.clearLayers();
  const vistos = new Set();
  P().forEach((p,k) => {
    const visto = k<=hasta, c = VIAJES[v].color;
    if (k===hasta) L.circleMarker(p.ll, { radius:9, color:c, fill:false, className:'pulso', interactive:false }).addTo(gDots);
    const m = L.circleMarker(p.ll, { radius:k===hasta?8:5, color:'#2b1a0c', weight:1.5, fillColor:visto?c:'#f6ecd6', fillOpacity:1 }).addTo(gDots);
    m.on('click', () => ir(v,k,false));
    const lb = p.lb ?? p.n, key = p.ll.join();
    if (visto && lb && !vistos.has(key)) { vistos.add(key); m.bindTooltip(lb, { permanent:true, direction:'top', offset:[0,-6], className:'lbl' }); }
    else m.bindTooltip(p.n, { direction:'top', className:'lbl' });
  });
  $('dots').innerHTML = P().map((p,k)=>`<i class="${k===i?'cur':''}" title="${p.n}" data-k="${k}" style="${k<=hasta?'background:'+VIAJES[v].color+';border-color:'+VIAJES[v].color:''}"></i>`).join('');
  $('dots').querySelectorAll('i').forEach(d => d.onclick = () => ir(v,+d.dataset.k,false));
}

function ir(nv, ni, animar) {
  cancelAnimationFrame(anim); clearTimeout(timer);
  v = nv; i = ni;
  tabs();
  gBase.clearLayers(); gLegs.clearLayers();
  for (let k=1;k<P().length;k++) L.polyline(tramo(k), estilo(k,true)).addTo(gBase);
  const hechos = animar ? i-1 : i;
  for (let k=1;k<=hechos;k++) L.polyline(tramo(k), estilo(k)).addTo(gLegs);
  dibujarPuntos(hechos);
  botones(animar);
  const p = P()[i];
  efecto(p.fx);

  if (!animar || i===0) {
    marker.setLatLng(p.ll).setIcon(icono(i>0 && p.mar));
    Snd.ambiente(ambienteDe(i>0 ? p : {}));
    if (i===0) {
      const t = $('titulo'); t.innerHTML = `<b>${VIAJES[v].nombre}</b><span>${VIAJES[v].ref}</span>`;
      t.classList.remove('ver'); void t.offsetWidth; t.classList.add('ver');
      volar(L.latLngBounds(P().map(q=>q.ll)), { ...pad(), maxZoom:zoom()+1, duration:.9 });
    } else volar(L.latLngBounds([p.ll]), { ...pad(), maxZoom:zoom(), duration:.8 });
    tarjeta(); return;
  }

  const ruta = tramo(i), oeste = p.ll[1] < ruta[0][1];
  $('card').innerHTML = `<div class="travel"><span>${p.mar?SVG.barco:SVG[CFG.caminante||'caminante']}</span>${p.mar?'Navegando':'Caminando'} hacia<br><b>${p.n}</b>…</div>`;
  marker.setIcon(icono(p.mar, true, oeste));
  Snd.ambiente(p.fx==='tormenta' ? 'tormenta' : p.mar ? 'mar' : 'pasos');
  volar(L.latLngBounds(ruta), { ...pad(), maxZoom:zoom()+1, duration:.8 });
  const acum = [0]; for (let k=1;k<ruta.length;k++) acum.push(acum[k-1] + Math.hypot(ruta[k][0]-ruta[k-1][0], ruta[k][1]-ruta[k-1][1]));
  const largo = acum[acum.length-1], dur = Math.min(3600, Math.max(1400, 900 + largo*340));
  const linea = L.polyline([ruta[0]], estilo(i)).addTo(gLegs);
  timer = setTimeout(() => {
    const t0 = performance.now();
    (function paso(now) {
      const t = Math.min(1,(now-t0)/dur), d = (t<.5 ? 2*t*t : 1-(2-2*t)**2/2) * largo;
      let s = 1; while (s<ruta.length-1 && acum[s]<d) s++;
      const f = (d-acum[s-1])/((acum[s]-acum[s-1])||1);
      const pos = [ruta[s-1][0]+(ruta[s][0]-ruta[s-1][0])*f, ruta[s-1][1]+(ruta[s][1]-ruta[s-1][1])*f];
      linea.setLatLngs([...ruta.slice(0,s), pos]); marker.setLatLng(pos); foco();
      if (t<1) anim = requestAnimationFrame(paso);
      else { marker.setIcon(icono(p.mar, false, oeste)); dibujarPuntos(i); botones(false); tarjeta();
             Snd.ambiente(ambienteDe(p)); Snd.campana(); }
    })(t0);
  }, 850);
}

function tarjeta() {
  const V = VIAJES[v], p = P()[i], k = v+'-'+i;
  let h = `<span class="chip" style="background:${V.color}">${V.nombre} · ${V.anio}</span><span class="step">Parada ${i+1} de ${P().length}</span>
    <h2>${p.n}</h2><span class="ref">📖 ${p.ref}</span><h3>${p.t}</h3>`;
  if (i===0) h += `<div class="box intro"><b>${V.ref}</b>${V.resumen}${V.equipo?`<br><br><i>Compañeros:</i> ${V.equipo}.`:''}</div>`;
  h += `<p>${p.d}</p>`;
  if (p.ig) h += `<div class="box ig"><b>${CFG.etiquetaIg}</b>${p.ig}</div>`;
  if (p.dato) h += `<div class="box"><b>📜 Dato</b>${p.dato}</div>`;
  if (p.q) h += `<div class="quiz"><div class="q">❓ ${p.q.p}</div>${p.q.o.map((o,n)=>`<button data-n="${n}">${o}</button>`).join('')}<div class="res"></div></div>`;
  if (v===VIAJES.length-1 && i===P().length-1)
    h += `<div class="box intro"><b>Fin del recorrido</b>${CFG.fin} Tu puntuación: <span id="fin">${puntos}</span> de ${totalQ*10}.</div>`;
  $('card').innerHTML = `<div class="entra">${h}</div>`; $('card').scrollTop = 0;
  if (p.q) {
    const bs = [...$('card').querySelectorAll('.quiz button')], res = $('card').querySelector('.res');
    const pintar = n => { bs.forEach(b=>b.disabled=true); bs[p.q.r].classList.add('ok'); if (n!==p.q.r) bs[n].classList.add('bad');
      res.textContent = n===p.q.r ? '¡Correcto! +10' : 'No. La respuesta correcta está marcada en verde.'; };
    if (k in respondidas) pintar(respondidas[k]);
    bs.forEach(b => b.onclick = () => { const n=+b.dataset.n; respondidas[k]=n;
      if (n===p.q.r) { puntos+=10; Snd.acierto(); } else Snd.fallo();
      pintar(n); tabs(); const f=$('fin'); if (f) f.textContent=puntos; });
  }
}

function botones(viajando) {
  const ult = i===P().length-1, fin = ult && v===VIAJES.length-1;
  $('prev').disabled = viajando || (i===0 && v===0);
  $('next').disabled = viajando;
  $('next').textContent = fin ? '↺ Volver a empezar' : ult ? `Seguir: ${VIAJES[v+1].nombre} →` : i===0 ? 'Comenzar →' : 'Siguiente parada →';
}
function siguiente() { if ($('next').disabled) return;
  const ult = i===P().length-1;
  if (ult) ir(v===VIAJES.length-1 ? 0 : v+1, 0, false); else ir(v, i+1, true); }
function anterior() { if ($('prev').disabled) return;
  if (i>0) ir(v, i-1, false); else ir(v-1, VIAJES[v-1].paradas.length-1, false); }
$('next').onclick = siguiente; $('prev').onclick = anterior;
addEventListener('keydown', e => { if (e.key==='ArrowRight') siguiente(); if (e.key==='ArrowLeft') anterior(); });

ir(0,0,false);
