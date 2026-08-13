(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const token=()=>localStorage.getItem('token');
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Error ${r.status}`);return d}

let injected=false, dashboard=null, suppliers=[], selectedSupplier=null;

function panelByTitle(words){
 return $$('.panel').find(p=>{
   const h=(p.querySelector('h2')?.textContent||'').trim().toLowerCase();
   return words.some(w=>h.startsWith(w));
 });
}
function mapOriginalSections(){
 const pairs=[
  [['pedidos'],'v72-orders'],
  [['ventas y clientes','ventas'],'v72-sales'],
  [['caja y turnos','caja'],'v72-cash'],
  [['stock privado','stock'],'v72-stock'],
  [['productos y precios','productos'],'v72-products'],
  [['flyer promocional','flyer','banner'],'v72-banners'],
  [['contenido de la página','contenido'],'v72-content'],
  [['configuración y horarios','configuración','horarios'],'v72-settings']
 ];
 pairs.forEach(([titles,id])=>{const p=panelByTitle(titles); if(p&&!p.id)p.id=id; else if(p)p.id=id});
 const stats=$('#stats'); if(stats&&!stats.id)stats.id='v72-dashboard';
}
function makeSidebar(){
 if($('#v72Sidebar'))return;
 const aside=document.createElement('aside');
 aside.id='v72Sidebar';
 aside.className='v72-sidebar';
 aside.innerHTML=`<div class="v72-brand"><div class="v72-mark">F</div><div><b>FROSTLAND</b><small>Administración</small></div></div>
 <nav>
  <button data-go="v72-dashboard">Inicio</button>
  <button data-go="v72-orders">Pedidos</button>
  <button data-go="v72-sales">Ventas</button>
  <button data-go="v72-cash">Caja</button>
  <button data-go="v72-clients">Clientes</button>
  <button data-go="v72-suppliers">Proveedores</button>
  <button data-go="v72-stock">Stock y sabores</button>
  <button data-go="v72-products">Productos y precios</button>
  <button data-go="v72-banners">Banners</button>
  <button data-go="v72-content">Contenido</button>
  <button data-go="v72-settings">Horarios y config.</button>
 </nav>`;
 document.body.appendChild(aside);
 $$('#v72Sidebar [data-go]').forEach(b=>b.onclick=()=>{
   const el=document.getElementById(b.dataset.go);
   if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
   $$('#v72Sidebar button').forEach(x=>x.classList.toggle('active',x===b));
 });
}
function ensureNewPanels(){
 const admin=$('#admin'); if(!admin)return;
 if(!$('#v72-clients')){
   const sec=document.createElement('section'); sec.className='panel v72-panel'; sec.id='v72-clients';
   sec.innerHTML=`<div class="v72-head"><div><p class="v72-kicker">CLIENTES</p><h2>Clientes</h2><p>Vista rápida de clientes, pedidos de hoy, activos, pendientes e historial.</p></div><input id="v72ClientSearch" placeholder="Buscar cliente"></div>
   <div id="v72ClientTabs" class="v72-tabs"><button data-filter="all" class="active">Todos</button><button data-filter="today">Hoy</button><button data-filter="active">Activos</button><button data-filter="pending">Pendientes</button><button data-filter="history">Anteriores</button></div>
   <div class="v72-split"><div id="v72ClientList" class="v72-list"></div><div id="v72ClientDetail" class="v72-detail"><div class="v72-empty">Elegí un cliente.</div></div></div>`;
   (document.getElementById('v72-sales')||document.getElementById('v72-cash')||admin.firstElementChild)?.insertAdjacentElement('afterend',sec);
   let filter='all';
   $('#v72ClientSearch').oninput=()=>renderClients(filter);
   $$('#v72ClientTabs [data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('#v72ClientTabs button').forEach(x=>x.classList.toggle('active',x===b));renderClients(filter)});
 }
 if(!$('#v72-suppliers')){
   const sec=document.createElement('section'); sec.className='panel v72-panel'; sec.id='v72-suppliers';
   sec.innerHTML=`<div class="v72-head"><div><p class="v72-kicker">PROVEEDORES</p><h2>Proveedores</h2><p>Remitos, pagos entregados y saldo pendiente.</p></div><button id="v72NewSupplier">+ Nuevo proveedor</button></div>
   <div class="v72-split"><div><input id="v72SupplierSearch" class="v72-search" placeholder="Buscar proveedor"><div id="v72SupplierList" class="v72-list"></div></div><div id="v72SupplierDetail" class="v72-detail"><div class="v72-empty">Elegí un proveedor.</div></div></div>
   <dialog id="v72SupplierDialog" class="v72-dialog"><form method="dialog" id="v72SupplierForm"><h3>Nuevo proveedor</h3><input name="name" required placeholder="Nombre / razón social"><input name="contact" placeholder="Contacto"><input name="phone" placeholder="Teléfono"><input name="email" placeholder="Email"><input name="cuit" placeholder="CUIT"><textarea name="notes" placeholder="Notas"></textarea><div class="v72-actions"><button type="button" data-close>Cancelar</button><button>Guardar</button></div></form></dialog>`;
   (document.getElementById('v72-clients')||document.getElementById('v72-sales')||admin.firstElementChild)?.insertAdjacentElement('afterend',sec);
   $('#v72NewSupplier').onclick=()=>$('#v72SupplierDialog').showModal();
   $('#v72SupplierDialog [data-close]').onclick=()=>$('#v72SupplierDialog').close();
   $('#v72SupplierForm').onsubmit=saveSupplier;
   $('#v72SupplierSearch').oninput=renderSupplierList;
 }
}
function todayKey(d){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d))}
function clientsData(){
 if(!dashboard)return[];
 const users=(dashboard.users||[]).filter(u=>u.role==='customer'), orders=dashboard.orders||[], tk=todayKey(new Date());
 return users.map(u=>{
  const os=orders.filter(o=>o.userId===u.id || String(o.customer?.email||'').toLowerCase()===String(u.email||'').toLowerCase());
  const valid=os.filter(o=>o.status!=='cancelled');
  const today=valid.filter(o=>todayKey(o.createdAt)===tk);
  const active=valid.filter(o=>!['delivered','cancelled'].includes(o.status));
  const pending=active.filter(o=>o.paymentStatus!=='approved');
  const old=valid.filter(o=>todayKey(o.createdAt)!==tk);
  const spent=valid.filter(o=>o.paymentStatus==='approved'||o.status==='delivered').reduce((a,o)=>a+Number(o.total||0),0);
  return {...u,valid,today,active,pending,old,spent};
 });
}
function renderClients(filter='all'){
 const el=$('#v72ClientList'); if(!el||!dashboard)return;
 const q=String($('#v72ClientSearch')?.value||'').toLowerCase();
 let rows=clientsData().filter(c=>`${c.name||''} ${c.email||''} ${c.phone||''}`.toLowerCase().includes(q));
 if(filter==='today')rows=rows.filter(c=>c.today.length);
 if(filter==='active')rows=rows.filter(c=>c.active.length);
 if(filter==='pending')rows=rows.filter(c=>c.pending.length);
 if(filter==='history')rows=rows.filter(c=>c.old.length);
 el.innerHTML=rows.map(c=>`<button class="v72-card" data-client="${c.id}"><div><b>${esc(c.name||'Cliente')}</b><small>${esc(c.phone||'Sin teléfono')} · ${esc(c.email||'Sin email')}</small></div><div class="v72-card-foot"><span>${c.valid.length} pedidos</span><strong>${money(c.spent)}</strong></div><div class="v72-chips">${c.today.length?`<i>${c.today.length} hoy</i>`:''}${c.active.length?`<i>${c.active.length} activos</i>`:''}${c.pending.length?`<i class="warn">${c.pending.length} pendientes</i>`:''}</div></button>`).join('')||'<div class="v72-empty">No hay clientes para este filtro.</div>';
 $$('[data-client]').forEach(b=>b.onclick=()=>renderClientDetail(b.dataset.client));
}
function renderClientDetail(id){
 const c=clientsData().find(x=>x.id===id),el=$('#v72ClientDetail');if(!c||!el)return;
 const os=[...c.valid].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 el.innerHTML=`<div class="v72-detail-head"><div><p class="v72-kicker">CLIENTE</p><h3>${esc(c.name||'Cliente')}</h3><p>${esc(c.phone||'Sin teléfono')} · ${esc(c.email||'Sin email')}</p></div><strong>${money(c.spent)}</strong></div><div class="v72-metrics"><span><b>${c.today.length}</b> hoy</span><span><b>${c.active.length}</b> activos</span><span><b>${c.pending.length}</b> pendientes</span><span><b>${c.old.length}</b> anteriores</span></div><h4>Pedidos</h4>${os.map(o=>`<div class="v72-row"><div><b>${esc(o.code||'Pedido')}</b><small>${new Date(o.createdAt).toLocaleString('es-AR')}</small></div><div><strong>${money(o.total)}</strong><small>${esc(o.status||'')}</small></div></div>`).join('')||'<div class="v72-empty">Sin pedidos.</div>'}`;
}
async function loadSuppliers(){
 const list=$('#v72SupplierList');if(!list)return;
 try{suppliers=await api('/api/admin/suppliers');renderSupplierList();if(selectedSupplier)await renderSupplierDetail(selectedSupplier)}
 catch(e){list.innerHTML=`<div class="v72-note">El módulo de Proveedores todavía no está activo en el servidor. El resto del panel sigue funcionando normalmente.</div>`}
}
function renderSupplierList(){
 const el=$('#v72SupplierList');if(!el)return;
 const q=String($('#v72SupplierSearch')?.value||'').toLowerCase();
 const rows=suppliers.filter(s=>`${s.name||''} ${s.contact||''} ${s.phone||''}`.toLowerCase().includes(q));
 el.innerHTML=rows.map(s=>`<button class="v72-card" data-supplier="${s.id}"><div><b>${esc(s.name)}</b><small>${esc(s.contact||s.phone||'Sin contacto')}</small></div><div class="v72-card-foot"><span>Saldo</span><strong>${money(s.balance)}</strong></div></button>`).join('')||'<div class="v72-empty">No hay proveedores cargados.</div>';
 $$('[data-supplier]').forEach(b=>b.onclick=()=>renderSupplierDetail(b.dataset.supplier));
}
async function saveSupplier(e){
 e.preventDefault(); const body=Object.fromEntries(new FormData(e.currentTarget));
 try{const s=await api('/api/admin/suppliers',{method:'POST',body:JSON.stringify(body)});$('#v72SupplierDialog').close();e.currentTarget.reset();selectedSupplier=s.id;await loadSuppliers()}
 catch(err){alert(err.message)}
}
async function renderSupplierDetail(id){
 selectedSupplier=id; const el=$('#v72SupplierDetail');if(!el)return;
 try{
  const s=await api(`/api/admin/suppliers/${id}`);
  el.innerHTML=`<div class="v72-detail-head"><div><p class="v72-kicker">PROVEEDOR</p><h3>${esc(s.name)}</h3><p>${esc(s.phone||'')} ${s.cuit?'· CUIT '+esc(s.cuit):''}</p></div><strong>${money(s.balance)}</strong></div><div class="v72-metrics"><span><b>${money(s.purchased)}</b> comprado</span><span><b>${money(s.paid)}</b> pagado</span><span><b>${money(s.balance)}</b> pendiente</span></div><div class="v72-actions-left"><button id="v72AddReceipt">+ Remito</button><button id="v72AddPayment">+ Pago</button></div><h4>Remitos</h4>${(s.receipts||[]).map(r=>`<div class="v72-row"><div><b>Remito ${esc(r.number||'s/n')}</b><small>${new Date(r.date).toLocaleDateString('es-AR')}</small></div><div><strong>${money(r.total)}</strong><small>Saldo ${money(r.balance)}</small></div></div>`).join('')||'<div class="v72-empty">Sin remitos.</div>'}<h4>Pagos</h4>${(s.payments||[]).map(p=>`<div class="v72-row"><div><b>${esc(p.method||'Pago')}</b><small>${new Date(p.date).toLocaleDateString('es-AR')}</small></div><div><strong>${money(p.amount)}</strong></div></div>`).join('')||'<div class="v72-empty">Sin pagos.</div>'}<dialog id="v72ReceiptDialog" class="v72-dialog"><form method="dialog" id="v72ReceiptForm"><h3>Cargar remito</h3><input name="number" placeholder="N° remito"><input name="date" type="date"><input name="total" type="number" step="0.01" required placeholder="Total"><input name="description" placeholder="Detalle"><textarea name="notes" placeholder="Notas"></textarea><div class="v72-actions"><button type="button" data-close>Cancelar</button><button>Guardar</button></div></form></dialog><dialog id="v72PaymentDialog" class="v72-dialog"><form method="dialog" id="v72PaymentForm"><h3>Registrar pago</h3><input name="amount" type="number" step="0.01" required placeholder="Monto"><select name="method"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="mercadopago">Mercado Pago</option><option value="qr">QR</option><option value="cheque">Cheque</option><option value="other">Otro</option></select><input name="date" type="date"><select name="receiptId"><option value="">A cuenta general</option>${(s.receipts||[]).filter(r=>r.balance>0).map(r=>`<option value="${r.id}">Remito ${esc(r.number||'s/n')} · saldo ${money(r.balance)}</option>`).join('')}</select><input name="reference" placeholder="Referencia"><textarea name="notes" placeholder="Notas"></textarea><div class="v72-actions"><button type="button" data-close>Cancelar</button><button>Guardar</button></div></form></dialog>`;
  $('#v72AddReceipt').onclick=()=>$('#v72ReceiptDialog').showModal();
  $('#v72AddPayment').onclick=()=>$('#v72PaymentDialog').showModal();
  $$('#v72SupplierDetail [data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('#v72ReceiptForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/admin/suppliers/${id}/receipts`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) });await loadSuppliers()}catch(x){alert(x.message)}};
  $('#v72PaymentForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/admin/suppliers/${id}/payments`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) });await loadSuppliers()}catch(x){alert(x.message)}};
 }catch(e){el.innerHTML=`<div class="v72-note">${esc(e.message)}</div>`}
}
async function refreshOnce(){
 if(!$('#admin')?.classList.contains('active')||!token())return;
 mapOriginalSections(); makeSidebar(); ensureNewPanels();
 try{dashboard=await api('/api/admin/dashboard');renderClients();}catch(e){console.warn('V7.2 dashboard:',e)}
 await loadSuppliers();
}
function setAdminMode(on){
 document.body.classList.toggle('v72-admin-mode',on);
 if(on){mapOriginalSections();makeSidebar();ensureNewPanels();setTimeout(refreshOnce,150)}
}
document.addEventListener('DOMContentLoaded',()=>{
 document.addEventListener('click',e=>{
   const b=e.target.closest('[data-view]');
   if(!b)return;
   setTimeout(()=>setAdminMode(b.dataset.view==='admin'),80);
 });
 if($('#admin')?.classList.contains('active'))setAdminMode(true);
 $('#refreshAdmin')?.addEventListener('click',()=>setTimeout(refreshOnce,250));
});
})();
