# FROSTLAND — Descripciones, puntos y footer

## Novedades
- Descripción editable para cada producto.
- Cálculo de puntos y descuentos corregido.
- Límite porcentual configurable para el descuento por puntos.
- Devolución de puntos usados si un pedido se cancela o Mercado Pago lo rechaza.
- Reversión de puntos ganados si un pedido aprobado luego se cancela.
- Si Mercado Pago no puede crear el checkout, se revierte el pedido, stock y puntos.
- Footer editable con dirección, Google Maps, WhatsApp e Instagram.

## Conservar datos actuales
Copiá desde tu versión anterior a esta carpeta:
- `.env`
- la carpeta `data`

No reemplaces los archivos `server.js` ni `public` de esta actualización.

## Iniciar
```powershell
npm install
npm start
```
Luego abrí `http://localhost:8000`.

## Configuración desde Administración
En **Configuración y horarios** podés editar:
- Dirección.
- Enlace de Google Maps.
- WhatsApp (formato 549...).
- Usuario y enlace de Instagram.
- Valor de descuento por punto.
- Puntos ganados por cada $100.
- Porcentaje máximo del pedido que puede pagarse con puntos.
- Puntos de bienvenida.

## Inventario privado de baldes

- El stock ahora corresponde a baldes completos por sabor.
- Las cantidades solo se entregan por la API de administración y solo las ve el administrador.
- Los clientes únicamente ven "Disponible" o "Agotado".
- Los productos/tamaños ya no muestran ni descuentan stock.
- Los pedidos no descuentan un balde automáticamente, porque una venta no equivale a un balde completo. El administrador ajusta los baldes desde el panel cuando abre o termina uno.
