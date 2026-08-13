from pathlib import Path
from datetime import datetime
import shutil, re, sys

ROOT=Path.cwd()
SERVER=ROOT/"server.js"; INDEX=ROOT/"public"/"index.html"; SW=ROOT/"public"/"service-worker.js"
SRC=Path(__file__).resolve().parent
for p in [SERVER,INDEX,SW]:
    if not p.exists():
        print("ERROR: falta",p); sys.exit(1)

stamp=datetime.now().strftime("%Y%m%d-%H%M%S")
backup=ROOT/f"backup-v7-{stamp}"; backup.mkdir(exist_ok=True)
for p in [SERVER,INDEX,SW,ROOT/"public"/"admin-v7.js",ROOT/"public"/"admin-v7.css"]:
    if p.exists():
        dest=backup/p.relative_to(ROOT); dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,dest)
print("Backup creado en",backup)

for name in ["admin-v7.js","admin-v7.css"]:
    src=SRC/"public"/name; dst=ROOT/"public"/name
    if src.resolve()!=dst.resolve():
        shutil.copy2(src,dst)
    elif not dst.exists():
        print("ERROR: falta",dst); sys.exit(1)

server=SERVER.read_text(encoding="utf-8")
marker="FROSTLAND_V7_PROVEEDORES"
routes="\n// FROSTLAND_V7_PROVEEDORES\nfunction ensureSupplierCollections(db){\n  if(!Array.isArray(db.suppliers)) db.suppliers=[];\n  if(!Array.isArray(db.supplierReceipts)) db.supplierReceipts=[];\n  if(!Array.isArray(db.supplierPayments)) db.supplierPayments=[];\n}\nfunction supplierSummary(db,s){\n  ensureSupplierCollections(db);\n  const receipts=db.supplierReceipts.filter(r=>r.supplierId===s.id);\n  const payments=db.supplierPayments.filter(p=>p.supplierId===s.id);\n  const purchased=receipts.reduce((a,r)=>a+Number(r.total||0),0);\n  const paid=payments.reduce((a,p)=>a+Number(p.amount||0),0);\n  return {...s,purchased,paid,balance:purchased-paid,receiptsCount:receipts.length,paymentsCount:payments.length};\n}\napp.get('/api/admin/suppliers', auth, role('admin','employee'), (req,res)=>{\n  ensureSupplierCollections(req.db);\n  res.json(req.db.suppliers.map(s=>supplierSummary(req.db,s)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es')));\n});\napp.post('/api/admin/suppliers', auth, role('admin','employee'), async (req,res)=>{\n  ensureSupplierCollections(req.db);\n  const name=String(req.body.name||'').trim(); if(!name)return res.status(400).json({error:'Ingresá el nombre del proveedor.'});\n  const supplier={id:uid(),name,contact:String(req.body.contact||'').trim(),phone:String(req.body.phone||'').trim(),email:String(req.body.email||'').trim(),cuit:String(req.body.cuit||'').trim(),notes:String(req.body.notes||'').trim(),createdAt:now(),updatedAt:now()};\n  req.db.suppliers.push(supplier); await writeDb(req.db); res.status(201).json(supplierSummary(req.db,supplier));\n});\napp.put('/api/admin/suppliers/:id', auth, role('admin','employee'), async (req,res)=>{\n  ensureSupplierCollections(req.db); const s=req.db.suppliers.find(x=>x.id===req.params.id); if(!s)return res.status(404).json({error:'Proveedor no encontrado.'});\n  for(const k of ['name','contact','phone','email','cuit','notes']) if(req.body[k]!==undefined)s[k]=String(req.body[k]||'').trim();\n  s.updatedAt=now(); await writeDb(req.db); res.json(supplierSummary(req.db,s));\n});\napp.get('/api/admin/suppliers/:id', auth, role('admin','employee'), (req,res)=>{\n  ensureSupplierCollections(req.db); const s=req.db.suppliers.find(x=>x.id===req.params.id); if(!s)return res.status(404).json({error:'Proveedor no encontrado.'});\n  const receipts=req.db.supplierReceipts.filter(r=>r.supplierId===s.id).sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt)));\n  const payments=req.db.supplierPayments.filter(p=>p.supplierId===s.id).sort((a,b)=>String(b.date||b.createdAt).localeCompare(String(a.date||a.createdAt)));\n  const receiptRows=receipts.map(r=>{const paid=payments.filter(p=>p.receiptId===r.id).reduce((a,p)=>a+Number(p.amount||0),0);return {...r,paid,balance:Number(r.total||0)-paid,status:paid<=0?'pending':paid>=Number(r.total||0)?'paid':'partial'}});\n  res.json({...supplierSummary(req.db,s),receipts:receiptRows,payments});\n});\napp.post('/api/admin/suppliers/:id/receipts', auth, role('admin','employee'), async (req,res)=>{\n  ensureSupplierCollections(req.db); const s=req.db.suppliers.find(x=>x.id===req.params.id); if(!s)return res.status(404).json({error:'Proveedor no encontrado.'});\n  const total=Math.max(0,Number(req.body.total)||0); if(!total)return res.status(400).json({error:'Ingresá el total del remito.'});\n  const r={id:uid(),supplierId:s.id,number:String(req.body.number||'').trim(),date:String(req.body.date||'').trim()||now(),total,description:String(req.body.description||'').trim(),notes:String(req.body.notes||'').trim(),createdBy:{id:req.user.id,name:req.user.name},createdAt:now()};\n  req.db.supplierReceipts.push(r); await writeDb(req.db); res.status(201).json(r);\n});\napp.post('/api/admin/suppliers/:id/payments', auth, role('admin','employee'), async (req,res)=>{\n  ensureSupplierCollections(req.db); const s=req.db.suppliers.find(x=>x.id===req.params.id); if(!s)return res.status(404).json({error:'Proveedor no encontrado.'});\n  const amount=Math.max(0,Number(req.body.amount)||0); if(!amount)return res.status(400).json({error:'Ingresá el monto entregado.'});\n  const methods=['cash','transfer','mercadopago','qr','cheque','other']; const method=methods.includes(req.body.method)?req.body.method:'other';\n  const receiptId=String(req.body.receiptId||'').trim()||null;\n  if(receiptId&&!req.db.supplierReceipts.some(r=>r.id===receiptId&&r.supplierId===s.id))return res.status(400).json({error:'El remito seleccionado no pertenece al proveedor.'});\n  const p={id:uid(),supplierId:s.id,receiptId,amount,method,reference:String(req.body.reference||'').trim(),date:String(req.body.date||'').trim()||now(),notes:String(req.body.notes||'').trim(),createdBy:{id:req.user.id,name:req.user.name},createdAt:now()};\n  req.db.supplierPayments.push(p); await writeDb(req.db); res.status(201).json(p);\n});\n"
if marker not in server:
    pos=server.find("app.get('/{*splat}'")
    if pos==-1:
        print("ERROR: no encontré el punto seguro antes del catch-all."); sys.exit(1)
    server=server[:pos]+routes+"\n\n"+server[pos:]
    SERVER.write_text(server,encoding="utf-8")
    print("Backend proveedores agregado.")
else: print("Backend proveedores ya instalado.")

index=INDEX.read_text(encoding="utf-8")
if "admin-v7.css" not in index:index=index.replace("</head>",'<link rel="stylesheet" href="/admin-v7.css?v=7"></head>',1)
if "admin-v7.js" not in index:index=index.replace("</body>",'<script src="/admin-v7.js?v=7"></script></body>',1)
INDEX.write_text(index,encoding="utf-8")

sw=SW.read_text(encoding="utf-8"); version=f"frostland-v7-{stamp}"
sw2,n=re.subn(r"""const CACHE\s*=\s*['"][^'"]+['"]""",f'const CACHE = "{version}"',sw,count=1)
if n==0:sw2,n=re.subn(r"""const CACHE_NAME\s*=\s*['"][^'"]+['"]""",f'const CACHE_NAME = "{version}"',sw,count=1)
if n:SW.write_text(sw2,encoding="utf-8")

print("FROSTLAND V7 aplicada correctamente.")
print("NO se modificaron .env ni data/db.json.")
print("Se conservaron los módulos existentes.")
print("Nuevo: menú lateral + clientes ordenados + proveedores/remitos/pagos.")
