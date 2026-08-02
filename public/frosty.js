(()=>{
 const q=s=>document.querySelector(s), panel=q('#frostyPanel'),toggle=q('#frostyToggle'),close=q('#frostyClose'),messages=q('#frostyMessages'),form=q('#frostyForm'),input=q('#frostyInput'),quick=q('#frostyQuick');
 if(!panel||!toggle)return;
 let data=null;
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
 const add=(text,who='bot',html=false)=>{const d=document.createElement('div');d.className=`frosty-msg ${who}`;if(html)d.innerHTML=text;else d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight};
 const load=async()=>{if(data)return data;try{const r=await fetch('/api/bootstrap');data=await r.json();return data}catch{return {products:[],flavors:[],settings:{}}}};
 const suggestions=['¿Está abierto?','Sabores disponibles','Precios','Delivery','Puntos','Formas de pago'];
 quick.innerHTML=suggestions.map(x=>`<button type="button">${x}</button>`).join('');quick.querySelectorAll('button').forEach(b=>b.onclick=()=>ask(b.textContent));
 const answer=async raw=>{const d=await load(),s=d.settings||{},t=norm(raw),products=(d.products||[]).filter(x=>x.active!==false),flavors=(d.flavors||[]).filter(x=>x.available!==false&&x.active!==false);
  if(/hola|buenas|buen dia|buenas tardes|buenas noches/.test(t))return '¡Hola! Soy Frosty 🍦 Puedo ayudarte con sabores, precios, delivery, horarios, puntos y pedidos.';
  if(/abierto|cerrado|horario|hora/.test(t)){const a=s.availability;return a?`${a.isOpen?'¡Sí, estamos abiertos! 🟢':'Ahora estamos cerrados 🔴'} ${a.label||''}`:'Podés consultar el estado actualizado en la barra superior de la web.'}
  if(/sabor|gusto|disponible|stock/.test(t)){if(!flavors.length)return 'En este momento no puedo ver sabores disponibles. Probá actualizar la página.';return `Tenemos ${flavors.length} sabores disponibles: ${flavors.slice(0,18).map(x=>x.name).join(', ')}${flavors.length>18?' y más…':''}`}
  if(/precio|cuanto|sale|costo|kilo|medio|cuarto/.test(t)){if(!products.length)return 'Los precios aparecen actualizados en la Carta.';return products.map(p=>`${p.name}: ${money(p.price)} · hasta ${p.maxFlavors} sabores`).join('\n')}
  if(/delivery|envio|domicilio|retiro|retirar/.test(t)){const fee=Number(s.deliveryFee||0),free=Number(s.freeDeliveryFrom||0);return `Podés pedir a domicilio o retirar por el local.${fee?` El envío cuesta ${money(fee)}`:''}${free?` y es gratis desde ${money(free)}`:''}. La dirección se carga al confirmar el pedido.`}
  if(/direccion|ubicacion|donde|maps|mapa/.test(t)){const addr=s.storeAddress||'la dirección indicada al pie de la página';return `Nos encontrás en ${addr}. Abajo de la web tenés el mapa y el botón para abrir Google Maps.`}
  if(/punto|beneficio|descuento|club/.test(t))return `Creá una cuenta o iniciá sesión para sumar puntos con cada compra. Al confirmar un pedido vas a poder elegir cuántos puntos querés canjear.`;
  if(/pago|mercado pago|tarjeta|efectivo/.test(t))return 'Podés pagar en efectivo o con Mercado Pago/tarjeta desde el pedido online.';
  if(/pedido|estado|seguimiento|demora/.test(t))return 'Iniciá sesión y entrá en “Mi cuenta” para ver el estado de tus pedidos. Desde ahí también podés hablar con el local.';
  if(/whatsapp|contacto|hablar|persona/.test(t)){const ph=String(s.whatsappNumber||'').replace(/\D/g,'');return ph?`Podés escribirnos por <a href="https://wa.me/${ph}" target="_blank" rel="noopener">WhatsApp</a>.`:'Podés usar el chat de un pedido o los enlaces de contacto al pie de la web.'}
  if(/instagram|redes/.test(t)){return s.instagramUrl?`Seguinos en <a href="${s.instagramUrl}" target="_blank" rel="noopener">${s.instagramHandle||'Instagram'}</a>.`:'Encontrás nuestro Instagram al pie de la web.'}
  return 'No entendí del todo 😅 Probá preguntarme por “sabores”, “precios”, “delivery”, “horarios”, “puntos” o “pedido”.';
 };
 const ask=async text=>{text=String(text||'').trim();if(!text)return;add(text,'user');input.value='';const r=await answer(text);add(r,'bot',/<a\s/i.test(r))};
 toggle.onclick=async()=>{panel.hidden=false;toggle.hidden=true;if(!messages.children.length){add('¡Hola! Soy Frosty 🍦 ¿En qué te ayudo?');await load()}setTimeout(()=>input.focus(),50)};
 close.onclick=()=>{panel.hidden=true;toggle.hidden=false};form.onsubmit=e=>{e.preventDefault();ask(input.value)};
})();
