from pathlib import Path
from datetime import datetime
import shutil, re, sys

ROOT = Path.cwd()
SERVER = ROOT / 'server.js'
APP = ROOT / 'public' / 'app.js'
ADMINV6 = ROOT / 'public' / 'admin-v6.js'
SW = ROOT / 'public' / 'service-worker.js'

required = [SERVER, APP, SW]
missing = [str(p) for p in required if not p.exists()]
if missing:
    print('ERROR: faltan archivos:', ', '.join(missing))
    sys.exit(1)

stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
backup = ROOT / f'backup-v62-{stamp}'
backup.mkdir(exist_ok=True)
for p in [SERVER, APP, ADMINV6, SW]:
    if p.exists():
        rel = p.relative_to(ROOT)
        dest = backup / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)
print('Backup creado en', backup)

# ---- server.js: dashboard de HOY con gastos y dinero real ----
s = SERVER.read_text(encoding='utf-8')
start = s.find("app.get('/api/admin/dashboard', auth, role('admin','employee'), (req, res) => {")
if start == -1:
    print('ERROR: no encontré /api/admin/dashboard en server.js')
    sys.exit(1)
end = s.find("\n});", start)
if end == -1:
    print('ERROR: no pude detectar el final del dashboard')
    sys.exit(1)
end += len("\n});")
new_dashboard = r'''app.get('/api/admin/dashboard', auth, role('admin','employee'), (req, res) => {
  const allOrders = Array.isArray(req.db.orders) ? req.db.orders : [];
  const orders = allOrders.filter(o => !o.archivedAt);
  const arDay = value => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
    } catch { return ''; }
  };
  const today = arDay(new Date());
  const todayOrders = orders.filter(o => o.status !== 'cancelled' && arDay(o.createdAt) === today);
  const todayExpenses = (Array.isArray(req.db.expenses) ? req.db.expenses : []).filter(e => arDay(e.createdAt) === today);
  const totalSales = todayOrders.reduce((a,o)=>a+Number(o.total||0),0);
  const totalExpenses = todayExpenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const realMoney = totalSales - totalExpenses;
  const customersToday = new Set(todayOrders.map(o=>o.userId || o.customer?.email || o.customer?.phone || o.customer?.name).filter(Boolean)).size;
  const pendingToday = todayOrders.filter(o=>!['delivered','cancelled'].includes(o.status)).length;
  res.json({
    totals: { orders: todayOrders.length, sales: totalSales, customers: customersToday, pending: pendingToday, expenses: totalExpenses, realMoney, date: today },
    orders: orders.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
    users: req.db.users.map(publicUser), products: req.db.products, flavors: req.db.flavors, settings: req.db.settings,
    activeShift: req.db.cashShifts.find(s=>!s.closedAt)||null,
    shifts: req.db.cashShifts.slice().sort((a,b)=>b.openedAt.localeCompare(a.openedAt)).slice(0,30),
    expenses: req.db.expenses.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)
  });
});'''
s = s[:start] + new_dashboard + s[end:]
SERVER.write_text(s, encoding='utf-8')

# ---- app.js: tarjetas superiores ----
a = APP.read_text(encoding='utf-8')
old = "$('#stats').innerHTML=[['Pedidos',d.totals.orders],['Ventas',ars(d.totals.sales)],['Clientes',d.totals.customers],['Stock bajo',lowProducts+lowFlavors]].map(x=>`<div class=\"stat\"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');"
new = "$('#stats').innerHTML=[['Pedidos',d.totals.orders],['Ventas',ars(d.totals.sales)],['Clientes',d.totals.customers],['Stock bajo',lowProducts+lowFlavors],['Gastos',ars(d.totals.expenses||0)],['DINERO REAL',ars(d.totals.realMoney||0),'real-money']].map(x=>`<div class=\"stat ${x[2]||''}\"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');"
if old not in a:
    # regex fallback for prior formatting variants
    pat = re.compile(r"\$\('#stats'\)\.innerHTML=\[\['Pedidos',d\.totals\.orders\],\['Ventas',ars\(d\.totals\.sales\)\],\['Clientes',d\.totals\.customers\],\['Stock bajo',lowProducts\+lowFlavors\]\]\.map\(x=>`<div class=\\?\"stat\\?\"><span>\$\{x\[0\]\}</span><strong>\$\{x\[1\]\}</strong></div>`\)\.join\(''\);")
    a2, n = pat.subn(new, a, count=1)
    if n == 0:
        print('ERROR: no encontré el bloque de estadísticas en public/app.js')
        sys.exit(1)
    a = a2
else:
    a = a.replace(old, new, 1)
# Al guardar gasto, refrescar también panel V6 si escucha el evento.
a = a.replace("await loadAdmin();toast('Gasto registrado')", "await loadAdmin();window.dispatchEvent(new Event('frostland:refresh-sales'));toast('Gasto registrado')", 1)
APP.write_text(a, encoding='utf-8')

# ---- admin-v6.js: dinero real también en resumen de ventas ----
if ADMINV6.exists():
    v = ADMINV6.read_text(encoding='utf-8')
    old_stats = "stats.innerHTML=[['Pedidos',d.ordersCount],['Clientes',d.customersCount],['Vendido',money(d.totalSales)],['Cobrado',money(d.paidTotal)],['Pendiente',money(d.pendingTotal)],['Gastos',money(d.totalExpenses||0)]].map(([a,b])=>`<div class=\"stat\"><span>${a}</span><strong>${b}</strong></div>`).join('');"
    new_stats = "stats.innerHTML=[['Pedidos',d.ordersCount],['Clientes',d.customersCount],['Vendido',money(d.totalSales)],['Cobrado',money(d.paidTotal)],['Pendiente',money(d.pendingTotal)],['Gastos',money(d.totalExpenses||0)],['DINERO REAL',money(Number(d.totalSales||0)-Number(d.totalExpenses||0))]].map(([a,b])=>`<div class=\"stat\"><span>${a}</span><strong>${b}</strong></div>`).join('');"
    if old_stats in v:
        v = v.replace(old_stats, new_stats, 1)
    if "frostland:refresh-sales" not in v:
        v = v.replace("document.addEventListener('DOMContentLoaded',()=>{", "window.addEventListener('frostland:refresh-sales',()=>loadSales());\ndocument.addEventListener('DOMContentLoaded',()=>{", 1)
    ADMINV6.write_text(v, encoding='utf-8')

# ---- cache bump ----
sw = SW.read_text(encoding='utf-8')
version = f'frostland-v62-{stamp}'
sw2, n = re.subn(r'const CACHE\s*=\s*[\'\"][^\'\"]+[\'\"]', f'const CACHE = "{version}"', sw, count=1)
if n == 0:
    sw2, n = re.subn(r'const CACHE_NAME\s*=\s*[\'\"][^\'\"]+[\'\"]', f'const CACHE_NAME = "{version}"', sw, count=1)
SW.write_text(sw2, encoding='utf-8')

print('V6.2 aplicada correctamente.')
print('Tarjetas nuevas: Gastos y DINERO REAL = Ventas - Gastos.')
print('Los totales superiores ahora corresponden a HOY (Argentina) y excluyen cancelados.')
print('NO se modificaron .env ni data/db.json.')
print('Backup:', backup)
