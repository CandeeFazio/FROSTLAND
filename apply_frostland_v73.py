from pathlib import Path
from datetime import datetime
import shutil, sys

ROOT = Path.cwd()
SERVER = ROOT / "server.js"
JS = ROOT / "public" / "admin-v72.js"
CSS = ROOT / "public" / "admin-v72.css"

for p in [SERVER, JS, CSS]:
    if not p.exists():
        print("ERROR: falta", p)
        sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f"backup-v73-{stamp}"
backup.mkdir(exist_ok=True)

for p in [SERVER, JS, CSS]:
    dest = backup / p.relative_to(ROOT)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)

print("Backup creado en:", backup)

server = SERVER.read_text(encoding="utf-8")
backend = "\n// FROSTLAND_V73_DELETE_SUPPLIERS\napp.delete('/api/admin/suppliers/:id', auth, role('admin'), async (req,res)=>{\n  ensureSupplierCollections(req.db);\n  const s=req.db.suppliers.find(x=>x.id===req.params.id);\n  if(!s)return res.status(404).json({error:'Proveedor no encontrado.'});\n\n  const receipts=req.db.supplierReceipts.filter(r=>r.supplierId===s.id);\n  const payments=req.db.supplierPayments.filter(p=>p.supplierId===s.id);\n\n  if(receipts.length || payments.length){\n    return res.status(409).json({\n      error:`No se puede eliminar ${s.name} porque tiene ${receipts.length} remito(s) y ${payments.length} pago(s).`,\n      receipts:receipts.length,\n      payments:payments.length\n    });\n  }\n\n  req.db.suppliers=req.db.suppliers.filter(x=>x.id!==s.id);\n  await writeDb(req.db);\n  res.json({ok:true,deletedId:s.id,name:s.name});\n});\n\napp.post('/api/admin/suppliers-clean-duplicates', auth, role('admin'), async (req,res)=>{\n  ensureSupplierCollections(req.db);\n\n  const norm=v=>String(v||'').trim().toLowerCase()\n    .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')\n    .replace(/\\s+/g,' ');\n\n  const groups=new Map();\n  for(const s of req.db.suppliers){\n    const key=norm(s.name);\n    if(!key)continue;\n    if(!groups.has(key))groups.set(key,[]);\n    groups.get(key).push(s);\n  }\n\n  const removed=[];\n  const kept=[];\n\n  for(const [key,list] of groups){\n    if(list.length<2)continue;\n\n    list.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));\n\n    const withMovements=list.filter(s=>\n      req.db.supplierReceipts.some(r=>r.supplierId===s.id) ||\n      req.db.supplierPayments.some(p=>p.supplierId===s.id)\n    );\n\n    const keep=withMovements[0] || list[0];\n    kept.push({id:keep.id,name:keep.name});\n\n    for(const s of list){\n      if(s.id===keep.id)continue;\n      const hasMovements=\n        req.db.supplierReceipts.some(r=>r.supplierId===s.id) ||\n        req.db.supplierPayments.some(p=>p.supplierId===s.id);\n\n      if(!hasMovements){\n        req.db.suppliers=req.db.suppliers.filter(x=>x.id!==s.id);\n        removed.push({id:s.id,name:s.name});\n      }\n    }\n  }\n\n  await writeDb(req.db);\n  res.json({ok:true,removed,kept});\n});\n"
if "FROSTLAND_V73_DELETE_SUPPLIERS" not in server:
    pos = server.find("app.get('/{*splat}'")
    if pos == -1:
        print("ERROR: no encontré el punto seguro antes del catch-all.")
        sys.exit(1)
    server = server[:pos] + backend + "\n\n" + server[pos:]
    SERVER.write_text(server, encoding="utf-8")
    print("Backend de eliminación agregado.")
else:
    print("Backend V7.3 ya instalado.")

js = JS.read_text(encoding="utf-8")

old_head = '<div class="v72-head"><div><p class="v72-kicker">PROVEEDORES</p><h2>Proveedores</h2><p>Remitos, pagos entregados y saldo pendiente.</p></div><button id="v72NewSupplier">+ Nuevo proveedor</button></div>'
new_head = '<div class="v72-head"><div><p class="v72-kicker">PROVEEDORES</p><h2>Proveedores</h2><p>Remitos, pagos entregados y saldo pendiente.</p></div><div class="v72-actions-left"><button id="v72CleanDuplicates" class="secondary">Limpiar duplicados</button><button id="v72NewSupplier">+ Nuevo proveedor</button></div></div>'
if old_head in js:
    js = js.replace(old_head, new_head, 1)

old_bind = "$('#v72NewSupplier').onclick=()=>$('#v72SupplierDialog').showModal();\n   $('#v72SupplierDialog [data-close]').onclick=()=>$('#v72SupplierDialog').close();"
new_bind = "$('#v72NewSupplier').onclick=()=>$('#v72SupplierDialog').showModal();\n   $('#v72CleanDuplicates').onclick=cleanDuplicateSuppliers;\n   $('#v72SupplierDialog [data-close]').onclick=()=>$('#v72SupplierDialog').close();"
if old_bind in js:
    js = js.replace(old_bind, new_bind, 1)

start = js.find("function renderSupplierList(){")
end = js.find("async function saveSupplier", start)
if start == -1 or end == -1:
    print("ERROR: no encontré renderSupplierList() en admin-v72.js.")
    sys.exit(1)

