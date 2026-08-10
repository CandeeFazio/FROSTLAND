FROSTLAND V6 — INSTALACIÓN SEGURA

IMPORTANTE
- Este parche NO incluye ni modifica data/db.json.
- NO incluye ni modifica .env.
- NO borra clientes, pedidos, sabores, productos, stock, cajas ni gastos.
- El instalador crea automáticamente un backup de server.js y archivos public antes de modificar.

1) Copiá estos tres elementos a la RAÍZ de tu proyecto:
   apply_frostland_v6.py
   public/admin-v6.js
   public/admin-v6.css

2) Desde PowerShell en la carpeta del proyecto:
   python apply_frostland_v6.py
   node --check server.js
   node --check public/app.js
   git status

3) Si no hay errores:
   git add server.js public apply_frostland_v6.py README_INSTALACION.txt
   git commit -m "Agregar panel ventas por turno y transferencia WhatsApp"
   git push

4) En el VPS:
   cd /root/frostland
   git pull
   pm2 restart frostland --update-env
   pm2 save

QUÉ AGREGA
- Menú desplegable en admin: Ventas, Pedidos, Caja, Stock/Sabores, Precios, Banners, Contenido y Horarios.
- Ventas/clientes separados por turno o día.
- Cada cierre futuro guarda un snapshot de clientes, pedidos y totales de ese turno.
- Los cierres anteriores siguen consultables, pero no se mezclan con el día siguiente.
- Transferencia crea primero el pedido y después manda al WhatsApp del local con:
  "Ya hice el pedido FR-... desde la web por $.... Pasame el alias para abonar por favor."
- QR y transferencia quedan "Pendiente en el local" hasta marcarlos pagados.
- Apertura de caja permite elegir Nadia, Candela o Daniela.

ANTES DE SUBIR
Probá node --check server.js. Si muestra cualquier error, NO hagas git push.
