from pathlib import Path
import re, shutil, datetime, sys

ROOT=Path.cwd()
server=ROOT/'server.js'; index=ROOT/'public/index.html'; app=ROOT/'public/app.js'; sw=ROOT/'public/service-worker.js'
required=[server,index,app,sw,ROOT/'public/admin-v6.js',ROOT/'public/admin-v6.css']
missing=[str(p) for p in required if not p.exists()]
if missing:
    print('ERROR: faltan archivos:', *missing, sep='\n - '); sys.exit(1)

# Transactional reads
S=server.read_text(encoding='utf-8'); H=index.read_text(encoding='utf-8'); A=app.read_text(encoding='utf-8'); W=sw.read_text(encoding='utf-8')
if 'FROSTLAND_V6_SALES_NAV' in S:
    print('V6 ya parece instalada. No se hicieron cambios.'); sys.exit(0)

checks={
 'ruta apertura de caja': "app.post('/api/admin/shifts/open'" in S,
 'ruta pedidos': "app.post('/api/orders'" in S,
 'emisión nuevo pedido': "io.to('staff').emit('admin:new-order'" in S,
 'formulario apertura': 'id="openShiftForm"' in H,
 'función openShift': 'async function openShift' in A,
}
bad=[k for k,v in checks.items() if not v]
if bad:
    print('ERROR: esta versión no coincide con la base esperada. No se modificó nada.')
    print('Faltan:', ', '.join(bad)); sys.exit(2)

stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
bdir=ROOT/f'backup-v6-{stamp}'; (bdir/'public').mkdir(parents=True)
for p in [server,index,app,sw]: shutil.copy2(p,bdir/('public/'+p.name if p.parent.name=='public' else p.name))
print('Backup creado en', bdir)

helper=r'''
// FROSTLAND_V6_SALES_NAV
function frostlandSalesRange(db, shiftId) {
  if (shiftId) {
    const shift = (db.cashShifts || []).find(s => s.id === shiftId);
    if (!shift) return null;
    return { shift, start: new Date(shift.openedAt).getTime(), end: new Date(shift.closedAt || now()).getTime(), label: `${shift.employeeName || 'Turno'} · ${new Date(shift.openedAt).toLocaleDateString('es-AR')}` };
  }
  const active = (db.cashShifts || []).find(s => !s.closedAt);
  if (active) return { shift: active, start: new Date(active.openedAt).getTime(), end: Date.now(), label: `Turno actual · ${active.employeeName || ''}` };
  const arDate = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const start = new Date(`${arDate}T00:00:00-03:00`).getTime();
  return { shift: null, start, end: start + 86400000 - 1, label: `Hoy · ${arDate}` };
}
function buildSalesSnapshot(db, shiftId) {
  const range = frostlandSalesRange(db, shiftId); if (!range) return null;
  const orders = (db.orders || []).filter(o => { const t=new Date(o.createdAt).getTime(); return t>=range.start && t<=range.end && o.status!=='cancelled'; }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const paidStatuses = new Set(['approved']);
  const customersMap = new Map();
  for (const o of orders) {
    const key = o.userId || o.customer?.email || o.customer?.phone || o.customer?.name || o.id;
    const c = customersMap.get(key) || { id:key, name:o.customer?.name||'Cliente', email:o.customer?.email||'', phone:o.customer?.phone||'', ordersCount:0, total:0, paid:0, lastOrderAt:o.createdAt };
    c.ordersCount++; c.total += Number(o.total||0); if (paidStatuses.has(o.paymentStatus)) c.paid += Number(o.total||0); if(String(o.createdAt)>String(c.lastOrderAt))c.lastOrderAt=o.createdAt; customersMap.set(key,c);
  }
  const totalSales=orders.reduce((a,o)=>a+Number(o.total||0),0), paidTotal=orders.filter(o=>paidStatuses.has(o.paymentStatus)).reduce((a,o)=>a+Number(o.total||0),0);
  const expenses=(db.expenses||[]).filter(e=>{const t=new Date(e.createdAt).getTime();return t>=range.start&&t<=range.end});
  return { label:range.label, shiftId:range.shift?.id||null, from:new Date(range.start).toISOString(), to:new Date(range.end).toISOString(), ordersCount:orders.length, customersCount:customersMap.size, totalSales, paidTotal, pendingTotal:Math.max(0,totalSales-paidTotal), totalExpenses:expenses.reduce((a,e)=>a+Number(e.amount||0),0), customers:[...customersMap.values()].sort((a,b)=>b.total-a.total), orders };
}
app.get('/api/admin/sales-summary', auth, role('admin','employee'), (req,res)=>{
  const shiftId=String(req.query.shiftId||'').trim();
  if(shiftId){const shift=(req.db.cashShifts||[]).find(s=>s.id===shiftId);if(!shift)return res.status(404).json({error:'Cierre de caja no encontrado.'});if(shift.salesSnapshot)return res.json(shift.salesSnapshot);}
  const summary=buildSalesSnapshot(req.db,shiftId||null); if(!summary)return res.status(404).json({error:'Período no encontrado.'}); res.json(summary);
});
'''
pos=S.find("app.post('/api/admin/shifts/open'"); S=S[:pos]+helper+'\n'+S[pos:]
S=S.replace("paymentStatus: paymentMethod === 'cash' ? 'pending_cash' : 'pending'", "paymentStatus: paymentMethod === 'cash' ? 'pending_cash' : (['qr','transfer'].includes(paymentMethod) ? 'pending_local' : 'pending')",1)
emit="io.to('staff').emit('admin:new-order', { order: { id: order.id, code: order.code, total: order.total, paymentMethod: order.paymentMethod, createdAt: order.createdAt } });"
if 'FROSTLAND_V6_TRANSFER_WHATSAPP' not in S:
    insert=emit+"\n\n    // FROSTLAND_V6_TRANSFER_WHATSAPP\n    if (paymentMethod === 'transfer') {\n      const wa = String(req.db.settings?.whatsappNumber || '').replace(/\\D/g,'');\n      const msg = `Ya hice el pedido ${order.code} desde la web por ${money(order.total)}. Pasame el alias para abonar por favor.`;\n      const whatsappUrl = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : null;\n      return res.status(201).json({ order, checkoutUrl: whatsappUrl, warning: whatsappUrl ? undefined : 'Pedido recibido. Falta configurar el WhatsApp del local.' });\n    }"
    S=S.replace(emit,insert,1)
