# FROSTLAND V4.1 consolidada

Incluye:
- Corrección y refuerzo del panel responsive.
- Caja con selección de Nadia, Candela o Daniela.
- Resumen de ventas por efectivo, Mercado Pago, QR y transferencia.
- Gastos y neto por período.
- Clientes con pedidos, total gastado, puntos y clave temporal.
- Recuperación de contraseña por correo opcional con Resend.
- Códigos promocionales con porcentaje/monto fijo, mínimo, usos y límite por cliente.
- Campo de código promocional en el carrito y detalle del descuento.
- Historial de ajustes de stock.

## Instalación
En la PC:
```powershell
git add server.js public .env.example README_V41.md
git commit -m "FROSTLAND V4.1 consolidada"
git push
```
En el VPS:
```bash
cd /root/frostland
git pull
npm install
pm2 restart frostland --update-env
pm2 save
```

## Email de recuperación (opcional)
Configurá en `.env`:
```env
RESEND_API_KEY=...
RESET_FROM_EMAIL=FROSTLAND <no-reply@tu-dominio.com>
```
Sin esas variables, el administrador puede generar una contraseña temporal desde Clientes.
