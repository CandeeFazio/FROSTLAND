# FROSTLAND V3 — Editor y productos configurables

## Incluye
- Editor de textos y fotos de la portada desde el panel administrador.
- Productos con unidades incluidas y sabores separados por unidad.
- Combos como Cuculand de 2 cucuruchos.
- Pedidos múltiples separados por pote/cucurucho.

## Configuración de ejemplos
**1 kg:** unidades incluidas 1, nombre de unidad `pote`, sabores por unidad según corresponda. Si el cliente compra cantidad 3, verá Pote 1, Pote 2 y Pote 3.

**Cuculand:** unidades incluidas 2, nombre de unidad `cucurucho`, sabores por unidad 1 o 2, precio total de la promo.

## Despliegue
En PC: `git add .`, `git commit -m "FROSTLAND V3"`, `git push`.
En servidor: `git pull`, `npm install`, `pm2 restart frostland --update-env`, `pm2 save`.
