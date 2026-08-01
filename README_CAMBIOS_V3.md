# FROSTLAND V3

## Cambios
- Las cuentas quedan guardadas en `DATA_DIR/db.json`.
- La sesión dura hasta 365 días en el dispositivo, salvo que el usuario cierre sesión.
- En Render se incluye un disco persistente para no perder usuarios, pedidos, puntos ni stock al reiniciar.
- Cada tamaño tiene una foto configurable desde Administración.
- Mercado Pago lee `MP_ACCESS_TOKEN` desde `.env` y usa automáticamente el dominio HTTPS detectado o `PUBLIC_URL`.

## Dominio
En producción configurá:
```env
PUBLIC_URL=https://frostland.com.ar
DATA_DIR=/var/data
```
En local podés dejar:
```env
PUBLIC_URL=http://localhost:8000
DATA_DIR=./data
```

## Mercado Pago
```env
MP_PUBLIC_KEY=TU_PUBLIC_KEY
MP_ACCESS_TOKEN=TU_ACCESS_TOKEN
```
El token debe estar sin comillas y sin espacios. Reiniciá con `npm start`.

## Fotos
Administración > Tamaños, precios y stock > columna Foto. Pegá una URL HTTPS y guardá.
