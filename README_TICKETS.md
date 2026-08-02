# FROSTLAND — Módulo de comandas y tickets

Agrega al panel administrador:

- Botón **Ver ticket** para cada pedido.
- Ticket con número, fecha, cliente, teléfono, entrega, dirección y observaciones.
- Productos y sabores separados por pote/cucurucho/unidad.
- Subtotal, envío, descuento y total.
- Método de pago y estado del pago.
- Estado actual del pedido.
- Botón **Imprimir** optimizado para impresora térmica de 80 mm.
- Botón **Marcar pagado**.
- Los tickets quedan disponibles porque se generan desde cada pedido ya guardado.

## Instalación

Copiá el contenido del ZIP dentro de tu proyecto y reemplazá los archivos.

En la PC:

```powershell
git add public server.js README_TICKETS.md
git commit -m "Agregar comandas y tickets"
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

En el teléfono, cerrá y abrí la app. El service worker cambia a una versión nueva para evitar que quede la interfaz anterior.
