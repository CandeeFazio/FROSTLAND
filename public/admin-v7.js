(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const token=()=>localStorage.getItem('token');
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
const today=()=>todayKey(new Date());
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Error ${r.status}`);return d}
const statusLabel=s=>({received:'Recibido',confirmed:'Aceptado',preparing:'En preparación',ready:'Listo',on_the_way:'En camino',delivered:'Entregado',cancelled:'Cancelado'}[s]||s||'Sin estado');
const payLabel=s=>({approved:'Pagado',pending:'Pendiente',pending_cash:'Pendiente efectivo',pending_local:'Pendiente local',rejected:'Rechazado',refund_pending:'Reintegro pendiente',refunded:'Reintegrado'}[s]||s||'Pendiente');
let dash=null,suppliers=[],selectedSupplier=null,customerFilter='all',customerQuery='';

function findPanel(starts){return $$('.panel').find(p=>starts.some(t=>(p.querySelector('h2')?.textContent||'').trim().toLowerCase().startsWith(t)))}
function markExistingSections(){
 const map=[[['pedidos'],'v7-orders'],[['ventas y clientes'],'admin-ventas'],[['caja y turnos'],'v7-cash'],[['stock privado','stock'],'v7-stock'],[['productos y precios'],'v7-products'],[['flyer promocional'],'v7-banners'],[['contenido de la página','contenido'],'v7-content'],[['configuración y horarios'],'v7-settings']];
 map.forEach(([titles,id])=>{const p=findPanel(titles);if(p)p.id=id});
}
function ensureLayout(){
 const admin=$('#admin');if(!admin)return;
 markExistingSections();
 admin.classList.add('v7-admin');

 const oldContent=$('#v7AdminContent');
 if(oldContent){
   [...oldContent.children].forEach(x=>admin.insertBefore(x,oldContent));
   oldContent.remove();
 }

 let sidebar=$('#v7Sidebar');
 if(!sidebar){
   sidebar=document.createElement('aside');
   sidebar.id='v7Sidebar';
   sidebar.className='v7-sidebar';
   sidebar.innerHTML=`<div class="v7-side-head"><div class="v7-logo">F</div><div><b>FROSTLAND</b><small>Panel de gestión</small></div></div><nav>
   <button data-v7-target="v7-dashboard"><span>Inicio</span></button>
   <button data-v7-target="v7-orders"><span>Pedidos</span></button>
   <button data-v7-target="admin-ventas"><span>Ventas</span></button>
   <button data-v7-target="v7-cash"><span>Caja</span></button>
   <button data-v7-target="v7-customers"><span>Clientes</span></button>
   <button data-v7-target="v7-suppliers"><span>Proveedores</span></button>
   <button data-v7-target="v7-stock"><span>Stock y sabores</span></button>
   <button data-v7-target="v7-products"><span>Productos y precios</span></button>
   <button data-v7-target="v7-banners"><span>Banners</span></button>
   <button data-v7-target="v7-content"><span>Contenido</span></button>
   <button data-v7-target="v7-settings"><span>Horarios y config.</span></button>
   </nav>`;
   admin.insertBefore(sidebar,admin.firstChild);
 }

 const stats=$('#stats')||$('#v7-dashboard');
 if(stats)stats.id='v7-dashboard';

 $$('#v7Sidebar [data-v7-target]').forEach(b=>b.onclick=()=>{
   const target=document.getElementById(b.dataset.v7Target);
   if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
   $$('#v7Sidebar button').forEach(x=>x.classList.toggle('active',x===b));
 });

 $('#adminQuickMenu')?.classList.remove('v7-hide-quick');
 ensureCustomerPanel();
 ensureSupplierPanel();
}

function ensureCustomerPanel(){
 if($('#v7-customers'))return;
 const anchor=$('#admin-ventas')||$('#v7-dashboard');if(!anchor)return;
 const p=document.createElement('section');p.className='panel v7-panel';p.id='v7-customers';
 p.innerHTML=`<div class="v7-title"><div><p class="v7-kicker">CRM</p><h2>Clientes</h2><p>Historial, pedidos de hoy, activos, pendientes y compras anteriores.</p></div><div class="v7-badge" id="v7CustomerCount">0 clientes</div></div><div class="v7-customer-toolbar"><input id="v7CustomerSearch" placeholder="Buscar por nombre, teléfono o email"><div class="v7-tabs"><button data-cf="all" class="active">Todos</button><button data-cf="today">Pedidos hoy</button><button data-cf="active">Activos</button><button data-cf="pending">Pendientes</button><button data-cf="previous">Anteriores</button></div></div><div class="v7-customer-layout"><div id="v7CustomerList" class="v7-list"></div><div id="v7CustomerDetail" class="v7-detail"><div class="v7-empty">Elegí un cliente para ver su historial.</div></div></div>`;
 anchor.insertAdjacentElement('afterend',p);
 $('#v7CustomerSearch').oninput=e=>{customerQuery=e.target.value.toLowerCase();renderCustomers()};
 $$('#v7-customers [data-cf]').forEach(b=>b.onclick=()=>{customerFilter=b.dataset.cf;$$('#v7-customers [data-cf]').forEach(x=>x.classList.toggle('active',x===b));renderCustomers()});
}
function customerData(){
 if(!dash)return[];
 const users=(dash.users||[]).filter(u=>u.role==='customer'),orders=dash.orders||[];
 return users.map(u=>{const os=orders.filter(o=>o.userId===u.id||o.customer?.id===u.id||String(o.customer?.email||'').toLowerCase()===String(u.email||'').toLowerCase());const valid=os.filter(o=>o.status!=='cancelled');const todays=valid.filter(o=>todayKey(o.createdAt)===today());const active=valid.filter(o=>!['delivered','cancelled'].includes(o.status));const pending=active.filter(o=>o.paymentStatus!=='approved');const previous=valid.filter(o=>todayKey(o.createdAt)!==today());return {...u,orders:os,valid,todays,active,pending,previous,totalSpent:valid.filter(o=>o.paymentStatus==='approved'||o.status==='delivered').reduce((a,o)=>a+Number(o.total||0),0),lastOrder:valid.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null}});
}
function filterCustomers(c){const q=`${c.name||''} ${c.phone||''} ${c.email||''}`.toLowerCase();if(customerQuery&&!q.includes(customerQuery))return false;if(customerFilter==='today')return c.todays.length>0;if(customerFilter==='active')return c.active.length>0;if(customerFilter==='pending')return c.pending.length>0;if(customerFilter==='previous')return c.previous.length>0;return true}
function renderCustomers(){
 const list=$('#v7CustomerList');if(!list||!dash)return;
 const rows=customerData().filter(filterCustomers).sort((a,b)=>(b.lastOrder?.createdAt||'').localeCompare(a.lastOrder?.createdAt||''));
 $('#v7CustomerCount').textContent=`${rows.length} cliente${rows.length===1?'':'s'}`;
 list.innerHTML=rows.map(c=>`<button class="v7-customer-card" data-customer="${c.id}"><div><b>${esc(c.name||'Cliente')}</b><small>${esc(c.phone||'Sin teléfono')} · ${esc(c.email||'Sin email')}</small></div><div class="v7-mini-stats"><span>${c.valid.length} pedidos</span><strong>${money(c.totalSpent)}</strong></div><div class="v7-pills">${c.todays.length?`<i>${c.todays.length} hoy</i>`:''}${c.active.length?`<i>${c.active.length} activos</i>`:''}${c.pending.length?`<i class="warn">${c.pending.length} pendientes</i>`:''}</div></button>`).join('')||'<div class="v7-empty">No hay clientes para este filtro.</div>';
 $$('[data-customer]').forEach(b=>b.onclick=()=>renderCustomerDetail(b.dataset.customer));
}
function renderCustomerDetail(id){
 const c=customerData().find(x=>x.id===id),el=$('#v7CustomerDetail');if(!c||!el)return;
 const ordered=[...c.valid].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 el.innerHTML=`<div class="v7-detail-head"><div><p class="v7-kicker">CLIENTE</p><h3>${esc(c.name||'Cliente')}</h3><p>${esc(c.phone||'Sin teléfono')} · ${esc(c.email||'Sin email')}</p></div><strong>${money(c.totalSpent)}</strong></div><div class="v7-detail-stats"><span><b>${c.todays.length}</b> hoy</span><span><b>${c.active.length}</b> activos</span><span><b>${c.pending.length}</b> pendientes</span><span><b>${c.previous.length}</b> anteriores</span></div><h4>Historial de pedidos</h4><div class="v7-order-history">${ordered.map(o=>`<article><div><b>${esc(o.code||'Pedido')}</b><small>${new Date(o.createdAt).toLocaleString('es-AR')}</small></div><div><strong>${money(o.total)}</strong><small>${esc(statusLabel(o.status))} · ${esc(payLabel(o.paymentStatus))}</small></div></article>`).join('')||'<div class="v7-empty">Sin pedidos anteriores.</div>'}</div>`;
}
function ensureSupplierPanel(){
 if($('#v7-suppliers'))return;
 const anchor=$('#v7-customers')||$('#admin-ventas')||$('#v7-dashboard');if(!anchor)return;
 const p=document.createElement('section');p.className='panel v7-panel';p.id='v7-suppliers';
 p.innerHTML=`<div class="v7-title"><div><p class="v7-kicker">CUENTAS CORRIENTES</p><h2>Proveedores</h2><p>Remitos, pagos parciales, modalidad de pago y saldo pendiente por proveedor.</p></div><button id="v7NewSupplier">+ Nuevo proveedor</button></div><div class="v7-supplier-layout"><div><input id="v7SupplierSearch" class="v7-search" placeholder="Buscar proveedor"><div id="v7SupplierList" class="v7-list"></div></div><div id="v7SupplierDetail" class="v7-detail"><div class="v7-empty">Elegí un proveedor para ver remitos y pagos.</div></div></div><dialog id="v7SupplierDialog" class="v7-dialog"><form method="dialog" id="v7SupplierForm"><h3>Nuevo proveedor</h3><input name="name" required placeholder="Nombre / razón social"><input name="contact" placeholder="Contacto"><div class="v7-two"><input name="phone" placeholder="Teléfono"><input name="email" placeholder="Email"></div><input name="cuit" placeholder="CUIT"><textarea name="notes" placeholder="Notas"></textarea><div class="v7-actions"><button value="cancel" type="button" data-close>Cancelar</button><button value="default">Guardar proveedor</button></div></form></dialog>`;
 anchor.insertAdjacentElement('afterend',p);
 $('#v7NewSupplier').onclick=()=>$('#v7SupplierDialog').showModal();$('#v7SupplierDialog [data-close]').onclick=()=>$('#v7SupplierDialog').close();$('#v7SupplierForm').onsubmit=saveSupplier;$('#v7SupplierSearch').oninput=renderSupplierList;
}
async function loadSuppliers(){try{suppliers=await api('/api/admin/suppliers');renderSupplierList();if(selectedSupplier)await showSupplier(selectedSupplier)}catch(e){const el=$('#v7SupplierList');if(el)el.innerHTML=`<div class="v7-error">No se pudieron cargar proveedores: ${esc(e.message)}</div>`}}
function renderSupplierList(){const el=$('#v7SupplierList');if(!el)return;const q=String($('#v7SupplierSearch')?.value||'').toLowerCase();const rows=suppliers.filter(s=>`${s.name} ${s.contact} ${s.phone} ${s.cuit}`.toLowerCase().includes(q));el.innerHTML=rows.map(s=>`<button class="v7-supplier-card ${selectedSupplier===s.id?'active':''}" data-supplier="${s.id}"><div><b>${esc(s.name)}</b><small>${esc(s.contact||s.phone||'Sin contacto')}</small></div><div><strong class="${Number(s.balance)>0?'debt':''}">${money(s.balance)}</strong><small>Saldo</small></div></button>`).join('')||'<div class="v7-empty">No hay proveedores cargados.</div>';$$('[data-supplier]').forEach(b=>b.onclick=()=>showSupplier(b.dataset.supplier))}
async function saveSupplier(e){e.preventDefault();const form=e.currentTarget,b=Object.fromEntries(new FormData(form));try{const s=await api('/api/admin/suppliers',{method:'POST',body:JSON.stringify(b)});$('#v7SupplierDialog').close();form.reset();selectedSupplier=s.id;await loadSuppliers()}catch(err){alert(err.message)}}
async function showSupplier(id){
 selectedSupplier=id;renderSupplierList();const el=$('#v7SupplierDetail');if(!el)return;
 try{const s=await api(`/api/admin/suppliers/${id}`);const method=m=>({cash:'Efectivo',transfer:'Transferencia',mercadopago:'Mercado Pago',qr:'QR',cheque:'Cheque',other:'Otro'}[m]||m);
 el.innerHTML=`<div class="v7-detail-head"><div><p class="v7-kicker">PROVEEDOR</p><h3>${esc(s.name)}</h3><p>${esc(s.contact||'')} ${s.phone?'· '+esc(s.phone):''} ${s.cuit?'· CUIT '+esc(s.cuit):''}</p></div><strong class="${Number(s.balance)>0?'debt':''}">${money(s.balance)}</strong></div><div class="v7-detail-stats"><span><b>${money(s.purchased)}</b> remitos</span><span><b>${money(s.paid)}</b> entregado</span><span><b>${money(s.balance)}</b> pendiente</span></div><div class="v7-provider-actions"><button id="v7AddReceipt">+ Cargar remito</button><button id="v7AddPayment" class="secondary">+ Registrar pago</button></div><div class="v7-two-cols"><div><h4>Remitos</h4><div class="v7-order-history">${(s.receipts||[]).map(r=>`<article><div><b>Remito ${esc(r.number||'s/n')}</b><small>${new Date(r.date).toLocaleDateString('es-AR')} · ${esc(r.description||'')}</small></div><div><strong>${money(r.total)}</strong><small>${r.status==='paid'?'Pagado':r.status==='partial'?'Parcial':'Pendiente'} · saldo ${money(r.balance)}</small></div></article>`).join('')||'<div class="v7-empty">Sin remitos.</div>'}</div></div><div><h4>Pagos entregados</h4><div class="v7-order-history">${(s.payments||[]).map(p=>`<article><div><b>${esc(method(p.method))}</b><small>${new Date(p.date).toLocaleDateString('es-AR')} ${p.reference?'· '+esc(p.reference):''}</small></div><div><strong>${money(p.amount)}</strong><small>${esc(p.notes||'')}</small></div></article>`).join('')||'<div class="v7-empty">Sin pagos registrados.</div>'}</div></div></div><dialog id="v7ReceiptDialog" class="v7-dialog"><form method="dialog" id="v7ReceiptForm"><h3>Cargar remito</h3><div class="v7-two"><input name="number" placeholder="N° remito"><input name="date" type="date"></div><input name="total" type="number" min="0" step="0.01" required placeholder="Total del remito"><input name="description" placeholder="Detalle / mercadería"><textarea name="notes" placeholder="Notas"></textarea><div class="v7-actions"><button type="button" data-close>Cancelar</button><button>Guardar remito</button></div></form></dialog><dialog id="v7PaymentDialog" class="v7-dialog"><form method="dialog" id="v7PaymentForm"><h3>Registrar pago al proveedor</h3><input name="amount" type="number" min="0" step="0.01" required placeholder="Monto entregado"><div class="v7-two"><select name="method"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="mercadopago">Mercado Pago</option><option value="qr">QR</option><option value="cheque">Cheque</option><option value="other">Otro</option></select><input name="date" type="date"></div><select name="receiptId"><option value="">A cuenta general</option>${(s.receipts||[]).filter(r=>r.balance>0).map(r=>`<option value="${r.id}">Remito ${esc(r.number||'s/n')} · saldo ${money(r.balance)}</option>`).join('')}</select><input name="reference" placeholder="Referencia / comprobante"><textarea name="notes" placeholder="Notas"></textarea><div class="v7-actions"><button type="button" data-close>Cancelar</button><button>Registrar pago</button></div></form></dialog>`;
 $('#v7AddReceipt').onclick=()=>$('#v7ReceiptDialog').showModal();$('#v7AddPayment').onclick=()=>$('#v7PaymentDialog').showModal();$$('#v7SupplierDetail [data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 $('#v7ReceiptForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));try{await api(`/api/admin/suppliers/${id}/receipts`,{method:'POST',body:JSON.stringify(b)});await loadSuppliers()}catch(x){alert(x.message)}};
 $('#v7PaymentForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));try{await api(`/api/admin/suppliers/${id}/payments`,{method:'POST',body:JSON.stringify(b)});await loadSuppliers()}catch(x){alert(x.message)}};
 }catch(e){el.innerHTML=`<div class="v7-error">${esc(e.message)}</div>`}
}
async function refresh(){if(!token()||!$('#admin')?.classList.contains('active'))return;ensureLayout();try{dash=await api('/api/admin/dashboard');renderCustomers();await loadSuppliers()}catch(e){console.warn('V7:',e)}}
document.addEventListener('DOMContentLoaded',()=>{ensureLayout();refresh();new MutationObserver(()=>{if($('#admin')?.classList.contains('active'))refresh()}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});$('#refreshAdmin')?.addEventListener('click',()=>setTimeout(refresh,350));});
})();
