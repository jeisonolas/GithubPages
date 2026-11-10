// Motor compartido de los mapas. Cada página define antes CFG (mapa y textos) y VIAJES (etapas y paradas).
// Una parada puede llevar fx: 'noche' | 'tormenta' | 'lluvia' | 'tinieblas' | 'amanecer' | 'gloria',
// r (región, si la más cercana no es la correcta; '' para ninguna) y dur (duración del trayecto, si se conoce).
// Opcionales: REGIONES (rótulos del mapa con su ficha) y HOY (nombre actual de cada lugar, por nombre de parada).
const REG = typeof REGIONES !== 'undefined' ? REGIONES : [], ACTUAL = typeof HOY !== 'undefined' ? HOY : {};
if (CFG.tema) document.body.classList.add(CFG.tema);

// ---------- Decorado ----------
document.body.insertAdjacentHTML('beforeend', `
<div id="fx"><i class="noche"></i><i class="tinieblas"></i><i class="amanecer"></i><i class="gloria"></i><i class="lluvia"></i><i class="rayo"></i></div>
<div id="vin"></div>
<div id="titulo"></div>
<svg id="rosa" viewBox="0 0 100 100"><circle cx="50" cy="52" r="42" fill="#f6ecd6" opacity=".78"/>
  <g fill="none" stroke="#3b2a17" stroke-width="1.2"><circle cx="50" cy="52" r="33"/><circle cx="50" cy="52" r="28" stroke-dasharray="1 3"/></g>
  <g stroke="#3b2a17" stroke-width=".8"><path d="M50 16 56 52 50 88 44 52Z" fill="#f6ecd6"/><path d="M50 16 50 88 44 52Z" fill="#8a3b12"/>
  <path d="M14 52 50 46 86 52 50 58Z" fill="#f6ecd6"/><path d="M14 52 86 52 50 58Z" fill="#8a3b12"/></g>
  <text x="50" y="14" text-anchor="middle" font-size="10" font-family="Georgia" fill="#3b2a17">N</text></svg>
<div id="leyenda"><span><i class="tierra"></i>a pie</span><span><i class="mar"></i>por mar</span>
  <span><i class="punto"></i>visitada</span><span><i class="punto no"></i>por visitar</span><span><b>REGIÓN</b> tócala</span></div>
<div id="ayuda" hidden><div class="hoja">
  <h2>Cómo se juega</h2>
  <ul>
    <li><b>Avanza</b> con «Siguiente parada» o con las flechas ← → del teclado, y sigue el viaje en el mapa.</li>
    <li><b>Abre tu Biblia</b> en el pasaje de cada parada 📖: la tarjeta resume lo que pasó allí.</li>
    <li><b>Responde</b> las preguntas ❓ para ganar estrellas ⭐.</li>
    <li><b>Toca los nombres en MAYÚSCULAS</b> del mapa para saber qué era cada región, cómo se llama hoy y qué paradas hay en ella.</li>
    <li><b>Toca un punto</b> del mapa o de la barra de progreso para saltar a esa parada. Arriba cambias de etapa.</li>
    <li><b>🔇</b> enciende el sonido y <b>?</b> vuelve a abrir esta ayuda.</li>
  </ul>
  <button id="cerrarAyuda">¡A viajar!</button></div></div>`);
const $ayuda = () => document.getElementById('ayuda');
document.getElementById('cerrarAyuda').onclick = () => { $ayuda().hidden = true; localStorage.vbAyuda = '1'; };
if (!localStorage.vbAyuda) $ayuda().hidden = false;

