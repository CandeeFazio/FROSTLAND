const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let token=localStorage.getItem('carniceria_token')||'', me=null, boot={products:[],settings:{}}, cart=JSON.parse(localStorage.getItem('carniceria_cart')||'[]'), adminData=null, currentCategory='Todos';
const money=n=>'$'+Math.round(Number(n||0)).toLocaleString('es-AR'); const kg=n=>Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:3})+' kg';
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}
async function api(url,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(token)h.Authorization='Bearer '+token;const r=await fetch(url,{...opt,headers:h});const ct=r.headers.get('content-type')||'';const d=ct.includes('json')?await r.json():null;if(!r.ok)throw new Error(d?.error||'Ocurrió un error.');return d}
function view(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));if(id==='orders')loadMyOrders();if(id==='admin')loadAdmin();scrollTo(0,0)}
$$('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
async function init(){boot=await api('/api/meat/bootstrap');applySiteContent();if(token){try{me=await api('/api/me');setAuth()}catch{token='';localStorage.removeItem('carniceria_token')}}renderShop();renderCart();setMinDate()}
function setAuth(){if(!me)return;$('#loginNav').textContent=me.name;$('#adminNav').hidden=!['admin','employee'].includes(me.role)}
function categories(){return ['Todos',...new Set(boot.products.map(p=>p.category||'Carnes'))]}
function renderShop(){const q=($('#search')?.value||'').toLowerCase();$('#categories').innerHTML=categories().map(c=>`<button class="chip ${c===currentCategory?'active':''}" data-cat="${c}">${c}</button>`).join('');$$('[data-cat]').forEach(b=>b.onclick=()=>{currentCategory=b.dataset.cat;renderShop()});const ps=boot.products.filter(p=>(currentCategory==='Todos'||p.category===currentCategory)&&`${p.name} ${p.description}`.toLowerCase().includes(q));$('#products').innerHTML=ps.map(p=>`<article class="product-card"><div class="product-img">${p.imageUrl?`<img src="${p.imageUrl}" alt="${p.name}">`:'🥩'}</div><div class="product-body"><small>${p.category}</small><h3>${p.name}</h3><p>${p.description||'Corte seleccionado y preparado a pedido.'}</p><div class="price">${money(p.unitType==='kg'?p.pricePerKg:p.price)}${p.unitType==='kg'?'/kg':''}</div>${p.unitType==='kg'?`<div class="stock-note">Disponible: ${kg(p.availableKg)}</div>`:''}<button class="primary full" data-add="${p.id}" ${p.unitType==='kg'&&p.availableKg<=0?'disabled':''}>Elegir</button></div></article>`).join('')||'<div class="empty">No hay productos para mostrar.</div>';$$('[data-add]').forEach(b=>b.onclick=()=>openProduct(b.dataset.add))}
$('#search').oninput=renderShop;
function openProduct(id,editKey=null){
  const p=boot.products.find(x=>x.id===id);
  if(!p)return;
  const editing=editKey?cart.find(x=>x.key===editKey):null;
  const image=p.imageUrl?`<img src="${p.imageUrl}" alt="${p.name}">`:`<div class="product-modal-placeholder">🥩</div>`;
  $('#productPick').innerHTML=`
    <div class="product-modal-pro">
      <section class="product-modal-left">
        <div class="product-modal-image">
          ${image}
          <span class="product-modal-category">🔥 ${p.category||'Parrilla'}</span>
        </div>
        <div class="product-modal-info">
          <h2><span>🔥</span>${p.name}</h2>
          <p class="product-modal-description">${p.description||'Corte fresco seleccionado especialmente para vos.'}</p>
          <div class="product-modal-divider"></div>
          <span class="product-modal-price-label">PRECIO</span>
          <div class="product-modal-price">${money(p.unitType==='kg'?p.pricePerKg:p.price)}${p.unitType==='kg'?'<small>/kg</small>':''}</div>
          <span class="kg-badge">${p.unitType==='kg'?'⚖ Kilos aproximados':'📦 Por unidad'}</span>
          <div class="product-features">
            <div><span>🥩</span><small>Corte<br>seleccionado</small></div>
            <div><span>♨</span><small>Ideal para<br>la parrilla</small></div>
            <div><span>✪</span><small>Calidad<br>premium</small></div>
            <div><span>❄</span><small>Fresco<br>del día</small></div>
          </div>
        </div>
      </section>
      <section class="product-modal-right">
        ${p.unitType==='kg'?`
          <div class="modal-field-block">
            <div class="modal-label"><span>⚖</span>KILOS APROXIMADOS</div>
            <div class="kg-selector">
              <button type="button" id="minusKg">−</button>
              <input id="pickKg" type="number" min="0.1" max="${p.availableKg||999}" step="0.1" value="${editing?.requestedKg||1}">
              <span>kg</span>
              <button type="button" id="plusKg">+</button>
            </div>
          </div>
          <div class="modal-field-block">
            <div class="modal-label"><span>🥩</span>¿CÓMO LO QUERÉS?</div>
            <select id="pickCut" class="modal-select">${(p.cutOptions||['Entero']).map(c=>`<option ${editing?.cut===c?'selected':''}>${c}</option>`).join('')}</select>
            <div class="modal-help"><span>ⓘ</span><p>Podés elegir el corte o preparación que prefieras.</p></div>
          </div>`:`
          <div class="modal-field-block">
            <div class="modal-label">📦 CANTIDAD</div>
            <div class="kg-selector">
              <button type="button" id="minusQty">−</button>
              <input id="pickQty" type="number" min="1" step="1" value="${editing?.qty||1}">
              <span>u.</span>
              <button type="button" id="plusQty">+</button>
            </div>
          </div>`}
        <div class="modal-field-block">
          <div class="modal-label"><span>📝</span>OBSERVACIONES <small>(OPCIONAL)</small></div>
          <div class="notes-wrapper">
            <textarea id="pickNotes" maxlength="120" placeholder="Ej: poca grasa, porciones parejas...">${editing?.notes||''}</textarea>
            <span id="notesCounter">${(editing?.notes||'').length}/120</span>
          </div>
        </div>
        <div class="product-modal-notice"><span>◷</span><div><b>PEDIDOS CON 24 HS DE ANTICIPACIÓN</b><p>Para garantizar la mejor calidad y preparación de nuestros cortes.</p></div></div>
        <div class="product-modal-sticky">
          <div class="modal-estimate"><small>ESTIMADO</small><b id="modalEstimate">${money(p.unitType==='kg'?(editing?.requestedKg||1)*p.pricePerKg:(editing?.qty||1)*p.price)}</b></div>
          <button type="button" class="product-modal-add" id="confirmPick">🛒 ${editing?'ACTUALIZAR':'AGREGAR AL PEDIDO'}</button>
          <div class="secure-note">♡ El total definitivo se confirma con el peso real</div>
        </div>
      </section>
    </div>`;
  const notes=$('#pickNotes'),counter=$('#notesCounter');
  notes.addEventListener('input',()=>counter.textContent=`${notes.value.length}/120`);
  const updateEstimate=()=>{const el=$('#modalEstimate');if(!el)return;const amount=p.unitType==='kg'?(Number($('#pickKg')?.value||0)*p.pricePerKg):(Number($('#pickQty')?.value||0)*p.price);el.textContent=money(amount)};
  if(p.unitType==='kg'){
    const input=$('#pickKg');
    $('#minusKg').onclick=()=>{const current=Number(input.value)||1;input.value=Math.max(.1,current-.5).toFixed(1);updateEstimate()};
    $('#plusKg').onclick=()=>{const current=Number(input.value)||1,max=Number(p.availableKg||999);input.value=Math.min(max,current+.5).toFixed(1);updateEstimate()};
    input.addEventListener('input',updateEstimate);
  }else{
    const input=$('#pickQty');
    $('#minusQty').onclick=()=>{input.value=Math.max(1,Number(input.value||1)-1);updateEstimate()};
    $('#plusQty').onclick=()=>{input.value=Number(input.value||1)+1;updateEstimate()};
    input.addEventListener('input',updateEstimate);
  }
  $('#confirmPick').onclick=()=>{
    const item={key:crypto.randomUUID(),productId:p.id,productName:p.name,unitType:p.unitType,unitPrice:p.unitType==='kg'?p.pricePerKg:p.price,notes:$('#pickNotes').value};
    if(p.unitType==='kg'){item.requestedKg=Number($('#pickKg').value);item.cut=$('#pickCut').value}else item.qty=Number($('#pickQty').value);
    if(editing)cart=cart.map(x=>x.key===editKey?{...item,key:editKey}:x);else cart.push(item);
    saveCart();productDialog.close();openCart();
  };
  productDialog.showModal();
}

function saveCart(){localStorage.setItem('carniceria_cart',JSON.stringify(cart));renderCart()}
function est(i){return i.unitType==='kg'?i.requestedKg*i.unitPrice:i.qty*i.unitPrice}
function renderCart(){$('#cartCount').textContent=cart.length;$('#cartItems').innerHTML=cart.map(i=>`<div class="cart-row"><div class="cart-row-main"><b>${i.productName}</b><small>${i.unitType==='kg'?`${kg(i.requestedKg)} · ${i.cut}`:`${i.qty} u.`}${i.notes?' · '+i.notes:''}</small><strong>${money(est(i))} estimado</strong></div><div class="cart-row-actions"><button data-edit-cart="${i.key}">Editar</button><button data-remove="${i.key}">Quitar</button></div></div>`).join('')||'<div class="empty">Todavía no agregaste productos.</div>';$$('[data-remove]').forEach(b=>b.onclick=()=>{cart=cart.filter(i=>i.key!==b.dataset.remove);saveCart()});$$('[data-edit-cart]').forEach(b=>b.onclick=()=>{const i=cart.find(x=>x.key===b.dataset.editCart);if(i){closeCart();openProduct(i.productId,i.key)}});$('#cartTotals').innerHTML=`<div class="cart-total"><span>Estimado</span><span>${money(cart.reduce((a,i)=>a+est(i),0))}</span></div><small>El total final se calcula con el peso real.</small>`;$('#checkoutBtn').disabled=!cart.length}
function openCart(){$('#cartDrawer').classList.add('open');$('#drawerBackdrop').hidden=false}function closeCart(){$('#cartDrawer').classList.remove('open');$('#drawerBackdrop').hidden=true}$('#cartBtn').onclick=openCart;$('#closeCart').onclick=closeCart;$('#drawerBackdrop').onclick=closeCart;
$('#checkoutBtn').onclick=()=>{if(!token){closeCart();toast('Ingresá o creá tu cuenta para continuar.');view('login');return}setMinDate();checkoutDialog.showModal()};
function setMinDate(){const hours=Math.max(1,Number(boot.settings?.minAdvanceHours||24));const d=new Date(Date.now()+hours*3600000);const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);const input=$('#requestedFor');input.min=local;if(!input.value||new Date(input.value).getTime()<d.getTime()-60000)input.value=local;if($('#advanceHelp'))$('#advanceHelp').textContent=`Mínimo ${hours} horas desde ahora.`}
$('#deliveryType').onchange=e=>$('#addressFields').hidden=e.target.value!=='delivery';
$('#checkoutForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const order=await api('/api/meat/orders',{method:'POST',body:JSON.stringify({ack24h:f.get('ack24h')==='on',requestedFor:new Date(f.get('requestedFor')).toISOString(),delivery:{type:f.get('deliveryType'),street:f.get('street'),number:f.get('number'),city:f.get('city'),mapsLink:f.get('mapsLink'),latitude:f.get('latitude'),longitude:f.get('longitude')},customerNotes:f.get('customerNotes'),items:cart.map(i=>i.unitType==='kg'?{productId:i.productId,requestedKg:i.requestedKg,cut:i.cut,notes:i.notes}:{productId:i.productId,qty:i.qty,notes:i.notes})})});cart=[];saveCart();checkoutDialog.close();closeCart();toast('Pedido recibido: '+order.code);view('orders');boot=await api('/api/meat/bootstrap');renderShop()}catch(err){toast(err.message)}};
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify(f)});token=d.token;me=d.user;localStorage.setItem('carniceria_token',token);setAuth();toast('Ingresaste correctamente');view(['admin','employee'].includes(me.role)?'admin':'shop')}catch(err){toast(err.message)}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const d=await api('/api/auth/register',{method:'POST',body:JSON.stringify(f)});token=d.token;me=d.user;localStorage.setItem('carniceria_token',token);setAuth();toast('Cuenta creada');view('shop')}catch(err){toast(err.message)}};
const statusLabel={received:'Pedido recibido',accepted:'Aceptado',preparing:'En preparación',awaiting_payment:'Esperando pago',ready:'Listo para retirar',delivered:'Entregado',cancelled:'Cancelado'};
async function loadMyOrders(){if(!token){$('#myOrders').innerHTML='<div class="empty">Ingresá para ver tus pedidos.</div>';return}try{const orders=await api('/api/meat/my-orders');$('#myOrders').innerHTML=orders.map(o=>`<article class="admin-card"><div class="admin-card-head"><div><span class="status ${o.status}">${statusLabel[o.status]||o.status}</span><h4>${o.code}</h4><small>Para: ${new Date(o.requestedFor).toLocaleString('es-AR')}</small></div><div><b>${o.finalTotal?money(o.finalTotal):money(o.totalEstimated)+' estimado'}</b></div></div><div class="order-items">${o.items.map(i=>`<div class="order-line"><span>${i.productName}<small>${i.unitType==='kg'?` solicitado ${kg(i.requestedKg)}${i.actualKg?` · real ${kg(i.actualKg)}`:''} · ${i.cut}`:` x${i.qty}`}</small></span><b>${money(i.finalSubtotal??i.estimatedSubtotal)}</b></div>`).join('')}</div>${o.status==='awaiting_payment'?payHtml(o):''}</article>`).join('')||'<div class="empty">Todavía no hiciste pedidos.</div>';bindPay()}catch(err){$('#myOrders').innerHTML=`<div class="empty">${err.message}</div>`}}
function payHtml(o){return `<div class="pay-box"><b>Total definitivo: ${money(o.finalTotal)}</b><p>Elegí cómo querés pagar.</p><div class="order-actions"><button class="primary" data-pay="mercadopago" data-oid="${o.id}">Mercado Pago</button><button class="outline" data-pay="transfer" data-oid="${o.id}">Transferencia</button><button class="outline" data-pay="cash" data-oid="${o.id}">Efectivo</button><button class="outline" data-pay="qr" data-oid="${o.id}">QR en local</button></div></div>`}
function bindPay(){$$('[data-pay]').forEach(b=>b.onclick=async()=>{try{const d=await api(`/api/meat/orders/${b.dataset.oid}/pay`,{method:'POST',body:JSON.stringify({paymentMethod:b.dataset.pay})});if(d.checkoutUrl)location.href=d.checkoutUrl;else{toast('Medio de pago registrado');loadMyOrders()}}catch(e){toast(e.message)}})}
$$('[data-tab]').forEach(b=>b.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('.tab').forEach(t=>t.classList.toggle('active',t.id===b.dataset.tab))});
$('#logoutBtn').onclick=()=>{token='';me=null;localStorage.removeItem('carniceria_token');location.reload()};$('#refreshAdmin').onclick=loadAdmin;
async function loadAdmin(){if(!token||!me||!['admin','employee'].includes(me.role)){view('login');return}try{adminData=await api('/api/meat/admin/dashboard');renderAdmin()}catch(e){toast(e.message)}}
function renderAdmin(){const m=adminData.metrics;$('#metrics').innerHTML=[['Nuevos',m.newOrders],['Preparando',m.preparing],['Esperan pago',m.awaitingPayment],['Listos',m.ready],['Stock bajo',m.lowStock],['Kg comprometidos',m.committedKg]].map(x=>`<div class="metric"><b>${x[1]}</b><small>${x[0]}</small></div>`).join('');$('#attentionOrders').innerHTML=adminData.orders.filter(o=>['received','accepted','preparing'].includes(o.status)).slice(0,8).map(orderCard).join('')||'<div class="empty">No hay pedidos pendientes.</div>';renderAdminOrders();renderStock();renderProductsAdmin();renderMovements();renderReceipts();renderContentAdmin();bindOrderOpen()}
function orderCard(o){return `<article class="admin-card"><div class="admin-card-head"><div><span class="status ${o.status}">${statusLabel[o.status]||o.status}</span><h4>${o.code} · ${o.customer?.name||'Cliente'}</h4><small>${new Date(o.requestedFor).toLocaleString('es-AR')} · ${o.delivery?.type==='delivery'?'Delivery':'Retiro'}</small></div><button class="outline" data-order-open="${o.id}">Abrir</button></div><small>${o.items.map(i=>`${i.productName} ${i.unitType==='kg'?kg(i.requestedKg):'x'+i.qty}`).join(' · ')}</small></article>`}
function renderAdminOrders(){const f=$('#orderFilter').value;const os=adminData.orders.filter(o=>f==='all'||o.status===f);$('#adminOrderList').innerHTML=os.map(orderCard).join('')||'<div class="empty">No hay pedidos.</div>';bindOrderOpen()}$('#orderFilter').onchange=()=>adminData&&renderAdminOrders();
function bindOrderOpen(){$$('[data-order-open]').forEach(b=>b.onclick=()=>openAdminOrder(b.dataset.orderOpen))}
function openAdminOrder(id){const o=adminData.orders.find(x=>x.id===id);if(!o)return;$('#adminOrderDetail').innerHTML=`<p class="eyebrow">PEDIDO ${o.code}</p><h2>${o.customer?.name||'Cliente'}</h2><p>${o.customer?.phone||''} · ${o.customer?.email||''}</p><p><b>Fecha solicitada:</b> ${new Date(o.requestedFor).toLocaleString('es-AR')}</p>${deliveryAdminHtml(o)}<span class="status ${o.status}">${statusLabel[o.status]||o.status}</span><div class="order-items">${o.items.map(i=>`<div class="order-line"><div><b>${i.productName}</b><small>${i.unitType==='kg'?`Solicitado: ${kg(i.requestedKg)} · ${i.cut}`:`Cantidad: ${i.qty}`}${i.notes?` · ${i.notes}`:''}</small></div>${i.unitType==='kg'?`<label>Peso real<input class="weight-input" data-weight="${i.id}" type="number" step="0.001" min="0.001" value="${i.actualKg||''}" ${o.status==='awaiting_payment'||o.status==='ready'||o.status==='delivered'?'disabled':''}></label>`:`<b>${money(i.finalSubtotal||i.estimatedSubtotal)}</b>`}</div>`).join('')}</div><p><b>Estimado:</b> ${money(o.totalEstimated)} ${o.finalTotal?` · <b>Total definitivo: ${money(o.finalTotal)}</b>`:''}</p><div class="order-actions">${o.status==='received'?`<button class="primary" data-action="accept">Aceptar pedido</button>`:''}${o.status==='accepted'?`<button class="primary" data-action="preparing">Pasar a preparación</button>`:''}${['accepted','preparing'].includes(o.status)?`<button class="dark" data-action="finalize">Confirmar pesos y total</button>`:''}${o.status==='awaiting_payment'?`<button class="primary" data-action="ready">Marcar listo</button>`:''}${o.status==='ready'?`<button class="dark" data-action="delivered">Entregado</button>`:''}${!['delivered','cancelled'].includes(o.status)?`<button class="outline" data-action="cancel">Cancelar</button>`:''}<button class="outline" data-ticket58>Ticket 58 mm</button><button class="outline" data-receipt-download>Descargar comprobante PDF</button><button class="outline" data-receipt-email ${!o.customer?.email?'disabled':''}>Enviar por Gmail</button></div>`;$$('[data-action]',adminOrderDialog).forEach(b=>b.onclick=()=>orderAction(o,b.dataset.action));const tb=$('[data-ticket58]',adminOrderDialog);if(tb)tb.onclick=()=>printTicket58(o);const db=$('[data-receipt-download]',adminOrderDialog);if(db)db.onclick=()=>downloadReceipt(o);const eb=$('[data-receipt-email]',adminOrderDialog);if(eb)eb.onclick=()=>emailReceipt(o);adminOrderDialog.showModal()}
async function orderAction(o,a){try{let body='{}';if(a==='finalize'){const weights={};$$('[data-weight]',adminOrderDialog).forEach(i=>weights[i.dataset.weight]=Number(i.value));body=JSON.stringify({weights})}await api(`/api/meat/admin/orders/${o.id}/${a}`,{method:'POST',body});toast('Pedido actualizado');adminOrderDialog.close();await loadAdmin()}catch(e){toast(e.message)}}
function renderStock(){const products=adminData.products.filter(p=>p.unitType==='kg');$('#stockList').innerHTML=products.map(p=>`<article class="stock-card ${p.availableKg<=p.lowStockKg?'low':''}"><div class="stock-card-head"><div><b>${p.name}</b><small>${p.barcode||'Sin código'}</small></div>${p.availableKg<=p.lowStockKg?'<span class="stock-alert">STOCK BAJO</span>':''}</div><div class="stock-numbers"><div><small>Físico</small><b>${kg(p.stockKg)}</b></div><div><small>Comprometido</small><b>${kg(p.committedKg)}</b></div><div><small>Disponible</small><b>${kg(p.availableKg)}</b></div></div><div class="stock-actions"><button data-stock-delta="1" data-pid="${p.id}">+ 1 kg</button><button data-stock-delta="5" data-pid="${p.id}">+ 5 kg</button><button data-stock-delta="-1" data-pid="${p.id}">− 1 kg</button><button class="outline" data-stock-custom="${p.id}">Otro ajuste</button></div></article>`).join('')||'<div class="empty">No hay productos por kg.</div>';$$('[data-stock-delta]').forEach(b=>b.onclick=()=>adjustStock(b.dataset.pid,Number(b.dataset.stockDelta),`Ajuste rápido ${Number(b.dataset.stockDelta)>0?'+':''}${b.dataset.stockDelta} kg`));$$('[data-stock-custom]').forEach(b=>b.onclick=async()=>{const delta=prompt('¿Cuántos kg querés sumar o descontar? Ej: 12.5 o -2');if(delta===null||String(delta).trim()==='')return;const n=Number(String(delta).replace(',','.'));if(!Number.isFinite(n)||n===0){toast('Ingresá un número válido');return}adjustStock(b.dataset.stockCustom,n,'Ajuste manual desde panel')})}
async function adjustStock(id,delta,reason){try{const d=await api(`/api/meat/admin/inventory/${id}/adjust`,{method:'POST',body:JSON.stringify({deltaKg:delta,reason})});toast(`${d.product.name}: ${kg(d.product.stockKg)} en stock`);await loadAdmin()}catch(e){toast(e.message)}}
$('#scanForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.kg=Number(f.kg);try{const d=await api('/api/meat/admin/inventory/scan',{method:'POST',body:JSON.stringify(f)});toast(`${d.product.name}: stock ${kg(d.product.stockKg)}`);e.target.reset();$('#barcodeInput').focus();loadAdmin()}catch(err){toast(err.message)}};
function renderProductsAdmin(){$('#productAdminList').innerHTML=adminData.products.map(p=>`<div class="product-admin-row">${p.imageUrl?`<img class="thumb" src="${p.imageUrl}">`:'<div class="thumb"></div>'}<div><b>${p.name}</b><small>${p.category}</small></div><div>${money(p.unitType==='kg'?p.pricePerKg:p.price)}${p.unitType==='kg'?'/kg':''}</div><div>${p.unitType==='kg'?kg(p.stockKg):'Unidad'}</div><div>${p.barcode||'Sin código'}</div><button class="outline" data-edit-product="${p.id}">Editar</button></div>`).join('');$$('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct))}
$('#newProduct').onclick=()=>editProduct();function editProduct(id){const p=id?adminData.products.find(x=>x.id===id):null;const f=$('#productEditForm');f.reset();f.id.value=p?.id||'';f.name.value=p?.name||'';f.category.value=p?.category||'Carnes';f.description.value=p?.description||'';f.unitType.value=p?.unitType||'kg';f.pricePerKg.value=p?.unitType==='unit'?p.price:(p?.pricePerKg||'');f.stockKg.value=p?.stockKg||0;f.lowStockKg.value=p?.lowStockKg||5;f.barcode.value=p?.barcode||'';f.cutOptions.value=(p?.cutOptions||['Entero','Parrilla','Fino']).join(', ');f.imageUrl.value=p?.imageUrl||'';$('#imagePreview').innerHTML=p?.imageUrl?`<img class="thumb" src="${p.imageUrl}">`:'';$('#productEditTitle').textContent=p?'Editar producto':'Nuevo producto';productEditDialog.showModal()}
$('#productImageFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;const fd=new FormData();fd.append('image',file);try{const r=await fetch('/api/admin/upload-image',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'Error al subir imagen');$('#productEditForm').imageUrl.value=d.imageUrl;$('#imagePreview').innerHTML=`<img class="thumb" src="${d.imageUrl}">`;toast('Foto cargada')}catch(err){toast(err.message)}};
$('#productEditForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const id=f.id;const body={name:f.name,category:f.category,description:f.description,unitType:f.unitType,pricePerKg:Number(f.pricePerKg),price:Number(f.pricePerKg),stockKg:Number(f.stockKg||0),lowStockKg:Number(f.lowStockKg||5),barcode:f.barcode,cutOptions:String(f.cutOptions||'').split(',').map(x=>x.trim()).filter(Boolean),imageUrl:f.imageUrl};try{await api(id?`/api/meat/admin/products/${id}`:'/api/meat/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(body)});productEditDialog.close();toast('Producto guardado');boot=await api('/api/meat/bootstrap');renderShop();loadAdmin()}catch(err){toast(err.message)}};

async function downloadReceipt(o){try{const r=await fetch(`/api/meat/admin/orders/${o.id}/receipt.pdf`,{headers:{Authorization:'Bearer '+token}});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'No se pudo generar el comprobante')}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`CANFRAN_${o.code}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){toast(e.message)}}
async function emailReceipt(o){if(!o.customer?.email){toast('El cliente no tiene email cargado');return}try{await api(`/api/meat/admin/orders/${o.id}/email-receipt`,{method:'POST',body:'{}'});toast(`Comprobante enviado a ${o.customer.email}`)}catch(e){toast(e.message)}}
function renderReceipts(){const el=$('#receiptList');if(!el||!adminData)return;const orders=adminData.orders.filter(o=>o.finalTotal||['awaiting_payment','ready','delivered'].includes(o.status));el.innerHTML=orders.map(o=>`<article class="receipt-card"><div><b>${o.code}</b><small>${o.customer?.name||'Cliente'} · ${o.customer?.email||'Sin email'}</small><small>${new Date(o.createdAt).toLocaleString('es-AR')}</small></div><div class="receipt-total">${money(o.finalTotal||o.totalEstimated)}</div><div class="receipt-actions"><button class="outline" data-rpdf="${o.id}">PDF</button><button class="outline" data-remail="${o.id}" ${!o.customer?.email?'disabled':''}>Gmail</button></div></article>`).join('')||'<div class="empty">Todavía no hay comprobantes.</div>';$$('[data-rpdf]').forEach(b=>b.onclick=()=>downloadReceipt(adminData.orders.find(o=>o.id===b.dataset.rpdf)));$$('[data-remail]').forEach(b=>b.onclick=()=>emailReceipt(adminData.orders.find(o=>o.id===b.dataset.remail)))}

function renderMovements(){$('#movementList').innerHTML=adminData.inventoryMovements.map(m=>`<div class="movement-row"><div><b>${m.productName}</b><small>${m.reference||''}</small></div><div><span class="status">${m.type==='entry'?'ENTRADA':'SALIDA'}</span></div><div><b>${kg(m.kg)}</b></div><div>${m.reason||''}</div><div>Stock: ${kg(m.stockAfter)}</div><div><small>${new Date(m.createdAt).toLocaleString('es-AR')} · ${m.createdBy?.name||''}</small></div></div>`).join('')||'<div class="empty">Sin movimientos todavía.</div>'}
const socket=io();socket.on('admin:new-order',()=>{if(me&&['admin','employee'].includes(me.role)){toast('Nuevo pedido recibido');loadAdmin()}});
init().catch(e=>toast(e.message));


function site(){return boot.settings?.siteContent||{}}
function applySiteContent(){
  const c=site(), settings=boot.settings||{};
  $('#brandName').textContent=settings.storeName||'CANFRAN';
  if($('#brandSubtitle'))$('#brandSubtitle').textContent=c.brandSubtitle||'Carnicería · Cortes · Asados';
  if($('#heroEyebrow'))$('#heroEyebrow').textContent=c.heroEyebrow||'PEDIDOS CON 24 HS DE ANTICIPACIÓN';
  if($('#heroTitle'))$('#heroTitle').innerHTML=String(c.heroTitle||'Elegí el corte.\nNosotros hacemos el resto.').replace(/\n/g,'<br>');
  if($('#heroText'))$('#heroText').textContent=c.heroText||'';
  if($('#heroButton'))$('#heroButton').textContent=c.heroButton||'Ver cortes';
  if($('#howTitle'))$('#howTitle').textContent=c.howTitle||'¿Cómo funciona?';
  if($('#howSteps'))$('#howSteps').innerHTML=(Array.isArray(c.howSteps)?c.howSteps:[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
  if($('#noticeTitle'))$('#noticeTitle').textContent=c.noticeTitle||'IMPORTANTE — PEDIDOS CON 24 HORAS DE ANTICIPACIÓN';
  if($('#noticeText'))$('#noticeText').textContent=c.noticeText||'';
  if($('#noticeAccept'))$('#noticeAccept').textContent=c.noticeAccept||'';
  document.title=`${settings.storeName||'CANFRAN'} · Carnicería`;
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function renderContentAdmin(){
  const f=$('#contentForm'); if(!f||!adminData)return; const c=adminData.settings?.siteContent||{}, st=adminData.settings||{};
  const values={storeName:st.storeName||'CANFRAN',storeAddress:st.storeAddress||'',storePhone:st.storePhone||'',whatsappNumber:st.whatsappNumber||'',instagramHandle:st.instagramHandle||'',mapsUrl:st.mapsUrl||'',minAdvanceHours:st.minAdvanceHours||24,receiptFooter:st.receiptFooter||'Gracias por elegir CANFRAN',brandSubtitle:c.brandSubtitle||'',heroEyebrow:c.heroEyebrow||'',heroTitle:c.heroTitle||'',heroText:c.heroText||'',heroButton:c.heroButton||'',howTitle:c.howTitle||'',howSteps:(c.howSteps||[]).join('\n'),noticeTitle:c.noticeTitle||'',noticeText:c.noticeText||'',noticeAccept:c.noticeAccept||''};
  Object.entries(values).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v});if(f.elements.autoEmailReceipt)f.elements.autoEmailReceipt.checked=Boolean(st.autoEmailReceipt);
}
$('#contentForm').onsubmit=async e=>{
  e.preventDefault(); const f=Object.fromEntries(new FormData(e.target));
  const body={storeName:f.storeName,storeAddress:f.storeAddress,storePhone:f.storePhone,whatsappNumber:f.whatsappNumber,instagramHandle:f.instagramHandle,mapsUrl:f.mapsUrl,minAdvanceHours:Number(f.minAdvanceHours||24),receiptFooter:f.receiptFooter,autoEmailReceipt:document.querySelector('#contentForm [name=autoEmailReceipt]').checked,siteContent:{brandSubtitle:f.brandSubtitle,heroEyebrow:f.heroEyebrow,heroTitle:f.heroTitle,heroText:f.heroText,heroButton:f.heroButton,howTitle:f.howTitle,howSteps:String(f.howSteps||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),noticeTitle:f.noticeTitle,noticeText:f.noticeText,noticeAccept:f.noticeAccept}};
  try{await api('/api/meat/admin/settings',{method:'PUT',body:JSON.stringify(body)});toast('Contenido actualizado');boot=await api('/api/meat/bootstrap');applySiteContent();setMinDate();adminData=await api('/api/meat/admin/dashboard');renderContentAdmin()}catch(err){toast(err.message)}
};

$('#useLocationBtn').onclick=()=>{
  if(!navigator.geolocation){toast('Este dispositivo no permite compartir ubicación.');return}
  $('#locationStatus').textContent='Buscando ubicación...';
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat=pos.coords.latitude.toFixed(6), lng=pos.coords.longitude.toFixed(6), link=`https://www.google.com/maps?q=${lat},${lng}`;
    $('#latitude').value=lat;$('#longitude').value=lng;$('#mapsLink').value=link;$('#locationStatus').textContent='Ubicación actual agregada al pedido.';toast('Ubicación agregada');
  },()=>{ $('#locationStatus').textContent='No se pudo obtener la ubicación. Podés pegar el link de Google Maps.';toast('No se pudo obtener la ubicación') },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
};
function deliveryAdminHtml(o){
  const d=o.delivery||{}; if(d.type!=='delivery')return '<p><b>Entrega:</b> Retiro en el local</p>';
  const addr=[d.street,d.number,d.city].filter(Boolean).join(' '), link=d.mapsLink||(d.latitude&&d.longitude?`https://www.google.com/maps?q=${d.latitude},${d.longitude}`:'');
  return `<p><b>Delivery:</b> ${escapeHtml(addr||'Dirección no escrita')}</p>${link?`<p><a class="maps-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">📍 Abrir ubicación en Google Maps</a></p>`:''}`;
}
function ticketDelivery(o){
  const d=o.delivery||{}; if(d.type!=='delivery')return 'RETIRO EN LOCAL';
  const addr=[d.street,d.number,d.city].filter(Boolean).join(' ');
  const coords=d.latitude&&d.longitude?`\nGPS: ${d.latitude}, ${d.longitude}`:'';
  return `DELIVERY\n${addr||'Ver ubicación de Maps'}${coords}`;
}
function printTicket58(o){
  const st=adminData?.settings||boot.settings||{}, final=Number(o.finalTotal||0)>0;
  const items=(o.items||[]).map(i=>{const qty=i.unitType==='kg'?(final&&i.actualKg?`${kg(i.actualKg)} REAL`:`${kg(i.requestedKg)} SOL.`):`x${i.qty}`;const sub=final?(i.finalSubtotal||i.estimatedSubtotal):i.estimatedSubtotal;return `<div class="t-item"><b>${escapeHtml(i.productName)}</b><div>${escapeHtml(qty)}${i.cut?` · ${escapeHtml(i.cut)}`:''}</div>${i.notes?`<div>Obs: ${escapeHtml(i.notes)}</div>`:''}<div class="t-right">${money(sub)}</div></div>`}).join('');
  const d=o.delivery||{}, mapText=d.mapsLink?'UBICACIÓN MAPS EN PEDIDO':'';
  $('#printTicket').innerHTML=`<div class="t-center"><b class="t-brand">${escapeHtml(st.storeName||'CANFRAN')}</b><br>${escapeHtml(st.storeAddress||'')}${st.storePhone?`<br>Tel: ${escapeHtml(st.storePhone)}`:''}<br>Pedido ${escapeHtml(o.code)}</div><hr><div><b>Cliente:</b> ${escapeHtml(o.customer?.name||'')}<br><b>Tel:</b> ${escapeHtml(o.customer?.phone||'')}<br><b>Para:</b> ${new Date(o.requestedFor).toLocaleString('es-AR')}<br><b>${escapeHtml(ticketDelivery(o)).replace(/\n/g,'<br>')}</b>${mapText?`<br>${mapText}`:''}</div><hr>${items}<hr><div class="t-total"><span>${final?'TOTAL':'ESTIMADO'}</span><b>${money(final?o.finalTotal:o.totalEstimated)}</b></div>${!final?'<div class="t-center t-small">Peso e importe sujetos a confirmación.</div>':''}<div class="t-center t-small">Gracias por elegir CANFRAN</div>`;
  document.body.classList.add('printing-ticket'); window.print(); setTimeout(()=>document.body.classList.remove('printing-ticket'),500);
}
