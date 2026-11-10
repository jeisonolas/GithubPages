// Motor compartido de los mapas. Cada página define antes CFG (mapa y textos) y VIAJES (etapas y paradas).
const map = L.map('map', { minZoom:CFG.minZoom, maxZoom:CFG.maxZoom }).setView(VIAJES[0].paradas[0].ll, CFG.zoom);
L.tileLayer(CFG.tiles, { maxNativeZoom:CFG.maxNativeZoom, maxZoom:CFG.maxZoom, attribution:CFG.atribucion }).addTo(map);

const gBase = L.layerGroup().addTo(map), gLegs = L.layerGroup().addTo(map), gDots = L.layerGroup().addTo(map);
const icono = e => L.divIcon({ className:'pablo', html:`<div>${e}</div>`, iconSize:[36,36], iconAnchor:[18,18] });
const marker = L.marker(VIAJES[0].paradas[0].ll, { icon:icono('🚶'), zIndexOffset:1000, interactive:false }).addTo(map);

let v = 0, i = 0, anim = null, timer = null, puntos = 0;
const respondidas = {};
const totalQ = VIAJES.reduce((s,x)=>s+x.paradas.filter(p=>p.q).length,0);
const $ = id => document.getElementById(id);
const P = () => VIAJES[v].paradas;
const zoom = () => VIAJES[v].zoom || CFG.zoom;
const tramo = k => [P()[k-1].ll, ...(P()[k].via||[]), P()[k].ll];
const estilo = (k, tenue) => ({ color:VIAJES[v].color, weight:tenue?2:4, opacity:tenue?.45:.95, dashArray:P()[k].mar?'2 9':null, lineCap:'round' });
const pad = () => innerWidth>800 ? { paddingTopLeft:[50,90], paddingBottomRight:[420,50] }
                                 : { paddingTopLeft:[30,70], paddingBottomRight:[30,innerHeight*0.55] };

function tabs() {
  $('top').innerHTML = `<a class="tab" href="./" title="Viajes bíblicos">←</a>`
    + VIAJES.map((x,k)=>`<button class="tab ${k===v?'on':''}" style="${k===v?'background:'+x.color:''}" data-k="${k}">${x.nombre}</button>`).join('')
    + `<span id="score">⭐ ${puntos} / ${totalQ*10}</span>`;
  $('top').querySelectorAll('button').forEach(b => b.onclick = () => ir(+b.dataset.k, 0, false));
}

function dibujarPuntos(hasta) {
  gDots.clearLayers();
  const vistos = new Set();
  P().forEach((p,k) => {
    const visto = k<=hasta, c = VIAJES[v].color;
    const m = L.circleMarker(p.ll, { radius:k===hasta?8:5, color:c, weight:2, fillColor:visto?c:'#fff', fillOpacity:1 }).addTo(gDots);
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

  if (!animar || i===0) {
    marker.setLatLng(P()[i].ll).setIcon(icono(i>0 && P()[i].mar ? '⛵' : '🚶'));
    if (i===0) map.flyToBounds(L.latLngBounds(P().map(p=>p.ll)), { ...pad(), maxZoom:zoom()+1, duration:.9 });
    else map.flyToBounds(L.latLngBounds([P()[i].ll]), { ...pad(), maxZoom:zoom(), duration:.8 });
    tarjeta(); return;
  }

  const p = P()[i], ruta = tramo(i);
  $('card').innerHTML = `<div class="travel"><span>${p.mar?'⛵':'🚶'}</span>${p.mar?'Navegando':'Caminando'} hacia<br><b>${p.n}</b>…</div>`;
  marker.setIcon(icono(p.mar?'⛵':'🚶'));
  map.flyToBounds(L.latLngBounds(ruta), { ...pad(), maxZoom:zoom()+1, duration:.8 });
  const acum = [0]; for (let k=1;k<ruta.length;k++) acum.push(acum[k-1] + Math.hypot(ruta[k][0]-ruta[k-1][0], ruta[k][1]-ruta[k-1][1]));
  const largo = acum[acum.length-1], dur = Math.min(3200, Math.max(1100, 700 + largo*320));
  const linea = L.polyline([ruta[0]], estilo(i)).addTo(gLegs);
  timer = setTimeout(() => {
    const t0 = performance.now();
    (function paso(now) {
      const t = Math.min(1,(now-t0)/dur), d = t*largo;
      let s = 1; while (s<ruta.length-1 && acum[s]<d) s++;
      const f = (d-acum[s-1])/((acum[s]-acum[s-1])||1);
      const pos = [ruta[s-1][0]+(ruta[s][0]-ruta[s-1][0])*f, ruta[s-1][1]+(ruta[s][1]-ruta[s-1][1])*f];
      linea.setLatLngs([...ruta.slice(0,s), pos]); marker.setLatLng(pos);
      if (t<1) anim = requestAnimationFrame(paso);
      else { dibujarPuntos(i); botones(false); tarjeta(); }
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
  $('card').innerHTML = h; $('card').scrollTop = 0;
  if (p.q) {
    const bs = [...$('card').querySelectorAll('.quiz button')], res = $('card').querySelector('.res');
    const pintar = n => { bs.forEach(b=>b.disabled=true); bs[p.q.r].classList.add('ok'); if (n!==p.q.r) bs[n].classList.add('bad');
      res.textContent = n===p.q.r ? '¡Correcto! +10' : 'No. La respuesta correcta está marcada en verde.'; };
    if (k in respondidas) pintar(respondidas[k]);
    bs.forEach(b => b.onclick = () => { const n=+b.dataset.n; respondidas[k]=n; if (n===p.q.r) puntos+=10; pintar(n); tabs();
      const f=$('fin'); if (f) f.textContent=puntos; });
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