const SVG = {
  barco:`<svg viewBox="0 0 64 64"><path d="M2 55q5-3.5 10 0t10 0 10 0 10 0 10 0 10 0" stroke="#eaf4fa" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M6 41h48q-1 8-10 10H17Q8 50 6 41z" fill="#7a4a22" stroke="#2b1a0c" stroke-width="1.4"/><path d="M8.5 45.5h44" stroke="#4a2c12"/><path d="M6 41q-4-3-3-9" stroke="#2b1a0c" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M30 41V7" stroke="#2b1a0c" stroke-width="2.2"/><path d="M17 11h26q3 12-1 25H18q-4-13-1-25z" fill="#f2e3bd" stroke="#2b1a0c" stroke-width="1.2"/>
    <path d="M17.4 19.5h25.4M17.5 27.5h25.6" stroke="#a5341c" stroke-width="2.6"/><path d="M50 41l8-15" stroke="#2b1a0c" stroke-width="1.6"/><path d="M53 26.5l5.4-.7-2.3 8.8z" fill="#e3cf9f" stroke="#2b1a0c" stroke-width=".9"/>
    <path d="M30 7l8 2.2-8 2.2z" fill="#a5341c"/><circle cx="24" cy="38.5" r="2.2" fill="#d9a77a" stroke="#2b1a0c" stroke-width=".7"/></svg>`,
  // Pablo de perfil: calvo y con barba como en la iconografía antigua, túnica, manto, bastón y zurrón.
  pablo:`<svg viewBox="0 0 64 64"><ellipse cx="31" cy="60.5" rx="15" ry="2.4" fill="#000" opacity=".28"/>
    <g class="p2"><path d="M27 44l-2 13" stroke="#9a6a3e" stroke-width="4" stroke-linecap="round"/><path d="M22.5 58h7" stroke="#3b2410" stroke-width="3" stroke-linecap="round"/></g>
    <g class="p1"><path d="M34 45l2 12" stroke="#b07a4a" stroke-width="4" stroke-linecap="round"/><path d="M34 58h7.5" stroke="#3b2410" stroke-width="3" stroke-linecap="round"/></g>
    <path d="M47.5 11L44 61" stroke="#4a2c12" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M21 26l13 13" stroke="#5a3a1a" stroke-width="1.8"/><rect x="13" y="37" width="10" height="9" rx="2.5" fill="#7a5530" stroke="#2b1a0c"/><path d="M13 40h10" stroke="#5a3a1a"/>
    <path d="M23 23q8-4 15 0l4 27q-11 3.5-23 0z" fill="#d1ad76" stroke="#2b1a0c" stroke-width="1.2"/>
    <path d="M23 23q5-2 10-.5l2.5 11.5-8 15q-5 .5-8.5 1z" fill="#8a2f1c" stroke="#2b1a0c" stroke-width="1.2"/>
    <path d="M25 37q8 2.4 15.3-.8" stroke="#3b2410" stroke-width="2.2" fill="none"/>
    <g class="br"><path d="M35 25q4 6 10 6.5" stroke="#2b1a0c" stroke-width="6.6" stroke-linecap="round" fill="none" opacity=".35"/><path d="M35 25q4 6 10 6.5" stroke="#d1ad76" stroke-width="5" stroke-linecap="round" fill="none"/>
      <circle cx="45.8" cy="31.4" r="2.6" fill="#d9a77a" stroke="#2b1a0c" stroke-width=".8"/></g>
    <path d="M29 19.5l1 4h5l1-4z" fill="#d9a77a"/>
    <circle cx="32.5" cy="13.5" r="7.2" fill="#d9a77a" stroke="#2b1a0c"/>
    <path d="M25.6 11.5q-1 7 3 9.2l1.4-5.6q-1.6-1.4-1.8-3.8z" fill="#5a4030"/>
    <path d="M30.4 16.4q1 9.6 9.6 2.2-1.6-2.2-3.2-1.2-2.4.4-6.4-1z" fill="#5a4030"/>
    <circle cx="36.4" cy="12" r=".95" fill="#2b1a0c"/><path d="M34.8 9.9l3-.5" stroke="#5a4030" stroke-width=".9" stroke-linecap="round"/>
    <path d="M39.4 12.3l1.7 2.6-1.8.5" fill="#d9a77a" stroke="#2b1a0c" stroke-width=".7" stroke-linejoin="round"/></svg>`,
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
const figura = mar => mar ? SVG.barco : SVG[CFG.caminante||'pablo'];
const icono = (mar, viaja, oeste) => { const t = mar ? 54 : 58;
  return L.divIcon({ className:`pablo ${mar?'mar':'anda'} ${viaja?'viaja':''}`,
    html:`<div style="transform:scaleX(${oeste?-1:1})">${figura(mar)}</div>`, iconSize:[t,t], iconAnchor:[t/2, t-5] }); };
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
// ---------- Regiones, distancias y duración ----------
map.createPane('regiones').style.zIndex = 350;   // por debajo de rutas y paradas
const fmt = n => n < 10 ? n.toFixed(1).replace('.', ',') : Math.round(n).toLocaleString('es');
function kmDe(ruta) {
  const R = Math.PI/180; let s = 0;
  for (let k=1;k<ruta.length;k++) { const [a1,o1] = ruta[k-1], [a2,o2] = ruta[k];
    const h = Math.sin((a2-a1)*R/2)**2 + Math.cos(a1*R)*Math.cos(a2*R)*Math.sin((o2-o1)*R/2)**2;
    s += 12742*Math.asin(Math.sqrt(h)); }
  return s;
}
// A pie unos 25 km al día; en barco, con escalas y vientos, unos 90.
function duracion(p, km) {
  if (p.dur) return p.dur;
  if (!p.mar && km < 4) return `unos ${Math.max(5, Math.round(km*12/5)*5)} minutos a pie`;
  const d = km / (p.mar ? 90 : 25);
  if (d < 1) return p.mar ? 'menos de un día de navegación' : 'menos de un día a pie';
  const n = Math.round(d); return `unos ${n} día${n>1?'s':''} ${p.mar ? 'de navegación' : 'a pie'}`;
}
const regionCache = new Map();
function regionDe(p) {
  if (p.r !== undefined) return p.r;
  if (!regionCache.has(p)) { let mejor = '', dmin = Infinity;
    REG.forEach(R => { if ((R.tipo||'r') !== 'r') return;
      const dy = R.ll[0]-p.ll[0], dx = (R.ll[1]-p.ll[1])*Math.cos(p.ll[0]*Math.PI/180), d = dx*dx+dy*dy;
      if (d < dmin) { dmin = d; mejor = R.n; } });
    regionCache.set(p, mejor); }
  return regionCache.get(p);
}
function fichaRegion(R) {
  const vistos = new Set(), lista = [];
  if ((R.tipo||'r') === 'r') VIAJES.forEach((V,a) => V.paradas.forEach((p,b) => {
    const nom = p.lb || p.n;
    if (regionDe(p) === R.n && !vistos.has(nom)) { vistos.add(nom); lista.push(`<button data-a="${a}" data-b="${b}" style="border-color:${V.color}">${nom}</button>`); } }));
  const div = document.createElement('div');
  div.innerHTML = `<h4>${R.n}</h4>${R.hoy?`<div class="hoy">🌍 Hoy: ${R.hoy}</div>`:''}<p>${R.d}</p>`
    + (R.refs ? `<div class="refs">📖 ${R.refs}</div>` : '')
    + (lista.length ? `<div class="lista"><b>Paradas en esta región</b>${lista.slice(0,14).join('')}${lista.length>14?` <i>y ${lista.length-14} más</i>`:''}</div>` : '');
  div.querySelectorAll('button').forEach(b => b.onclick = () => { map.closePopup(); ir(+b.dataset.a, +b.dataset.b, false); });
  return div;
}
// En pantallas estrechas la ficha no cabe como globo sobre el mapa: se muestra en el panel inferior.
const movil = matchMedia('(max-width:800px)').matches;
function fichaEnPanel(R) {
  const caja = document.createElement('div'); caja.className = 'perg entra';
  caja.innerHTML = '<button class="volver">← Volver a la parada</button>';
  caja.firstChild.onclick = tarjeta; caja.append(fichaRegion(R));
  $('card').replaceChildren(caja); $('card').scrollTop = 0;
}
const rotulos = REG.map(R => {
  const m = L.marker(R.ll, { pane:'regiones', keyboard:false,
    icon:L.divIcon({ className:'region '+(R.tipo||'r'), html:`<div>${R.n}</div>`, iconSize:[0,0] }) }).addTo(map);
  if (movil) m.on('click', () => fichaEnPanel(R));
  else m.bindPopup(() => fichaRegion(R), { className:'perg', maxWidth:310, autoPanPaddingTopLeft:[50,80], autoPanPaddingBottomRight:[420,40] });
  return { R, m };
});
function verRotulos() {
  const z = map.getZoom();
  rotulos.forEach(({R,m}) => { const el = m.getElement(); if (!el) return; const [a,b] = R.z || [0,99];
    el.style.display = z>=a && z<=b ? '' : 'none';
    el.firstChild.style.fontSize = Math.min(R.tipo==='l' ? 14 : 17, 10 + 2*(z-a)) + 'px'; });
}
map.on('zoomend', verRotulos); verRotulos();
// Mientras se lee una ficha, los efectos de noche o tinieblas se aclaran para no oscurecerla.
map.on('popupopen', () => document.body.classList.add('ficha')).on('popupclose', () => document.body.classList.remove('ficha'));
function abrirRegion(nombre) {
  const r = rotulos.find(x => x.R.n === nombre); if (!r) return;
  const [a,b] = r.R.z || [map.getMinZoom(), map.getMaxZoom()];
  map.setView(r.R.ll, Math.min(Math.max(map.getZoom(), a), b), { animate:false }); verRotulos();
  if (movil) fichaEnPanel(r.R); else r.m.openPopup();
}

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
    + `<span id="score">⭐ ${puntos} / ${totalQ*10}</span><button class="tab ico" id="snd" title="Sonido">${Snd.on?'🔊':'🔇'}</button>`
    + `<button class="tab ico" id="help" title="Cómo se juega">?</button>`;
  $('top').querySelectorAll('button[data-k]').forEach(b => b.onclick = () => ir(+b.dataset.k, 0, false));
  $('snd').onclick = () => { Snd.alternar(); tabs(); };
  $('help').onclick = () => { $ayuda().hidden = false; };
}

