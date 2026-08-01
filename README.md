# FROSTLAND PRO — stock y Mercado Pago

## Ejecutar en Windows

1. Descomprimí el ZIP.
2. Abrí PowerShell dentro de la carpeta.
3. Ejecutá:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Abrí `http://localhost:8000`.

Administrador inicial:
- Email: `admin@frostland.local`
- Contraseña: `admin1234`

## Configurar Mercado Pago

1. Creá una aplicación en **Mercado Pago Developers > Tus integraciones**.
2. Para probar, copiá el **Access Token de prueba**.
3. Abrí el archivo `.env` con Bloc de notas.
4. Pegalo sin comillas:

```env
MP_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxxxxx
```

5. Guardá el archivo y reiniciá el servidor:

```powershell
npm start
```

Para cobros reales, reemplazá el token de prueba por el **Access Token de producción**. Nunca pongas el Access Token en `public/app.js`, no lo subas a redes y no lo compartas.

`PUBLIC_URL=http://localhost:8000` sirve para pruebas locales. Para producción necesitás una URL pública HTTPS y configurar el webhook de Mercado Pago apuntando al endpoint correspondiente del servidor.

## Panel de stock

Desde **Administración** podés:
- Crear tamaños nuevos.
- Cambiar nombre, precio y máximo de sabores (hasta 12 desde la interfaz).
- Cambiar stock de cada tamaño.
- Activar o pausar tamaños.
- Crear y editar sabores.
- Cambiar stock y nivel de alerta por sabor.
- Usar botones rápidos `-5`, `-1`, `+1` y `+5`.
- Ver alertas visuales de stock disponible, bajo o agotado.

Cada pedido descuenta stock. Si el administrador cancela el pedido, el stock se devuelve una sola vez.

## Datos existentes

La app conserva la base `data/db.json`. Al iniciar, agrega automáticamente los campos de inventario nuevos a datos anteriores.
