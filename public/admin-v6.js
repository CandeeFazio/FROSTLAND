(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const token=()=>localStorage.getItem('token');
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url){const r=await fetch(url,{headers:{Authorization:`Bearer ${token()}`}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Error ${r.status}`);return d}
function panelByTitle(text){return $$('.panel').find(p=>(p.querySelector('h2')?.textContent||'').trim().toLowerCase().startsWith(text.toLowerCase()))}
function prepareSections(){
 const admin=$('#admin'); if(!admin)return;
 admin.id='admin';
 const map=[['Pedidos','admin-pedidos'],['Configuración y horarios','admin-config'],['Caja y turnos','admin-caja'],['Flyer promocional','admin-banners'],['Contenido de la página','admin-contenido'],['Productos y precios','admin-precios'],['Stock privado de baldes','admin-stock']];
 for(const [title,id] of map){const p=panelByTitle(title);if(p)p.id=id}
}
function ensureMenu(){
 const admin=$('#admin'); if(!admin||$('#adminQuickMenu'))return;
 const head=admin.querySelector('.admin-head'); if(!head)return;
 const nav=document.createElement('div');nav.id='adminQuickMenu';nav.className='admin-quick-menu';
 nav.innerHTML=`<label><span>Ir a</span><select id="adminSectionSelect"><option value="admin-ventas">Ventas y clientes</option><option value="admin-pedidos">Pedidos</option><option value="admin-caja">Caja</option><option value="admin-stock">Stock y sabores</option><option value="admin-precios">Productos y precios</option><option value="admin-banners">Flyer / banners</option><option value="admin-contenido">Contenido web</option><option value="admin-config">Horarios y configuración</option></select></label><button id="adminGoSection" type="button">Ir</button>`;
 head.insertAdjacentElement('afterend',nav);
 const go=()=>{const id=$('#adminSectionSelect').value;document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})};
 $('#adminGoSection').onclick=go;$('#adminSectionSelect').onchange=go;
}
function ensureSalesPanel(){
 if($('#admin-ventas'))return;
 const admin=$('#admin'),stats=$('#stats'); if(!admin||!stats)return;
 const p=document.createElement('div');p.className='panel admin-sales-panel';p.id='admin-ventas';
 p.innerHTML=`<div class="panel-title"><div><h2>Ventas y clientes del turno</h2><p>El turno actual muestra solo sus ventas. Los cierres anteriores quedan guardados para consultar sin mezclar días.</p></div></div><div class="sales-toolbar"><label>Período<select id="salesPeriod"><option value="current">Turno actual / hoy</option></select></label><button id="refreshSales" type="button">Actualizar</button></div><div id="salesStats" class="stats"></div><div class="sales-grid"><div><h3>Clientes</h3><div id="salesCustomers" class="sales-list"></div></div><div><h3>Pedidos</h3><div id="salesOrders" class="sales-list"></div></div></div>`;
 stats.insertAdjacentElement('afterend',p);$('#refreshSales').onclick=loadSales;$('#salesPeriod').onchange=loadSales;
}
function statusText(o){const m={approved:'Pagado',pending:'Pendiente',pending_cash:'Pendiente efectivo',pending_local:'Pendiente en local',rejected:'Rechazado',refunded:'Reintegrado'};return m[o.paymentStatus]||o.paymentStatus||'Pendiente'}
async function fillShiftOptions(){try{const d=await api('/api/admin/dashboard');const sel=$('#salesPeriod');if(!sel)return;const keep=sel.value;sel.innerHTML='<option value="current">Turno actual / hoy</option>'+((d.shifts||[]).filter(s=>s.closedAt).slice(0,60).map(s=>`<option value="${esc(s.id)}">${new Date(s.openedAt).toLocaleDateString('es-AR')} · ${esc(s.employeeName||'Turno')} · cerrado</option>`).join(''));if([...sel.options].some(o=>o.value===keep))sel.value=keep}catch(e){console.warn('Turnos:',e)}}
async function loadSales(){
 const stats=$('#salesStats'),customers=$('#salesCustomers'),orders=$('#salesOrders');if(!stats||!customers||!orders||!token())return;
 try{const val=$('#salesPeriod')?.value||'current';const q=val==='current'?'':`?shiftId=${encodeURIComponent(val)}`;const d=await api('/api/admin/sales-summary'+q);
 stats.innerHTML=[['Pedidos',d.ordersCount],['Clientes',d.customersCount],['Vendido',money(d.totalSales)],['Cobrado',money(d.paidTotal)],['Pendiente',money(d.pendingTotal)],['Gastos',money(d.totalExpenses||0)]].map(([a,b])=>`<div class="stat"><span>${a}</span><strong>${b}</strong></div>`).join('');
 customers.innerHTML=(d.customers||[]).map(c=>`<article class="sales-row"><div><b>${esc(c.name||'Cliente')}</b><small>${esc(c.phone||'sin teléfono')} · ${esc(c.email||'sin email')}</small></div><div><strong>${money(c.total)}</strong><small>${c.ordersCount} pedido${c.ordersCount===1?'':'s'}</small></div></article>`).join('')||'<p>Sin clientes en este período.</p>';
 orders.innerHTML=(d.orders||[]).map(o=>`<article class="sales-row"><div><b>${esc(o.code)}</b><small>${esc(o.customer?.name||'Cliente')} · ${new Date(o.createdAt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</small></div><div><strong>${money(o.total)}</strong><small>${esc(statusText(o))}</small></div></article>`).join('')||'<p>Sin pedidos en este período.</p>';
 }catch(e){stats.innerHTML=`<p class="admin-error">No se pudieron cargar las ventas: ${esc(e.message)}</p>`}
}
async function refreshAll(){prepareSections();ensureMenu();ensureSalesPanel();await fillShiftOptions();await loadSales()}
document.addEventListener('DOMContentLoaded',()=>{refreshAll();new MutationObserver(()=>{if($('#admin')?.classList.contains('active'))refreshAll()}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});$('#refreshAdmin')?.addEventListener('click',()=>setTimeout(refreshAll,400));});
})();
