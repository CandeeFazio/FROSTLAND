# FROSTLAND — Editor web y productos configurables

Esta actualización agrega:

- Editor de textos y fotos de la portada desde el panel administrador.
- Edición del carrusel principal, beneficios, destacados y Frostland Club.
- Carga de imágenes desde el panel.
- Productos con varias unidades incluidas.
- Selección de sabores separada por pote, cucurucho o unidad.
- Combos como “Cuculand: 2 cucuruchos”.
- Pedidos de varias unidades separados claramente para cliente y administrador.

## Ejemplos

### Tres kilos separados
Configurá el producto “1 kg” con:
- Unidades incluidas: 1
- Nombre de unidad: pote
- Sabores por unidad: la cantidad que corresponda

Cuando el cliente seleccione cantidad 3, verá:
- Pote 1
- Pote 2
- Pote 3

### Promo Cuculand
Creá un producto:
- Nombre: Cuculand
- Unidades incluidas: 2
- Nombre de unidad: cucurucho
- Sabores por unidad: 1 o 2
- Precio: precio total de la promoción

## Instalación

En la PC:

```powershell
git add .
git commit -m "Agregar editor web y productos configurables"
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

Los productos existentes quedan configurados automáticamente con una unidad.
