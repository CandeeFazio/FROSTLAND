from pathlib import Path
from datetime import datetime
import shutil, re, sys

ROOT = Path.cwd()
SERVER = ROOT / "server.js"
SW = ROOT / "public" / "service-worker.js"

for p in [SERVER, SW]:
    if not p.exists():
        print("ERROR: falta", p)
        sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f"backup-v62c-{stamp}"
backup.mkdir(exist_ok=True)

for p in [SERVER, SW]:
    rel = p.relative_to(ROOT)
    dest = backup / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)

print("Backup creado en", backup)

s = SERVER.read_text(encoding="utf-8")
marker = "FROSTLAND_V62C_TOTALES_HISTORICOS"

if marker in s:
    print("V6.2C ya estaba aplicada. No se hicieron cambios.")
    sys.exit(0)

route_start = s.find("app.get('/api/admin/dashboard'")
if route_start == -1:
    print("ERROR: no encontré /api/admin/dashboard")
    sys.exit(1)

route_end = s.find("\n});", route_start)
if route_end == -1:
    print("ERROR: no pude detectar el final de /api/admin/dashboard")
    sys.exit(1)
route_end += len("\n});")

block = s[route_start:route_end]
idx = block.find("res.json({")
if idx == -1:
    print("ERROR: no encontré res.json() dentro del dashboard")
    sys.exit(1)

inject = '''
  // FROSTLAND_V62C_TOTALES_HISTORICOS
  const historicalOrders = (req.db.orders || []).filter(o => o.status !== 'cancelled');
  const historicalSalesOrders = historicalOrders.filter(o =>
    o.paymentStatus === 'approved' ||
    (o.paymentMethod === 'cash' && o.status === 'delivered')
  );
  const historicalSales = historicalSalesOrders.reduce((a,o)=>a+Number(o.total||0),0);
  const historicalExpenses = (req.db.expenses || []).reduce((a,e)=>a+Number(e.amount||0),0);
  const historicalRealMoney = historicalSales - historicalExpenses;
'''

block = block[:idx] + inject + "\n  " + block[idx:]

pat = re.compile(r"totals\s*:\s*\{.*?\}\s*,\s*orders\s*:", re.S)
replacement = '''totals: {
    orders: historicalOrders.length,
    sales: historicalSales,
    customers: (req.db.users || []).filter(u=>u.role==='customer').length,
    pending: historicalOrders.filter(o=>!['delivered','cancelled'].includes(o.status)).length,
    expenses: historicalExpenses,
    realMoney: historicalRealMoney
  }, orders:'''

new_block, n = pat.subn(replacement, block, count=1)
if n != 1:
    print("ERROR: no pude reemplazar el bloque totals del dashboard.")
    print("Se creó backup y NO se guardaron cambios.")
    sys.exit(1)

s = s[:route_start] + new_block + s[route_end:]
SERVER.write_text(s, encoding="utf-8")

sw = SW.read_text(encoding="utf-8")
version = f"frostland-v62c-{stamp}"
sw2, n = re.subn(r'''const CACHE\s*=\s*['"][^'"]+['"]''', f'const CACHE = "{version}"', sw, count=1)
if n == 0:
    sw2, n = re.subn(r'''const CACHE_NAME\s*=\s*['"][^'"]+['"]''', f'const CACHE_NAME = "{version}"', sw, count=1)
if n:
    SW.write_text(sw2, encoding="utf-8")

print("V6.2C aplicada correctamente.")
print("GASTOS y DINERO REAL ahora son HISTORICOS/ACUMULADOS.")
print("Cancelados no cuentan en pedidos, ventas ni dinero real.")
print("NO se modificaron .env ni data/db.json.")
print("Backup:", backup)