js = js[:start] + 'function renderSupplierList(){\n const el=$(\'#v72SupplierList\');if(!el)return;\n const q=String($(\'#v72SupplierSearch\')?.value||\'\').toLowerCase();\n const rows=suppliers.filter(s=>`${s.name||\'\'} ${s.contact||\'\'} ${s.phone||\'\'}`.toLowerCase().includes(q));\n el.innerHTML=rows.map(s=>`<div class="v73-supplier-line"><button class="v72-card v73-grow" data-supplier="${s.id}"><div><b>${esc(s.name)}</b><small>${esc(s.contact||s.phone||\'Sin contacto\')}</small></div><div class="v72-card-foot"><span>Saldo</span><strong>${money(s.balance)}</strong></div></button><button class="v73-delete" data-delete-supplier="${s.id}" title="Eliminar proveedor">Eliminar</button></div>`).join(\'\')||\'<div class="v72-empty">No hay proveedores cargados.</div>\';\n $$(\'[data-supplier]\').forEach(b=>b.onclick=()=>renderSupplierDetail(b.dataset.supplier));\n $$(\'[data-delete-supplier]\').forEach(b=>b.onclick=async e=>{\n   e.stopPropagation();\n   const id=b.dataset.deleteSupplier;\n   const s=suppliers.find(x=>x.id===id);\n   if(!s)return;\n   if(!confirm(`¿Eliminar al proveedor "${s.name}"?\\n\\nSolo se eliminará si NO tiene remitos ni pagos cargados.`))return;\n   try{\n     await api(`/api/admin/suppliers/${id}`,{method:\'DELETE\'});\n     if(selectedSupplier===id){\n       selectedSupplier=null;\n       const d=$(\'#v72SupplierDetail\');\n       if(d)d.innerHTML=\'<div class="v72-empty">Elegí un proveedor.</div>\';\n     }\n     await loadSuppliers();\n   }catch(err){alert(err.message)}\n });\n}\nasync function cleanDuplicateSuppliers(){\n if(!confirm(\'Esto eliminará automáticamente proveedores repetidos con el MISMO NOMBRE, únicamente cuando el duplicado no tenga remitos ni pagos.\\n\\nEl proveedor con movimientos siempre se conserva.\\n\\n¿Continuar?\'))return;\n try{\n   const r=await api(\'/api/admin/suppliers-clean-duplicates\',{method:\'POST\',body:\'{}\'});\n   const n=(r.removed||[]).length;\n   alert(n?`Listo. Se eliminaron ${n} proveedor(es) duplicado(s) sin movimientos.`:\'No encontré duplicados seguros para eliminar.\');\n   selectedSupplier=null;\n   await loadSuppliers();\n }catch(err){alert(err.message)}\n}\n' + "\n" + js[end:]

needle = '<div class="v72-actions-left"><button id="v72AddReceipt">+ Remito</button><button id="v72AddPayment">+ Pago</button></div>'
replacement = '<div class="v72-actions-left"><button id="v72AddReceipt">+ Remito</button><button id="v72AddPayment">+ Pago</button><button id="v72DeleteSupplier" class="v73-danger">Eliminar proveedor</button></div>'
if needle in js:
    js = js.replace(needle, replacement, 1)

bind_needle = "$('#v72AddReceipt').onclick=()=>$('#v72ReceiptDialog').showModal();\n  $('#v72AddPayment').onclick=()=>$('#v72PaymentDialog').showModal();"
bind_repl = "$('#v72AddReceipt').onclick=()=>$('#v72ReceiptDialog').showModal();\n  $('#v72AddPayment').onclick=()=>$('#v72PaymentDialog').showModal();\n  $('#v72DeleteSupplier').onclick=async()=>{\n    if(!confirm(`¿Eliminar al proveedor \"${s.name}\"?\\n\\nSolo se eliminará si no tiene remitos ni pagos.`))return;\n    try{\n      await api(`/api/admin/suppliers/${id}`,{method:'DELETE'});\n      selectedSupplier=null;\n      $('#v72SupplierDetail').innerHTML='<div class=\"v72-empty\">Proveedor eliminado.</div>';\n      await loadSuppliers();\n    }catch(err){alert(err.message)}\n  };"
if bind_needle in js:
    js = js.replace(bind_needle, bind_repl, 1)

JS.write_text(js, encoding="utf-8")

css = CSS.read_text(encoding="utf-8")
patch = '\n/* FROSTLAND V7.3 proveedores */\n.v73-supplier-line{display:flex;gap:7px;align-items:stretch}\n.v73-grow{flex:1;min-width:0}\n.v73-delete,.v73-danger{border:1px solid #d9aaa2!important;background:#fff3f1!important;color:#9a382d!important;border-radius:11px!important;padding:8px 10px!important;cursor:pointer!important}\n.v73-delete:hover,.v73-danger:hover{background:#9a382d!important;color:#fff!important}\n'
if "FROSTLAND V7.3 proveedores" not in css:
    CSS.write_text(css + "\n" + patch, encoding="utf-8")

print("FROSTLAND V7.3 aplicada.")
print("Podés eliminar proveedores desde el panel.")
print("También hay botón Limpiar duplicados.")
print("NO se tocaron .env ni data/db.json durante la instalación.")
print("Backup:", backup)
