from pathlib import Path
from datetime import datetime
import shutil, re, sys

ROOT=Path.cwd()
server=ROOT/'server.js'; app=ROOT/'public'/'app.js'; index=ROOT/'public'/'index.html'; sw=ROOT/'public'/'service-worker.js'
for p in (server,app,index,sw):
    if not p.exists():
        print(f'ERROR: no encuentro {p}. Ejecutá este instalador desde la carpeta raíz de FROSTLAND.')
        sys.exit(1)

S=server.read_text(encoding='utf-8')
A=app.read_text(encoding='utf-8')
I=index.read_text(encoding='utf-8')
W=sw.read_text(encoding='utf-8')

if 'FROSTLAND_V61_CANCEL_ARCHIVE_PRINT' in S and 'FROSTLAND_V61_ALARM_PRINT' in A:
    print('V6.1 ya parece instalada. No se hicieron cambios.')
    sys.exit(0)

stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
backup=ROOT/f'backup-v61-{stamp}'
(backup/'public').mkdir(parents=True)
shutil.copy2(server,backup/'server.js'); shutil.copy2(app,backup/'public'/'app.js'); shutil.copy2(index,backup/'public'/'index.html'); shutil.copy2(sw,backup/'public'/'service-worker.js')
print('Backup creado en', backup)

# --- Backend: dashboard totals only non-cancelled/non-archived + hide archived from list ---
old="""app.get('/api/admin/dashboard', auth, role('admin','employee'), (req, res) => {\n  const orders = req.db.orders;\n  const paid = orders.filter(o => o.paymentStatus === 'approved' || o.paymentMethod === 'cash');\n  res.json({ totals: { orders: orders.length, sales: paid.reduce((a,o)=>a+o.total,0), customers: req.db.users.filter(u=>u.role==='customer').length, pending: orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length }, orders: orders.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), users: req.db.users.map(publicUser), products: req.db.products, flavors: req.db.flavors, settings: req.db.settings, activeShift: req.db.cashShifts.find(s=>!s.closedAt)||null, shifts: req.db.cashShifts.slice().sort((a,b)=>b.openedAt.localeCompare(a.openedAt)).slice(0,30), expenses: req.db.expenses.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100) });\n});"""
new="""app.get('/api/admin/dashboard', auth, role('admin','employee'), (req, res) => {\n  const allOrders = Array.isArray(req.db.orders) ? req.db.orders : [];\n  const orders = allOrders.filter(o => !o.archivedAt);\n  const validOrders = orders.filter(o => o.status !== 'cancelled');\n  const paid = validOrders.filter(o => o.paymentStatus === 'approved' || o.paymentMethod === 'cash');\n  res.json({ totals: { orders: validOrders.length, sales: paid.reduce((a,o)=>a+Number(o.total||0),0), customers: req.db.users.filter(u=>u.role==='customer').length, pending: validOrders.filter(o=>!['delivered','cancelled'].includes(o.status)).length }, orders: orders.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), users: req.db.users.map(publicUser), products: req.db.products, flavors: req.db.flavors, settings: req.db.settings, activeShift: req.db.cashShifts.find(s=>!s.closedAt)||null, shifts: req.db.cashShifts.slice().sort((a,b)=>b.openedAt.localeCompare(a.openedAt)).slice(0,30), expenses: req.db.expenses.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100) });\n});"""
if old in S:
    S=S.replace(old,new,1)
else:
    # fallback specific one-line totals if previous defensive version exists
    S=S.replace("const orders = req.db.orders;\n  const paid = orders.filter(o => o.paymentStatus === 'approved' || o.paymentMethod === 'cash');", "const allOrders = Array.isArray(req.db.orders) ? req.db.orders : [];\n  const orders = allOrders.filter(o => !o.archivedAt);\n  const validOrders = orders.filter(o => o.status !== 'cancelled');\n  const paid = validOrders.filter(o => o.paymentStatus === 'approved' || o.paymentMethod === 'cash');",1)
    S=S.replace("totals: { orders: orders.length, sales: paid.reduce((a,o)=>a+o.total,0), customers:", "totals: { orders: validOrders.length, sales: paid.reduce((a,o)=>a+Number(o.total||0),0), customers:",1)
    S=S.replace("pending: orders.filter(o=>!['delivered','cancelled'].includes(o.status)).length", "pending: validOrders.filter(o=>!['delivered','cancelled'].includes(o.status)).length",1)

# Ensure V6 sales summary excludes cancelled + archived.
S=S.replace("return t>=range.start && t<=range.end && o.status!=='cancelled';", "return t>=range.start && t<=range.end && o.status!=='cancelled' && !o.archivedAt;",1)

