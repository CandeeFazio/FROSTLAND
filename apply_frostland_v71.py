from pathlib import Path
from datetime import datetime
import shutil, re, sys

ROOT=Path.cwd()
JS=ROOT/'public'/'admin-v7.js'
CSS=ROOT/'public'/'admin-v7.css'
SW=ROOT/'public'/'service-worker.js'
for p in [JS,CSS,SW]:
    if not p.exists():
        print('ERROR: falta',p)
        sys.exit(1)

stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
backup=ROOT/f'backup-v71-{stamp}'
backup.mkdir(exist_ok=True)
for p in [JS,CSS,SW]:
    d=backup/p.relative_to(ROOT)
    d.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,d)
print('Backup creado en:',backup)

js=JS.read_text(encoding='utf-8')
start=js.find('function ensureLayout(){')
end=js.find('function ensureCustomerPanel(){')
if start==-1 or end==-1 or end<=start:
    print('ERROR: no encontré ensureLayout() de V7.')
    sys.exit(1)

new_layout='function ensureLayout(){\n const admin=$(\'#admin\');if(!admin)return;\n markExistingSections();\n admin.classList.add(\'v7-admin\');\n\n const oldContent=$(\'#v7AdminContent\');\n if(oldContent){\n   [...oldContent.children].forEach(x=>admin.insertBefore(x,oldContent));\n   oldContent.remove();\n }\n\n let sidebar=$(\'#v7Sidebar\');\n if(!sidebar){\n   sidebar=document.createElement(\'aside\');\n   sidebar.id=\'v7Sidebar\';\n   sidebar.className=\'v7-sidebar\';\n   sidebar.innerHTML=`<div class="v7-side-head"><div class="v7-logo">F</div><div><b>FROSTLAND</b><small>Panel de gestión</small></div></div><nav>\n   <button data-v7-target="v7-dashboard"><span>Inicio</span></button>\n   <button data-v7-target="v7-orders"><span>Pedidos</span></button>\n   <button data-v7-target="admin-ventas"><span>Ventas</span></button>\n   <button data-v7-target="v7-cash"><span>Caja</span></button>\n   <button data-v7-target="v7-customers"><span>Clientes</span></button>\n   <button data-v7-target="v7-suppliers"><span>Proveedores</span></button>\n   <button data-v7-target="v7-stock"><span>Stock y sabores</span></button>\n   <button data-v7-target="v7-products"><span>Productos y precios</span></button>\n   <button data-v7-target="v7-banners"><span>Banners</span></button>\n   <button data-v7-target="v7-content"><span>Contenido</span></button>\n   <button data-v7-target="v7-settings"><span>Horarios y config.</span></button>\n   </nav>`;\n   admin.insertBefore(sidebar,admin.firstChild);\n }\n\n const stats=$(\'#stats\')||$(\'#v7-dashboard\');\n if(stats)stats.id=\'v7-dashboard\';\n\n $$(\'#v7Sidebar [data-v7-target]\').forEach(b=>b.onclick=()=>{\n   const target=document.getElementById(b.dataset.v7Target);\n   if(target)target.scrollIntoView({behavior:\'smooth\',block:\'start\'});\n   $$(\'#v7Sidebar button\').forEach(x=>x.classList.toggle(\'active\',x===b));\n });\n\n $(\'#adminQuickMenu\')?.classList.remove(\'v7-hide-quick\');\n ensureCustomerPanel();\n ensureSupplierPanel();\n}\n'
js=js[:start]+new_layout+'\n'+js[end:]
JS.write_text(js,encoding='utf-8')

