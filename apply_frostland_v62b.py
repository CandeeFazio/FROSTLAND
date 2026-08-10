from pathlib import Path
from datetime import datetime
import shutil, re, sys

ROOT = Path.cwd()
ADMIN = ROOT / "public" / "admin-v6.js"
SW = ROOT / "public" / "service-worker.js"

for p in [ADMIN, SW]:
    if not p.exists():
        print("ERROR: falta", p)
        sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f"backup-v62b-{stamp}"
backup.mkdir(exist_ok=True)

for p in [ADMIN, SW]:
    rel = p.relative_to(ROOT)
    dest = backup / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)

print("Backup creado en", backup)

v = ADMIN.read_text(encoding="utf-8")

marker = "FROSTLAND_V62B_GASTOS_REAL"
if marker not in v:
    insert = '''
/* FROSTLAND_V62B_GASTOS_REAL */
async function refreshTopMoneyCards(){
  if(!token() || !$('#stats')) return;
  try{
    const d = await api('/api/admin/dashboard');
    const totals = d.totals || {};
    const stats = $('#stats');
    if(!stats) return;

    let gasto = stats.querySelector('[data-v62-card="expenses"]');
    let real = stats.querySelector('[data-v62-card="realMoney"]');

    if(!gasto){
      gasto = document.createElement('div');
      gasto.className = 'stat';
      gasto.dataset.v62Card = 'expenses';
      stats.appendChild(gasto);
    }
    if(!real){
      real = document.createElement('div');
      real.className = 'stat real-money';
      real.dataset.v62Card = 'realMoney';
      stats.appendChild(real);
    }

    gasto.innerHTML = `<span>Gastos</span><strong>${money(totals.expenses||0)}</strong>`;
    real.innerHTML = `<span>DINERO REAL</span><strong>${money(totals.realMoney||0)}</strong>`;
  }catch(e){
    console.warn('V6.2 tarjetas dinero:', e);
  }
}
window.addEventListener('frostland:refresh-sales',()=>{refreshTopMoneyCards();loadSales();});
'''
    needle = "async function refreshAll(){"
    if needle not in v:
        print("ERROR: no encontré refreshAll() en public/admin-v6.js")
        sys.exit(1)
    v = v.replace(needle, insert + "\n" + needle, 1)

old = "async function refreshAll(){prepareSections();ensureMenu();ensureSalesPanel();await fillShiftOptions();await loadSales()}"
new = "async function refreshAll(){prepareSections();ensureMenu();ensureSalesPanel();await fillShiftOptions();await loadSales();await refreshTopMoneyCards()}"
if old in v:
    v = v.replace(old, new, 1)
elif "await refreshTopMoneyCards()" not in v:
    print("ERROR: versión distinta de refreshAll(). No se modificó.")
    sys.exit(1)

old_sales = "['Gastos',money(d.totalExpenses||0)]"
new_sales = "['Gastos',money(d.totalExpenses||0)],['DINERO REAL',money(Number(d.totalSales||0)-Number(d.totalExpenses||0))]"
if old_sales in v and "['DINERO REAL',money(Number(d.totalSales||0)-Number(d.totalExpenses||0))]" not in v:
    v = v.replace(old_sales, new_sales, 1)

ADMIN.write_text(v, encoding="utf-8")

sw = SW.read_text(encoding="utf-8")
version = f"frostland-v62b-{stamp}"
sw2, n = re.subn(r'''const CACHE\s*=\s*['"][^'"]+['"]''', f'const CACHE = "{version}"', sw, count=1)
if n == 0:
    sw2, n = re.subn(r'''const CACHE_NAME\s*=\s*['"][^'"]+['"]''', f'const CACHE_NAME = "{version}"', sw, count=1)
if n:
    SW.write_text(sw2, encoding="utf-8")

print("V6.2B aplicada correctamente.")
print("Agrega las tarjetas GASTOS y DINERO REAL al panel superior.")
print("NO toca server.js, app.js, .env ni data/db.json.")
print("Backup:", backup)