# Add archive endpoint after cancel endpoint, without deleting data.
marker="// FROSTLAND_V6_SALES_NAV"
archive_code="""
// FROSTLAND_V61_CANCEL_ARCHIVE_PRINT
app.post('/api/admin/orders/:id/archive', auth, role('admin','employee'), async (req,res)=>{
  const order=(req.db.orders||[]).find(o=>o.id===req.params.id); if(!order)return res.status(404).json({error:'Pedido no encontrado.'});
  if(order.status!=='cancelled')return res.status(400).json({error:'Solo se pueden archivar pedidos cancelados.'});
  order.archivedAt=now(); order.archivedBy={id:req.user.id,name:req.user.name}; order.updatedAt=now();
  audit(req.db,req.user,'order.archive',{orderId:order.id,code:order.code}); await writeDb(req.db);
  res.json({ok:true,orderId:order.id});
});

"""
if 'FROSTLAND_V61_CANCEL_ARCHIVE_PRINT' not in S:
    if marker in S: S=S.replace(marker,archive_code+marker,1)
    else: S += '\n'+archive_code

# --- Frontend: alarm button accepts + prints; archive cancelled orders ---
# State variable for alarm order
A=A.replace("let v4Bound=false;let alarmTimer=null;let audioCtx=null;", "let v4Bound=false;let alarmTimer=null;let audioCtx=null;let currentAlarmOrderId=null; // FROSTLAND_V61_ALARM_PRINT",1)
# Button handler
A=A.replace("$('#closeOrderAlarm')?.addEventListener('click',stopOrderAlarm);", "$('#closeOrderAlarm')?.addEventListener('click',acceptAlarmOrderAndPrint);",1)
# Alarm stores id
A=A.replace("function startOrderAlarm(order){beep();clearInterval(alarmTimer);", "function startOrderAlarm(order){currentAlarmOrderId=order?.id||null;beep();clearInterval(alarmTimer);",1)
# stop clears id only when explicitly done after accept? Keep function from clearing to avoid race; add helper.
needle="function stopOrderAlarm(){clearInterval(alarmTimer);alarmTimer=null;$('#orderAlarm').hidden=true}"
replace="function stopOrderAlarm(){clearInterval(alarmTimer);alarmTimer=null;$('#orderAlarm').hidden=true}\nasync function acceptAlarmOrderAndPrint(){const id=currentAlarmOrderId;if(!id){stopOrderAlarm();return toast('No se encontró el pedido de la alarma')}currentAlarmOrderId=null;await acceptOrder(id)}"
if needle in A: A=A.replace(needle,replace,1)

# Bind archive buttons
A=A.replace("function bindOrderControlButtons(){$$('[data-accept-order]').forEach(b=>b.onclick=()=>acceptOrder(b.dataset.acceptOrder));$$('[data-cancel-order]').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancelOrder))}",
"function bindOrderControlButtons(){$$('[data-accept-order]').forEach(b=>b.onclick=()=>acceptOrder(b.dataset.acceptOrder));$$('[data-cancel-order]').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancelOrder));$$('[data-archive-order]').forEach(b=>b.onclick=()=>archiveOrder(b.dataset.archiveOrder))}",1)
# archive function after cancelOrder
cancel_line="async function cancelOrder(id){const reason=prompt('Motivo de cancelación:','Sin stock disponible');if(reason===null)return;if(!confirm('¿Confirmás la cancelación? Si se pagó con Mercado Pago se solicitará el reintegro.'))return;try{const o=await api(`/api/admin/orders/${id}/cancel`,{method:'POST',body:JSON.stringify({reason})});toast(o.refund?.status==='failed'?`Pedido cancelado; revisar reintegro: ${o.refund.detail}`:'Pedido cancelado');await loadAdmin()}catch(e){toast(e.message)}}"
archive_fn="async function archiveOrder(id){if(!confirm('¿Ocultar este pedido cancelado del panel? El registro NO se borra y queda guardado en la base.'))return;try{await api(`/api/admin/orders/${id}/archive`,{method:'POST',body:'{}'});toast('Pedido cancelado archivado');await loadAdmin()}catch(e){toast(e.message)}}"
if cancel_line in A and 'async function archiveOrder' not in A:
    A=A.replace(cancel_line,cancel_line+'\n'+archive_fn,1)

# Add archive button to cancelled orders
oldbtn="${!['delivered','cancelled'].includes(o.status)?`<button class=\"mini danger\" data-cancel-order=\"${o.id}\">Cancelar</button>`:''}"
newbtn="${!['delivered','cancelled'].includes(o.status)?`<button class=\"mini danger\" data-cancel-order=\"${o.id}\">Cancelar</button>`:o.status==='cancelled'?`<button class=\"mini danger\" data-archive-order=\"${o.id}\">Archivar cancelado</button>`:''}"
A=A.replace(oldbtn,newbtn,1)

# Alarm button label, if exact current HTML exists
I=I.replace('<button id="closeOrderAlarm" type="button">Silenciar</button>', '<button id="closeOrderAlarm" type="button">Aceptar · imprimir 2 tickets</button>',1)

# Cache bump
if "frostland-v61-operativo" not in W:
    W=re.sub(r"const CACHE\s*=\s*['\"][^'\"]+['\"]", "const CACHE = 'frostland-v61-operativo'", W, count=1)

server.write_text(S,encoding='utf-8'); app.write_text(A,encoding='utf-8'); index.write_text(I,encoding='utf-8'); sw.write_text(W,encoding='utf-8')
print('V6.1 aplicada.')
print('NO se modificaron .env ni data/db.json.')
print('Los pedidos cancelados se archivan, NO se borran físicamente.')
print('Backup:',backup)
