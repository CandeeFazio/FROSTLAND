# FROSTLAND — versión dominio + chat unificado

## Qué fue corregido

- Cliente y administrador usan la misma conversación, guardada dentro del mismo pedido.
- Los mensajes se sincronizan en tiempo real con Socket.IO.
- Como respaldo, el chat se actualiza cada 3 segundos si el canal en tiempo real se corta.
- Los cambios de estado del pedido también se notifican en tiempo real.
- La aplicación está lista para funcionar detrás de HTTPS y un proxy inverso.
- Incluye configuraciones para Render, Docker, Caddy y Nginx.

## Prueba local

1. Copiar `.env.example` a `.env`.
2. Completar Mercado Pago dentro de `.env`.
3. Ejecutar `npm install`.
4. Ejecutar `npm start`.
5. Abrir `http://localhost:8000`.

Para probar el chat correctamente, crear un cliente y un pedido. Abrir otra ventana privada del navegador, entrar como administrador y abrir el chat de ese mismo código de pedido.

## Dominio frostland.com.ar

No alcanza con cambiar `localhost` dentro del archivo. El dominio debe estar registrado y apuntar al servidor donde se despliega la app.

### Opción recomendada: Render

1. Subir esta carpeta a un repositorio privado de GitHub.
2. En Render crear un Blueprint usando `render.yaml`.
3. Cargar las variables secretas desde el panel de Render. No subir `.env`.
4. En Render agregar los dominios personalizados:
   - `frostland.com.ar`
   - `www.frostland.com.ar`
   - opcional: `admin.frostland.com.ar`
5. Copiar los registros DNS que Render indique en NIC Argentina o el proveedor del dominio.
6. Esperar que Render valide el dominio y active HTTPS.
7. En las variables de Render dejar `PUBLIC_URL=https://frostland.com.ar`.

### Mercado Pago en producción

Configurar el webhook en Mercado Pago como:

`https://frostland.com.ar/api/mercadopago/webhook`

Usar credenciales de producción y establecer:

`PUBLIC_URL=https://frostland.com.ar`

Luego reiniciar el servicio. Las URLs de éxito, pendiente y error se crean automáticamente.

## Datos persistentes

El archivo JSON local sirve para pruebas. En un hosting donde el disco se reinicia, usar `FIREBASE_SERVICE_ACCOUNT_JSON` para que usuarios, puntos, stock, pedidos y chats queden persistentes. La variable debe contener el JSON completo de una cuenta de servicio de Firebase en una sola línea.

## Seguridad

- Nunca subir `.env` a GitHub.
- Regenerar cualquier Access Token que haya sido compartido.
- Cambiar la contraseña inicial del administrador antes de publicar.
- Usar una clave larga y aleatoria para `JWT_SECRET`.
