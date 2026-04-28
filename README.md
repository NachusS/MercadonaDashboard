# Mercadona Dashboard

Landing app responsive para controlar gastos de Mercadona a partir de facturas PDF y un dataset Excel descargable (`gastos.xlsx`).

## Acceso a la Web-APP
https://nachuss.github.io/MercadonaDashboard/

## Qué hace

- Carga un dataset existente (`gastos.xlsx`) y continúa alimentándolo.
- Extrae texto de facturas PDF en el navegador y genera filas transaccionales.
- Exporta el dataset actualizado a Excel con hojas:
  - `line_items`
  - `purchases`
  - `article_prices`
  - `metadata`
- Dashboard visual con:
  - gasto por mes
  - evolución por mes / semana / día
  - calendario de gasto
  - calendario de precio por artículo
  - ranking de artículos con categoría inferida
  - artículo más comprado, más repetido, más caro, más barato y con mayor variación

## Stack

- React + Vite + TypeScript
- Recharts para visualización
- PDF.js para lectura de PDFs en cliente
- SheetJS para importación/exportación de Excel

## Arranque local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Publicación en GitHub Pages

1. Sube el proyecto a un repositorio llamado `MercadonaDashboard`.
2. En GitHub abre **Settings > Pages** y selecciona **GitHub Actions**.
3. Haz push a `main`.
4. El workflow de `.github/workflows/deploy.yml` construirá y publicará la app.

> Si el repositorio no se llama `MercadonaDashboard`, cambia el valor `base` en `vite.config.ts`.

## Dataset recomendado

La hoja principal debe ser `line_items` y contener, como mínimo:

- `invoice_id`
- `purchase_date`
- `purchase_month`
- `purchase_week`
- `weekday`
- `article`
- `article_normalized`
- `category_inferred`
- `quantity`
- `unit_price`
- `line_total`
- `source_file`
- `parser_status`
- `hash`

## Notas sobre PDFs

La extracción usa patrones de texto de factura. Si una factura tiene un layout distinto o el PDF no expone texto limpio, la app la marca para revisión en lugar de mezclar datos dudosos en el dataset.


## Cómo abrirlo en local correctamente

No abras `index.html` con doble clic. Ese archivo es el punto de entrada de Vite y necesita un servidor de desarrollo o un build previo.

### Modo desarrollo

```bash
npm install
npm run dev
```

Abre la URL que te muestre Vite, normalmente `http://localhost:5173/`.

### Modo producción local

```bash
npm install
npm run build
npm run preview
```

Abre la URL que te muestre Vite, normalmente `http://localhost:4173/`.

### Si quieres servir `dist/` con un servidor estático

Primero ejecuta `npm run build` y luego sirve la carpeta `dist`. No uses el `index.html` de la raíz del proyecto.