old="const shift={id:uid(),employeeId:req.user.id,employeeName:req.user.name,openingCash:money(req.body.openingCash),openedAt:now(),closedAt:null};"
if old in S:
    S=S.replace(old,"const allowedNames=['Nadia','Candela','Daniela']; const requestedName=String(req.body.employeeName||'').trim(); const employeeName=allowedNames.includes(requestedName)?requestedName:req.user.name; const shift={id:uid(),employeeId:req.user.id,employeeName,openingCash:money(req.body.openingCash),openedAt:now(),closedAt:null};",1)
old2="const totals=shiftTotals(req.db,shift); shift.countedCash=money(req.body.countedCash); shift.closedAt=now(); shift.closedBy={id:req.user.id,name:req.user.name}; shift.totals=totals;"
if old2 in S:
    S=S.replace(old2,"const totals=shiftTotals(req.db,shift); shift.countedCash=money(req.body.countedCash); shift.closedAt=now(); shift.closedBy={id:req.user.id,name:req.user.name}; shift.totals=totals; shift.salesSnapshot=buildSalesSnapshot(req.db,shift.id);",1)

if '/admin-v6.css' not in H: H=H.replace('</head>','<link rel="stylesheet" href="/admin-v6.css">\n</head>',1)
if '/admin-v6.js' not in H: H=H.replace('</body>','<script src="/admin-v6.js"></script>\n</body>',1)
if 'name="employeeName"' not in H:
    H=H.replace('<form id="openShiftForm" class="inline-admin-form"><label>Efectivo inicial','<form id="openShiftForm" class="inline-admin-form"><label>Persona de turno<select name="employeeName" required><option>Nadia</option><option>Candela</option><option>Daniela</option></select></label><label>Efectivo inicial',1)
A=A.replace("pending_cash:'Pendiente en efectivo',rejected", "pending_cash:'Pendiente en efectivo',pending_local:'Pendiente en el local',rejected",1)
A=A.replace("body:JSON.stringify({openingCash:Number(e.target.openingCash.value)})", "body:JSON.stringify({employeeName:e.target.employeeName?.value||'',openingCash:Number(e.target.openingCash.value)})",1)
W=re.sub(r"const CACHE='[^']+'", "const CACHE='frostland-v6-admin-ventas'", W, count=1)
if "'/admin-v6.css'" not in W: W=W.replace("'/app.js'", "'/app.js','/admin-v6.css','/admin-v6.js'",1)

server.write_text(S,encoding='utf-8'); index.write_text(H,encoding='utf-8'); app.write_text(A,encoding='utf-8'); sw.write_text(W,encoding='utf-8')
print('V6 aplicada. data/db.json y .env NO fueron modificados.')
print('Backup:', bdir)
