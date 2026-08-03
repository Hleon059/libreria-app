# Librería · App de Precios y Stock

App web instalable (PWA) para consultar precios por código de barras o
descripción, e inventario compartido entre varios dispositivos.

## ⚠️ Revisar antes de usar: PRECIO1 vs PRECIO2

Probé el importador con tu archivo real y en la mayoría de los productos
**PRECIO1 es MÁS ALTO que PRECIO2** (ej: "ABACO TAPS X30" → Precio1 $5.370,
Precio2 $3.780). Si Precio1 = mayorista y Precio2 = minorista, lo esperable
sería lo contrario (mayorista más barato). Puede que el archivo en realidad
tenga Precio1 = precio de lista y Precio2 = precio con descuento/contado,
o que estén en el orden inverso al que pensás.

Te recomiendo confirmarlo con una consulta rápida a tu proveedor o mirando
2-3 productos que conozcas de memoria. Si las etiquetas "Mayorista"/"Minorista"
no son correctas, decime y las cambio en un minuto (están en `public/app.js`,
buscá "May." y "Min.").

## Qué incluye

- **Buscar**: por código de barras (completo o parcial), artículo o texto de
  la descripción. Filtro por rubro (Librería, Cotillón, Mercería, etc.).
- **Escanear**: botón de cámara para leer el código de barras desde el celular.
- **Importar**: subís el archivo del proveedor (.xls/.xlsx/.csv) tal cual lo
  recibís — la app detecta sola las columnas ARTICULO/CODIGO/DESCRIPCION/
  PRECIO1/PRECIO2 (y RUBRO/CATEGORIA si la trae) y actualiza precios /
  agrega productos nuevos. Podés etiquetar el lote con un rubro.
- **Inventario**: cada producto tiene stock, botones +/− rápidos, y un
  formulario para registrar entradas, salidas o ajustes con nota y quién
  lo hizo.
- **Alertas**: pestaña con los productos en o por debajo de su stock mínimo
  (default 3 unidades, editable por producto).
- **Historial**: registro de todos los movimientos, general y por producto.
- Los datos viven en Netlify Blobs (compartidos entre PC y los 3 celulares),
  con una copia local en cada dispositivo para que la búsqueda funcione
  rápido incluso con conexión débil.

## Cómo desplegarla en Netlify

1. Subí esta carpeta a un repositorio de GitHub (igual que hiciste con tu
   Asistente de Convivencia Escolar).
2. En Netlify: **Add new site → Import an existing project** y elegí el repo.
3. Netlify va a detectar automáticamente:
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
   (ya están configurados en `netlify.toml`, no hace falta tocar nada)
4. **No hace falta ninguna variable de entorno** para Netlify Blobs: cuando
   el sitio corre en Netlify, las funciones acceden al Blob store solas.
5. Deploy. Al terminar vas a tener una URL tipo `tu-libreria.netlify.app`.

## Cómo instalarla en cada dispositivo

- **Celulares (Android/iPhone)**: abrí la URL en Chrome/Safari → menú →
  "Agregar a pantalla de inicio" / "Instalar app". Queda como un ícono más,
  se abre a pantalla completa.
- **PC**: abrí la URL en Chrome/Edge → ícono de instalar en la barra de
  direcciones (o menú → "Instalar Librería…").

## Primer uso

1. Abrí la app en cualquier dispositivo, entrá a **Importar** y subí tu
   primera lista completa (podés hacerlo rubro por rubro: subís la de
   Librería con "Librería" como rubro, después la de Cotillón, etc.).
2. Los otros dispositivos van a ver el catálogo actualizado apenas lo abran
   (o tocando el botón ⟳ arriba a la derecha).
3. La primera vez que alguien registra un movimiento de stock, la app
   pregunta "¿Quién sos?" para dejar registro en el historial.

## Actualizar precios más adelante

Cada vez que te llegue una lista nueva del proveedor: **Importar** → elegís
el archivo → confirmás. Los productos que ya existen actualizan su precio,
los nuevos se agregan solos (con stock en 0, para que los cargues).

## Si algo falla

- Si un dispositivo no ve los datos actualizados: tocá el botón ⟳.
- Si la cámara no abre para escanear: revisá que le diste permiso de cámara
  al navegador (Configuración del sitio → Cámara → Permitir).
- Con 20.000+ productos el catálogo puede pesar unos MB — sigue funcionando
  bien, pero si algún celular muy viejo se pone lento, contame y ajusto la
  cache local.