CSS.write_text('/* FROSTLAND V7.1 FIX */\n#admin.v7-admin{\n  display:block!important;\n  position:relative!important;\n  max-width:1500px!important;\n  margin:0 auto!important;\n  padding:22px 22px 22px 270px!important;\n  background:transparent!important;\n  color:#1b1714!important;\n}\n#admin.v7-admin > *:not(#v7Sidebar),\n#admin.v7-admin .panel,\n#admin.v7-admin .admin-card,\n#admin.v7-admin .stat,\n#admin.v7-admin form,\n#admin.v7-admin table,\n#admin.v7-admin .v7-detail,\n#admin.v7-admin .v7-customer-card,\n#admin.v7-admin .v7-supplier-card{color:#1b1714!important}\n#admin.v7-admin input,\n#admin.v7-admin textarea,\n#admin.v7-admin select{color:#1b1714!important;background:#fff!important}\n#admin.v7-admin input::placeholder,\n#admin.v7-admin textarea::placeholder{color:#81776f!important;opacity:1!important}\n#admin.v7-admin .panel,\n#admin.v7-admin section.panel{display:block!important;visibility:visible!important;opacity:1!important}\n.v7-admin-content{display:contents!important}\n.v7-hide-quick{display:block!important}\n\n.v7-sidebar{\n  position:fixed!important;\n  left:14px!important;\n  top:18px!important;\n  width:220px!important;\n  box-sizing:border-box!important;\n  max-height:calc(100vh - 36px)!important;\n  overflow:auto!important;\n  background:#191512!important;\n  color:#fff!important;\n  border-radius:22px!important;\n  padding:16px!important;\n  box-shadow:0 18px 50px rgba(0,0,0,.16)!important;\n  z-index:50!important;\n}\n.v7-sidebar *{color:inherit!important}\n.v7-side-head{display:flex!important;gap:10px!important;align-items:center!important;padding:6px 6px 18px!important;border-bottom:1px solid rgba(255,255,255,.1)!important;margin-bottom:12px!important}\n.v7-logo{width:38px!important;height:38px!important;border-radius:12px!important;display:grid!important;place-items:center!important;background:#fff!important;color:#191512!important;font-weight:900!important;font-size:20px!important}\n.v7-side-head b,.v7-side-head small{display:block!important;color:#fff!important}\n.v7-side-head small{opacity:.62!important;font-size:11px!important}\n.v7-sidebar nav{display:grid!important;gap:5px!important}\n.v7-sidebar nav button{width:100%!important;display:flex!important;align-items:center!important;text-align:left!important;border:0!important;background:transparent!important;color:#eee!important;padding:11px 12px!important;border-radius:12px!important;font-size:13px!important;cursor:pointer!important}\n.v7-sidebar nav button span{color:inherit!important}\n.v7-sidebar nav button:hover,.v7-sidebar nav button.active{background:#fff!important;color:#181410!important}\n\n.v7-panel{scroll-margin-top:18px}\n.v7-title{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}\n.v7-title h2{margin:1px 0 4px}.v7-title p{margin:0}.v7-kicker{font-size:10px!important;font-weight:900;letter-spacing:.12em;opacity:.55}\n.v7-badge{padding:8px 12px;border-radius:999px;background:#f1eee9;font-weight:800;font-size:12px;white-space:nowrap}\n.v7-customer-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}\n.v7-customer-toolbar>input,.v7-search{flex:1;min-width:220px;border:1px solid #ddd5cc;border-radius:12px;padding:11px 12px;background:#fff!important;color:#1b1714!important}\n.v7-tabs{display:flex;gap:6px;flex-wrap:wrap}.v7-tabs button{border:1px solid #ddd5cc;background:#fff;color:#1b1714!important;padding:8px 10px;border-radius:999px;font-size:12px}.v7-tabs button.active{background:#1b1714!important;color:#fff!important;border-color:#1b1714!important}\n.v7-customer-layout,.v7-supplier-layout{display:grid;grid-template-columns:minmax(280px,.85fr) minmax(0,1.4fr);gap:16px}\n.v7-list{display:grid;gap:8px;max-height:650px;overflow:auto;padding-right:3px}\n.v7-customer-card,.v7-supplier-card{border:1px solid #e5ded7;background:#fff!important;color:#1b1714!important;border-radius:14px;padding:13px;text-align:left;display:grid;gap:8px;cursor:pointer}\n.v7-detail{border:1px solid #e5ded7;border-radius:16px;background:#fcfbfa!important;color:#1b1714!important;padding:16px;min-height:220px}\n.v7-detail-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:13px 0}\n.v7-detail-stats span{background:#f1eee9!important;border-radius:11px;padding:9px;font-size:11px}\n.v7-two-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}\n.v7-dialog{color:#1b1714!important}\n.v7-dialog input,.v7-dialog select,.v7-dialog textarea{color:#1b1714!important;background:#fff!important}\n\n#v7-dashboard,#v7-orders,#v7-cash,#v7-stock,#v7-products,#v7-banners,#v7-content,#v7-settings,#v7-customers,#v7-suppliers,#admin-ventas{scroll-margin-top:18px}\n\n@media(max-width:900px){\n #admin.v7-admin{display:block!important;padding:10px!important}\n .v7-sidebar{position:sticky!important;left:auto!important;top:0!important;width:auto!important;max-height:none!important;border-radius:0 0 18px 18px!important;margin:0 -10px 14px!important;padding:10px!important;overflow-x:auto!important;overflow-y:hidden!important}\n .v7-side-head{display:none!important}.v7-sidebar nav{display:flex!important;min-width:max-content!important}.v7-sidebar nav button{width:auto!important;padding:9px 10px!important}.v7-sidebar nav button span{font-size:11px!important}\n .v7-customer-layout,.v7-supplier-layout,.v7-two-cols{grid-template-columns:1fr!important}\n .v7-detail-stats{grid-template-columns:1fr 1fr!important}.v7-list{max-height:360px!important}\n}\n',encoding='utf-8')

sw=SW.read_text(encoding='utf-8')
version=f'frostland-v71-{stamp}'
sw2,n=re.subn(r'''const CACHE\s*=\s*['"][^'"]+['"]''',f'const CACHE = "{version}"',sw,count=1)
if n==0:
    sw2,n=re.subn(r'''const CACHE_NAME\s*=\s*['"][^'"]+['"]''',f'const CACHE_NAME = "{version}"',sw,count=1)
if n:
    SW.write_text(sw2,encoding='utf-8')

print('FROSTLAND V7.1 aplicada correctamente.')
print('Restaurada la estructura original: Caja, total de caja, Stock, Sabores y módulos anteriores.')
print('Corregido el texto blanco / contraste.')
print('Se mantienen menú lateral, Clientes y Proveedores.')
print('NO se tocaron server.js, .env ni data/db.json.')