function dibujarPuntos(hasta) {
  gDots.clearLayers();
  // Un rótulo fijo por lugar (el de la última parada visitada allí); el del lugar actual va debajo para no tapar al viajero.
  const aqui = P()[hasta].ll.join(), rotulo = new Map();
  P().forEach((p,k) => { const lb = p.lb ?? p.n; if (k<=hasta && lb) rotulo.set(p.ll.join(), { k, lb }); });
  P().forEach((p,k) => {
    const visto = k<=hasta, c = VIAJES[v].color;
    if (k===hasta) L.circleMarker(p.ll, { radius:9, color:c, fill:false, className:'pulso', interactive:false }).addTo(gDots);
    const m = L.circleMarker(p.ll, { radius:k===hasta?8:5, color:'#2b1a0c', weight:1.5, fillColor:visto?c:'#f6ecd6', fillOpacity:1 }).addTo(gDots);
    m.on('click', () => ir(v,k,false));
    const key = p.ll.join(), e = rotulo.get(key);
    if (e && e.k === k) m.bindTooltip(e.lb, key === aqui ? { permanent:true, direction:'bottom', offset:[0,8], className:'lbl aqui' }
                                                         : { permanent:true, direction:'top', offset:[0,-6], className:'lbl' });
    else m.bindTooltip(p.n, { direction:'top', className:'lbl' });
  });
  $('dots').innerHTML = P().map((p,k)=>`<i class="${k===i?'cur':''}" title="${p.n}" data-k="${k}" style="${k<=hasta?'background:'+VIAJES[v].color+';border-color:'+VIAJES[v].color:''}"></i>`).join('');
  let km = 0; for (let k=1;k<=hasta;k++) km += kmDe(tramo(k));
  $('dots').insertAdjacentHTML('beforeend', `<span class="tot" title="Distancia recorrida en esta etapa">🧭 ${fmt(km)} km</span>`);
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
  const kmT = kmDe(ruta);
  $('card').innerHTML = `<div class="travel"><span class="pablo ${p.mar?'mar':'anda'} viaja"><div>${figura(p.mar)}</div></span>
    ${p.mar?'Navegando':'Caminando'} hacia<br><b>${p.n}</b>
    <div class="cuenta"><b id="kmv">0</b> de ${fmt(kmT)} km<br>${duracion(p, kmT)}</div></div>`;
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
      const kv = $('kmv'); if (kv) kv.textContent = fmt(kmT*d/largo);
      if (t<1) anim = requestAnimationFrame(paso);
      else { marker.setIcon(icono(p.mar, false, oeste)); dibujarPuntos(i); botones(false); tarjeta();
             Snd.ambiente(ambienteDe(p)); Snd.campana(); }
    })(t0);
  }, 850);
}

