# FROSTLAND V4 — Caja, turnos, alarma, flyer y reintegros

Incluye:
- Empleadas Nadia, Candela y Daniela con rol `employee`.
- Apertura y cierre de caja por responsable.
- Ventas separadas por Efectivo, Mercado Pago, QR y Transferencia.
- Registro de gastos con categoría, detalle, proveedor y método de pago.
- Ticket imprimible del cierre con detalle de ventas, gastos, neto, efectivo esperado, contado y diferencia.
- Alarma sonora de pedido nuevo mientras el panel esté abierto.
- Estado inicial “El local recibió tu pedido”. Recién cambia a confirmado al aceptar.
- Botón “Aceptar e imprimir 2”: cliente + comanda interna.
- Flyer promocional administrable con X, fechas y frecuencia.
- Cancelación con motivo y solicitud automática de cancelación/reintegro en Mercado Pago cuando existe `mpPaymentId`.

## Importante
Los navegadores muestran la ventana de impresión; no permiten imprimir silenciosamente sin configuración de kiosco/conector de impresora.

## Instalación
Copiá estos archivos dentro de tu proyecto y reemplazá.

En la PC:
```powershell
git add server.js public .env.example
git commit -m "Agregar caja turnos flyer y alarma"
git push
```

En el servidor:
```bash
cd /root/frostland
git pull
npm install
pm2 restart frostland --update-env
pm2 save
```

## Empleadas
Antes de producción, agregá al `.env` contraseñas propias usando las variables de `.env.example`. Si no las agregás, se crean contraseñas temporales; cambialas cuanto antes.

## Reintegros
La devolución automática se intenta solamente para pagos de Mercado Pago vinculados a un `mpPaymentId`. Si Mercado Pago rechaza la operación, el pedido queda cancelado pero el panel informa que el reintegro requiere revisión manual. Nunca se repite el mismo reintegro gracias a una clave de idempotencia.