function tarjeta() {
  const V = VIAJES[v], p = P()[i], k = v+'-'+i;
  let h = `<span class="chip" style="background:${V.color}">${V.nombre} · ${V.anio}</span><span class="step">Parada ${i+1} de ${P().length}</span>
    <h2>${p.n}</h2><span class="ref">📖 ${p.ref}</span>`;
  const reg = regionDe(p), hoy = ACTUAL[p.n], km = i>0 ? kmDe(tramo(i)) : 0;
  h += `<div class="donde">${reg?`<button class="reg" data-r="${reg}" title="Ver la región en el mapa">📍 ${reg}</button>`:''}`
    + (hoy ? `<span>🌍 Hoy: ${hoy}</span>` : '')
    + (km > .05 ? `<span>🧭 ≈ ${fmt(km)} km desde ${P()[i-1].lb || P()[i-1].n}: ${duracion(p, km)}</span>` : '') + `</div>`;
  h += `<h3>${p.t}</h3>`;
  if (i===0) h += `<div class="box intro"><b>${V.ref}</b>${V.resumen}${V.equipo?`<br><br><i>Compañeros:</i> ${V.equipo}.`:''}</div>`;
  h += `<p>${p.d}</p>`;
  if (p.ig) h += `<div class="box ig"><b>${CFG.etiquetaIg}</b>${p.ig}</div>`;
  if (p.dato) h += `<div class="box"><b>📜 Dato</b>${p.dato}</div>`;
  if (p.q) h += `<div class="quiz"><div class="q">❓ ${p.q.p}</div>${p.q.o.map((o,n)=>`<button data-n="${n}">${o}</button>`).join('')}<div class="res"></div></div>`;
  if (v===VIAJES.length-1 && i===P().length-1)
    h += `<div class="box intro"><b>Fin del recorrido</b>${CFG.fin} Tu puntuación: <span id="fin">${puntos}</span> de ${totalQ*10}.</div>`;
  $('card').innerHTML = `<div class="entra">${h}</div>`; $('card').scrollTop = 0;
  const rb = $('card').querySelector('.reg'); if (rb) rb.onclick = () => abrirRegion(rb.dataset.r);
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
