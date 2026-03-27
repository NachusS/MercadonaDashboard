import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Database,
  Download,
  Euro,
  FileSpreadsheet,
  FileText,
  PackageSearch,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

;(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
  pdfWorker

type ParserStatus = 'parsed' | 'review'
type AppTab = 'dashboard' | 'datos' | 'esquema'
type TimelineMode = 'month' | 'week' | 'day'
type RankingMode = 'spend' | 'quantity' | 'occurrences'
type PriceStateMode = 'rising' | 'stable' | 'falling' | null

interface LineItem {
  invoiceId: string
  purchaseDate: string
  purchaseYear: number
  purchaseMonth: string
  purchaseWeek: string
  weekday: string
  article: string
  articleNormalized: string
  categoryInferred: string
  quantity: number
  unitPrice: number
  lineBase: number
  taxRate: number
  taxAmount: number
  lineTotal: number
  sourceFile: string
  sourcePage: number
  parserStatus: ParserStatus
  hash: string
}

interface IngestLog {
  fileName: string
  invoiceId: string
  purchaseDate: string | null
  itemsParsed: number
  status: ParserStatus
  notes: string[]
}

interface ArticleAggregate {
  key: string
  label: string
  categoryInferred: string
  quantity: number
  occurrences: number
  spend: number
  avgUnitPrice: number
  minUnitPrice: number
  maxUnitPrice: number
  firstPrice: number
  lastPrice: number
  firstDate: string
  lastDate: string
  variationPct: number
  variationAbs: number
}

interface Summary {
  totalSpend: number
  ticketCount: number
  avgTicket: number
  latestMonthLabel: string
  latestMonthSpend: number
  topPurchased: ArticleAggregate | null
  mostRepeated: ArticleAggregate | null
  mostExpensive: ArticleAggregate | null
  cheapest: ArticleAggregate | null
  biggestVariation: ArticleAggregate | null
  articleAggregates: ArticleAggregate[]
  monthlySpend: { label: string; value: number }[]
  weeklySpend: { label: string; value: number }[]
  dailySpend: { label: string; value: number }[]
  weekdaySpend: { label: string; value: number }[]
  spendShare: { name: string; category: string; value: number }[]
  stableArticles: number
  risingArticles: number
  fallingArticles: number
  latestMonthKey: string
  availableMonths: string[]
  articleOptions: { key: string; label: string }[]
  categoryShare: { name: string; value: number }[]
  categoryOptions: string[]
}

const MONTH_LABEL = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' })
const DATE_LABEL = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const weekdayShort = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const chartPalette = ['#7ce1c3', '#f0c674', '#8bb8ff', '#c7a6ff', '#ff9f8f', '#8ee0ff', '#5dd1a3', '#f7d9a2']

const EXCLUDED_STATS_PATTERNS = [/\bBOLSA(?:S)?(?: DE)? PLASTIC[AO]\b/]
const EXCLUDED_STATS_MESSAGE =
  'La bolsa de plástico se conserva en el dataset y en el gasto total, pero se excluye de los rankings e insights de artículos porque suele ser el artículo más barato y repetido.'

const APP_CREATION_DATE = '25/03/2026'
const APP_VERSION = 'v.1.0'

function isExcludedFromArticleStats(articleNormalized: string): boolean {
  return EXCLUDED_STATS_PATTERNS.some((pattern) => pattern.test(articleNormalized))
}
const chartGrid = 'rgba(148, 163, 184, 0.14)'
const chartAxis = '#dbe6f5'
const chartTooltipBg = '#0f1b2d'
const chartTooltipBorder = '1px solid rgba(139, 184, 255, 0.24)'

function sanitizeSpaces(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[\t\r]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function removeAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeArticle(value: string): string {
  return removeAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferCategory(articleNormalized: string): string {
  const article = articleNormalized

  const rules: Array<{ category: string; patterns: RegExp[] }> = [
    {
      category: 'Fruta y verdura',
      patterns: [
        /\b(BANANA|PLATANO|MANZANA|PERA|NARANJA|MANDARINA|LIMON|LIMA|AGUACATE|PINA|PIÑA|KIWI|UVA|MELON|SANDIA|MELOCOTON|NECTARINA|CIRUELA|FRESA|FRAMBUESA|ARANDANO|MANGO|PAPAYA|COCO)\b/,
        /\b(TOMATE|LECHUGA|CEBOLLA|PATATA|PIMIENTO|CALABACIN|PEPINO|ZANAHORIA|BERENJENA|BROCOLI|COLIFLOR|CHAMPINON|CHAMPIÑON|SETA|ESPINACA|RUCULA|CANONIGOS|AJO|PUERRO|APIO|CALABAZA|MAIZ|JUDIA VERDE|ENSALADA)\b/,
      ],
    },
    {
      category: 'Carne y charcutería',
      patterns: [
        /\b(POLLO|PAVO|TERNERA|CERDO|VACUNO|CINTA DE LOMO|LOMO|SOLOMILLO|HAMBURGUESA|CARNE PICADA|ALBONDIGA|SALCHICHA|CHORIZO|MORCILLA|BACON|PANCETA|JAMON|JAMONCITO|PECHUGA|MUSLO)\b/,
        /\b(FIAMBRE|MORTADELA|CHOPPED|SALAMI|FUET|SOBRASADA|YORK)\b/,
      ],
    },
    {
      category: 'Pescado y marisco',
      patterns: [
        /\b(SALMON|ATUN|MERLUZA|BACALAO|DORADA|LUBINA|PANGA|ANCHOA|SARDINA|MEJILLON|CALAMAR|GAMBA|LANGOSTINO|PULPO|SEPIA|BOQUERON|MARISCO)\b/,
      ],
    },
    {
      category: 'Lácteos y huevos',
      patterns: [
        /\b(LECHE|YOGUR|YOGURT|QUESO|MOZZARELLA|MANTEQUILLA|NATA|KEFIR|BATIDO|POSTRE LACTEO|CUAJADA|REQUESON|HUEVO|HUEVOS)\b/,
      ],
    },
    {
      category: 'Panadería y bollería',
      patterns: [
        /\b(PAN|BARRA|BAGUETTE|BOLLO|BOLLERIA|CROISSANT|NAPOLITANA|MOLDE|TOSTADA|PICOS|COLINES|MAGDALENA|DONUT|GALLETA|TORTITAS|BIZCOCHO)\b/,
      ],
    },
    {
      category: 'Bebidas y aguas',
      patterns: [
        /\b(AGUA|REFRESCO|COCA COLA|COLA|FANTA|AQUARIUS|ZUMO|NECTAR|CERVEZA|VINO|TINTO|BLANCO|ROSADO|VERMUT|SIDRA|BEBIDA|ISOTONICA|HORCHATA|TE HELADO|CAFE|INFUSION)\b/,
        /\b(LANJARON|AQUABONA|SOLAN|NESTEA)\b/,
      ],
    },
    {
      category: 'Despensa y conservas',
      patterns: [
        /\b(ARROZ|PASTA|MACARRON|ESPAGUETI|FIDEO|HARINA|AZUCAR|SAL|LEGUMBRE|GARBANZO|LENTEJA|ALUBIA|QUINOA|CEREAL|AVENA|PAN RALLADO)\b/,
        /\b(TOMATE FRITO|CONSERVA|ATUN LATA|MAIZ DULCE|ACEITUNA|PEPINILLO|LEGUMBRES COCIDAS|CALDO|SOPA|PURE|CREMA)\b/,
      ],
    },
    {
      category: 'Aceites, salsas y condimentos',
      patterns: [
        /\b(ACEITE|VINAGRE|MAYONESA|KETCHUP|MOSTAZA|SALSA|PIMIENTA|PIMENTON|CURRY|OREGANO|COMINO|ESPECIA|CONDIMENTO)\b/,
      ],
    },
    {
      category: 'Congelados',
      patterns: [
        /\b(CONGELAD|HELADO|PIZZA|LASANA|EMPANADILLA|CROQUETA|PALITO|VARITAS|NUGGET|PATATA FRITA)\b/,
      ],
    },
    {
      category: 'Limpieza y hogar',
      patterns: [
        /\b(DETERGENTE|SUAVIZANTE|LEJIA|AMONIACO|LIMPIADOR|FRIEGASUELOS|LAVAVAJILLAS|BOLSAS BASURA|PAPEL HIGIENICO|SERVILLETAS|PAPEL COCINA|CELULOSA|ALUMINIO|FILM|BAYETA|ESPONJA|GUANTES|AMBIENTADOR)\b/,
      ],
    },
    {
      category: 'Higiene y cuidado personal',
      patterns: [
        /\b(CHAMPU|GEL|DESODORANTE|PASTA DENTAL|CEPILLO|CREMA|TOALLITA|MAQUILLAJE|COLONIA|JABON|HIGIENE|PROTECTOR SOLAR|AFEITADO)\b/,
      ],
    },
    {
      category: 'Dulces y snacks',
      patterns: [
        /\b(CHOCOLATE|BOMBON|PATATAS|SNACK|GUSANITO|FRUTO SECO|ALMENDRA|NUEZ|PIPA|PALOMITA|GOLOSINA|CARAMELO|BARQUILLO)\b/,
      ],
    },
    {
      category: 'Bebé y mascotas',
      patterns: [
        /\b(PANAL|TOALLITAS BEBE|POTITO|LECHE INFANTIL|COMIDA PERRO|COMIDA GATO|ARENA GATO|MASCOTA|PIENSO)\b/,
      ],
    },
    {
      category: 'Platos preparados',
      patterns: [
        /\b(EMPANADA|TORTILLA|ENSALADILLA|GAZPACHO|SALMOREJO|SUSHI|WRAP|SANDWICH|BOCADILLO|PLATO PREPARADO|COMIDA PREPARADA)\b/,
      ],
    },
  ]

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(article))) return rule.category
  }

  return 'Otros'
}

function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null) return 0
  const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : 0
}

function toISODateFromES(value: string): string | null {
  const match = value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/)
  if (!match) return null
  const [, d, m, y] = match
  const year = y.length === 2 ? `20${y}` : y
  const iso = `${year.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : iso
}

function fromISODate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2,
  }).format(value || 0)
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

function formatMonthKey(key: string): string {
  return MONTH_LABEL.format(fromISODate(`${key}-01`)).replace('.', '')
}

function getISOWeekKey(isoDate: string): string {
  const date = fromISODate(isoDate)
  const target = new Date(date.valueOf())
  const dayNumber = (date.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNumber + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = target.valueOf() - firstThursday.valueOf()
  const week = 1 + Math.round(diff / 604800000)
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function weekdayName(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(fromISODate(isoDate))
}

function makeHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return `M${Math.abs(hash)}`
}

function distinctByHash(items: LineItem[]): LineItem[] {
  const map = new Map<string, LineItem>()
  items.forEach((item) => {
    if (!map.has(item.hash)) map.set(item.hash, item)
  })
  return Array.from(map.values()).sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
}

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}

type PdfTextRow = { y: number; parts: Array<{ x: number; str: string }> }

function rebuildPdfLines(items: Array<{ str?: string; transform?: number[] }>): string[] {
  const rows: PdfTextRow[] = []
  const tolerance = 2.5

  items.forEach((item) => {
    const str = sanitizeSpaces(item.str ?? '')
    if (!str) return

    const transform = item.transform ?? []
    const x = typeof transform[4] === 'number' ? transform[4] : 0
    const y = typeof transform[5] === 'number' ? transform[5] : 0
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance)

    if (row) {
      row.parts.push({ x, str })
    } else {
      rows.push({ y, parts: [{ x, str }] })
    }
  })

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = await fileToArrayBuffer(file)
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items = content.items as Array<{ str?: string; transform?: number[] }>
    const lines = rebuildPdfLines(items)
    pages.push(lines.join('\n'))
  }

  return pages.join('\n')
}

function isNoiseLine(line: string): boolean {
  const normalized = normalizeArticle(line)
  const forbidden = [
    'TOTAL',
    'DETALLE',
    'IVA',
    'FORMA DE PAGO',
    'TARJETA',
    'EFECTIVO',
    'MERCADONA',
    'PORTAL',
    'CLIENTE',
    'RECTIFICACION',
    'FACTURA',
    'BASE IMPONIBLE',
    'CUOTA',
    'DOCUMENTO',
    'POLITICA',
    'PROTECCION',
    'DATOS',
  ]
  return forbidden.some((word) => normalized.startsWith(word) || normalized.includes(` ${word} `))
}

function extractPurchaseDate(text: string): string | null {
  const patterns = [
    /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
    /fecha\s*[:]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const iso = toISODateFromES(match[1])
      if (iso) return iso
    }
  }
  return null
}

function extractInvoiceId(text: string, fileName: string, purchaseDate: string | null): string {
  const patterns = [
    /(AV\d{4}[- ]?\d{5,})/i,
    /factura\s*(?:n[ºo]|numero|num)?\s*[:#-]?\s*([A-Z0-9-]{6,})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return sanitizeSpaces(match[1]).replace(/\s+/g, '-')
    }
  }

  const seed = `${fileName}-${purchaseDate ?? 'sin-fecha'}`
  return `PDF-${makeHash(seed)}`
}

function extractTicketTotal(text: string): number {
  const match = text.match(/TOTAL\s*\(€\)\s*(\d+(?:[.,]\d+)?)/i)
  return match ? parseNumber(match[1]) : 0
}

function getReceiptBodyLines(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => sanitizeSpaces(line))
    .filter(Boolean)

  const start = lines.findIndex((line) => /descripci[oó]n/i.test(line))
  const end = lines.findIndex((line, index) => index > start && /^TOTAL\b/i.test(line))
  if (start === -1 || end === -1 || end <= start) return []
  return lines.slice(start + 1, end)
}

function makeLineItem(args: {
  invoiceId: string
  purchaseDate: string | null
  fileName: string
  article: string
  quantity: number
  unitPrice: number
  lineTotal: number
}): LineItem {
  const { invoiceId, purchaseDate, fileName, article, quantity, unitPrice, lineTotal } = args
  return {
    invoiceId,
    purchaseDate: purchaseDate ?? '',
    purchaseYear: purchaseDate ? Number(purchaseDate.slice(0, 4)) : 0,
    purchaseMonth: purchaseDate ? monthKey(purchaseDate) : '',
    purchaseWeek: purchaseDate ? getISOWeekKey(purchaseDate) : '',
    weekday: purchaseDate ? weekdayName(purchaseDate) : '',
    article,
    articleNormalized: normalizeArticle(article),
    categoryInferred: inferCategory(normalizeArticle(article)),
    quantity,
    unitPrice,
    lineBase: lineTotal,
    taxRate: 0,
    taxAmount: 0,
    lineTotal,
    sourceFile: fileName,
    sourcePage: 1,
    parserStatus: purchaseDate ? 'parsed' : 'review',
    hash: makeHash(`${invoiceId}|${purchaseDate}|${normalizeArticle(article)}|${quantity}|${unitPrice}|${lineTotal}`),
  }
}

function parseMercadonaBodyLines(bodyLines: string[], invoiceId: string, purchaseDate: string | null, fileName: string): LineItem[] {
  const parsed: LineItem[] = []
  const seen = new Set<string>()

  for (let index = 0; index < bodyLines.length; index += 1) {
    const line = bodyLines[index]
    if (!line || isNoiseLine(line)) continue

    const weightedLine = bodyLines[index + 1]?.match(
      /^(?<qty>\d+(?:[.,]\d+)?)\s*kg\s+(?<unit>\d+(?:[.,]\d+)?)\s*€\/?kg\s+(?<total>\d+(?:[.,]\d+)?)$/i,
    )
    const weightedHeader = line.match(/^(?<count>\d+)\s+(?<name>.+)$/)
    if (weightedLine?.groups && weightedHeader?.groups) {
      const item = makeLineItem({
        invoiceId,
        purchaseDate,
        fileName,
        article: sanitizeSpaces(weightedHeader.groups.name),
        quantity: parseNumber(weightedLine.groups.qty),
        unitPrice: parseNumber(weightedLine.groups.unit),
        lineTotal: parseNumber(weightedLine.groups.total),
      })
      if (!seen.has(item.hash)) {
        seen.add(item.hash)
        parsed.push(item)
      }
      index += 1
      continue
    }

    const multiQty = line.match(/^(?<qty>\d+)\s+(?<name>.+?)\s+(?<unit>\d+(?:[.,]\d+)?)\s+(?<total>\d+(?:[.,]\d+)?)$/)
    if (multiQty?.groups) {
      const quantity = parseNumber(multiQty.groups.qty)
      const unitPrice = parseNumber(multiQty.groups.unit)
      const lineTotal = parseNumber(multiQty.groups.total)
      if (quantity > 1 && Math.abs(quantity * unitPrice - lineTotal) <= 0.03) {
        const item = makeLineItem({
          invoiceId,
          purchaseDate,
          fileName,
          article: sanitizeSpaces(multiQty.groups.name),
          quantity,
          unitPrice,
          lineTotal,
        })
        if (!seen.has(item.hash)) {
          seen.add(item.hash)
          parsed.push(item)
        }
        continue
      }
    }

    const simpleLine = line.match(/^(?<qty>\d+)\s+(?<name>.+?)\s+(?<total>\d+(?:[.,]\d+)?)$/)
    if (simpleLine?.groups) {
      const quantity = parseNumber(simpleLine.groups.qty)
      const lineTotal = parseNumber(simpleLine.groups.total)
      const unitPrice = quantity > 0 ? lineTotal / quantity : lineTotal
      const item = makeLineItem({
        invoiceId,
        purchaseDate,
        fileName,
        article: sanitizeSpaces(simpleLine.groups.name),
        quantity,
        unitPrice,
        lineTotal,
      })
      if (!seen.has(item.hash)) {
        seen.add(item.hash)
        parsed.push(item)
      }
    }
  }

  return parsed
}

function parseMercadonaPdf(rawText: string, fileName: string): { items: LineItem[]; log: IngestLog } {
  const text = rawText.replace(/ /g, ' ')
  const purchaseDate = extractPurchaseDate(text)
  const invoiceId = extractInvoiceId(text, fileName, purchaseDate)
  const ticketTotal = extractTicketTotal(text)
  const bodyLines = getReceiptBodyLines(text)
  const items = parseMercadonaBodyLines(bodyLines, invoiceId, purchaseDate, fileName)
  const parsedTotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2))
  const notes: string[] = []

  if (!purchaseDate) notes.push('No se detectó la fecha de compra con seguridad.')
  if (bodyLines.length === 0) notes.push('No se detectó el bloque entre “Descripción” y “TOTAL (€)”.')
  if (items.length === 0) notes.push('No se detectaron líneas de producto válidas. Revisión manual recomendada.')
  if (ticketTotal > 0 && Math.abs(parsedTotal - ticketTotal) > 0.05) {
    notes.push(`La suma de líneas (${formatCurrency(parsedTotal)}) no coincide con el total del ticket (${formatCurrency(ticketTotal)}).`)
  }

  const status: ParserStatus = purchaseDate && items.length > 0 && notes.length === 0 ? 'parsed' : 'review'

  return {
    items: items.map((item) => ({ ...item, parserStatus: status })),
    log: {
      fileName,
      invoiceId,
      purchaseDate,
      itemsParsed: items.length,
      status,
      notes,
    },
  }
}

function buildWorkbook(items: LineItem[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  const lineItemHeaders = [
    'invoice_id',
    'purchase_date',
    'purchase_year',
    'purchase_month',
    'purchase_week',
    'weekday',
    'article',
    'article_normalized',
    'category_inferred',
    'quantity',
    'unit_price',
    'line_base',
    'tax_rate',
    'tax_amount',
    'line_total',
    'source_file',
    'source_page',
    'parser_status',
    'hash',
  ]

  const lineItemsSheet = items.length
    ? XLSX.utils.json_to_sheet(
        items.map((item) => ({
          invoice_id: item.invoiceId,
          purchase_date: item.purchaseDate,
          purchase_year: item.purchaseYear,
          purchase_month: item.purchaseMonth,
          purchase_week: item.purchaseWeek,
          weekday: item.weekday,
          article: item.article,
          article_normalized: item.articleNormalized,
          category_inferred: item.categoryInferred,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_base: item.lineBase,
          tax_rate: item.taxRate,
          tax_amount: item.taxAmount,
          line_total: item.lineTotal,
          source_file: item.sourceFile,
          source_page: item.sourcePage,
          parser_status: item.parserStatus,
          hash: item.hash,
        })),
      )
    : XLSX.utils.aoa_to_sheet([lineItemHeaders])

  const purchases = Array.from(
    items.reduce((acc, item) => {
      const key = `${item.invoiceId}|${item.purchaseDate}`
      const current = acc.get(key) ?? {
        invoice_id: item.invoiceId,
        purchase_date: item.purchaseDate,
        purchase_month: item.purchaseMonth,
        purchase_week: item.purchaseWeek,
        items_count: 0,
        units: 0,
        ticket_total: 0,
      }
      current.items_count += 1
      current.units += item.quantity
      current.ticket_total += item.lineTotal
      acc.set(key, current)
      return acc
    }, new Map<string, any>()).values(),
  )

  const purchasesSheet = XLSX.utils.json_to_sheet(purchases)

  const articlePrices = Array.from(
    items.reduce((acc, item) => {
      const current = acc.get(item.articleNormalized) ?? {
        article: item.article,
        article_normalized: item.articleNormalized,
        category_inferred: item.categoryInferred,
        first_date: item.purchaseDate,
        last_date: item.purchaseDate,
        min_unit_price: item.unitPrice,
        max_unit_price: item.unitPrice,
        avg_unit_price_sum: 0,
        observations: 0,
        total_spend: 0,
        total_quantity: 0,
      }
      current.first_date = current.first_date && current.first_date < item.purchaseDate ? current.first_date : item.purchaseDate
      current.last_date = current.last_date && current.last_date > item.purchaseDate ? current.last_date : item.purchaseDate
      current.min_unit_price = Math.min(current.min_unit_price as number, item.unitPrice)
      current.max_unit_price = Math.max(current.max_unit_price as number, item.unitPrice)
      current.avg_unit_price_sum = (current.avg_unit_price_sum as number) + item.unitPrice
      current.observations = (current.observations as number) + 1
      current.total_spend = (current.total_spend as number) + item.lineTotal
      current.total_quantity = (current.total_quantity as number) + item.quantity
      acc.set(item.articleNormalized, current)
      return acc
    }, new Map<string, any>()).values(),
  ).map((row) => ({
    article: row.article,
    article_normalized: row.article_normalized,
    category_inferred: row.category_inferred,
    first_date: row.first_date,
    last_date: row.last_date,
    min_unit_price: row.min_unit_price,
    max_unit_price: row.max_unit_price,
    avg_unit_price: Number(row.avg_unit_price_sum) / Number(row.observations),
    observations: row.observations,
    total_spend: row.total_spend,
    total_quantity: row.total_quantity,
  }))

  const articleSheet = XLSX.utils.json_to_sheet(articlePrices)
  const metaSheet = XLSX.utils.json_to_sheet([
    {
      dataset_name: 'gastos.xlsx',
      generated_at: new Date().toISOString(),
      rows: items.length,
      guidance: 'Mantén line_items como hoja canónica para volver a cargar el dataset en la app.',
    },
  ])

  XLSX.utils.book_append_sheet(workbook, lineItemsSheet, 'line_items')
  XLSX.utils.book_append_sheet(workbook, purchasesSheet, 'purchases')
  XLSX.utils.book_append_sheet(workbook, articleSheet, 'article_prices')
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'metadata')

  return workbook
}

function exportWorkbook(items: LineItem[], fileName = 'gastos.xlsx'): void {
  const workbook = buildWorkbook(items)
  XLSX.writeFileXLSX(workbook, fileName)
}

function parseLineItemsSheet(rows: Array<Record<string, unknown>>): LineItem[] {
  return rows
    .map((row) => {
      const purchaseDate = String(row.purchase_date ?? row.fecha_compra ?? '').trim()
      const article = String(row.article ?? row.articulo ?? '').trim()
      const normalizedArticle = String(row.article_normalized ?? row.articulo_normalizado ?? normalizeArticle(article))
      const invoiceId = String(row.invoice_id ?? row.factura_id ?? '').trim() || `XLSX-${makeHash(`${purchaseDate}-${article}`)}`
      const categoryInferred = String(row.category_inferred ?? row.categoria_inferida ?? '').trim() || inferCategory(normalizedArticle)
      const quantity = parseNumber(row.quantity ?? row.cantidad)
      const unitPrice = parseNumber(row.unit_price ?? row.precio_unitario)
      const lineTotal = parseNumber(row.line_total ?? row.total_linea ?? row.total)
      const lineBase = parseNumber(row.line_base ?? row.base) || lineTotal
      const taxRate = parseNumber(row.tax_rate ?? row.iva_tipo)
      const taxAmount = parseNumber(row.tax_amount ?? row.iva_cuota)
      const sourceFile = String(row.source_file ?? row.archivo_origen ?? 'dataset.xlsx')
      const sourcePage = parseNumber(row.source_page ?? row.pagina_origen) || 1
      const parserStatus = String(row.parser_status ?? row.estado_parser ?? 'parsed') === 'review' ? 'review' : 'parsed'

      if (!purchaseDate || !article || !quantity || !unitPrice || !lineTotal) return null

      const safeMonth = monthKey(purchaseDate)
      const safeWeek = getISOWeekKey(purchaseDate)
      const safeWeekday = weekdayName(purchaseDate)
      const hash =
        String(row.hash ?? '').trim() ||
        makeHash(`${invoiceId}|${purchaseDate}|${normalizedArticle}|${quantity}|${unitPrice}|${lineTotal}`)

      return {
        invoiceId,
        purchaseDate,
        purchaseYear: Number(purchaseDate.slice(0, 4)),
        purchaseMonth: safeMonth,
        purchaseWeek: safeWeek,
        weekday: safeWeekday,
        article,
        articleNormalized: normalizedArticle,
        categoryInferred,
        quantity,
        unitPrice,
        lineBase,
        taxRate,
        taxAmount,
        lineTotal,
        sourceFile,
        sourcePage,
        parserStatus,
        hash,
      } satisfies LineItem
    })
    .filter((item): item is LineItem => Boolean(item))
}

function loadItemsFromWorkbook(arrayBuffer: ArrayBuffer): LineItem[] {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetName = workbook.SheetNames.includes('line_items') ? 'line_items' : workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  if (!sheet) {
    throw new Error('El archivo no contiene una hoja legible para line_items.')
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return distinctByHash(parseLineItemsSheet(rows))
}

function buildSummary(items: LineItem[], excludePlasticFromStats: boolean): Summary {
  const distinctInvoices = new Set(items.map((item) => `${item.invoiceId}|${item.purchaseDate}`))
  const totalSpend = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const avgTicket = distinctInvoices.size ? totalSpend / distinctInvoices.size : 0
  const latestSorted = items.length ? [...items].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate)) : []
  const latestDate = latestSorted.length ? latestSorted[latestSorted.length - 1]?.purchaseDate ?? '' : ''
  const latestMonthKey = latestDate ? monthKey(latestDate) : ''

  const monthlySpend = Array.from(
    items.reduce((acc, item) => {
      acc.set(item.purchaseMonth, (acc.get(item.purchaseMonth) ?? 0) + item.lineTotal)
      return acc
    }, new Map<string, number>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }))

  const weeklySpend = Array.from(
    items.reduce((acc, item) => {
      acc.set(item.purchaseWeek, (acc.get(item.purchaseWeek) ?? 0) + item.lineTotal)
      return acc
    }, new Map<string, number>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }))

  const dailySpend = Array.from(
    items.reduce((acc, item) => {
      acc.set(item.purchaseDate, (acc.get(item.purchaseDate) ?? 0) + item.lineTotal)
      return acc
    }, new Map<string, number>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }))

  const weekdayOrder = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
  const weekdaySpend = weekdayOrder.map((weekday) => ({
    label: weekday,
    value: items.filter((item) => item.weekday === weekday).reduce((sum, item) => sum + item.lineTotal, 0),
  }))

  const articleStatsItems = items.filter((item) => !excludePlasticFromStats || !isExcludedFromArticleStats(item.articleNormalized))

  const aggregateMap = new Map<
    string,
    {
      key: string
      labelVotes: Map<string, number>
      categoryVotes: Map<string, number>
      quantity: number
      occurrences: number
      spend: number
      minUnitPrice: number
      maxUnitPrice: number
      observations: Array<{ date: string; price: number }>
    }
  >()

  articleStatsItems.forEach((item) => {
    const current =
      aggregateMap.get(item.articleNormalized) ?? {
        key: item.articleNormalized,
        labelVotes: new Map<string, number>(),
        categoryVotes: new Map<string, number>(),
        quantity: 0,
        occurrences: 0,
        spend: 0,
        minUnitPrice: item.unitPrice,
        maxUnitPrice: item.unitPrice,
        observations: [],
      }
    current.labelVotes.set(item.article, (current.labelVotes.get(item.article) ?? 0) + 1)
    current.categoryVotes.set(item.categoryInferred, (current.categoryVotes.get(item.categoryInferred) ?? 0) + 1)
    current.quantity += item.quantity
    current.occurrences += 1
    current.spend += item.lineTotal
    current.minUnitPrice = Math.min(current.minUnitPrice, item.unitPrice)
    current.maxUnitPrice = Math.max(current.maxUnitPrice, item.unitPrice)
    current.observations.push({ date: item.purchaseDate, price: item.unitPrice })
    aggregateMap.set(item.articleNormalized, current)
  })

  const articleAggregates: ArticleAggregate[] = Array.from(aggregateMap.values())
    .map((value) => {
      const sortedObservations = [...value.observations].sort((a, b) => a.date.localeCompare(b.date))
      const label = Array.from(value.labelVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? value.key
      const categoryInferred = Array.from(value.categoryVotes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Otros'
      const avgUnitPrice = sortedObservations.length
        ? sortedObservations.reduce((sum, item) => sum + item.price, 0) / sortedObservations.length
        : 0
      const firstPrice = sortedObservations[0]?.price ?? 0
      const lastPrice = sortedObservations.length ? sortedObservations[sortedObservations.length - 1]?.price ?? 0 : 0
      const variationAbs = lastPrice - firstPrice
      const variationPct = firstPrice ? (variationAbs / firstPrice) * 100 : 0

      return {
        key: value.key,
        label,
        categoryInferred,
        quantity: value.quantity,
        occurrences: value.occurrences,
        spend: value.spend,
        avgUnitPrice,
        minUnitPrice: value.minUnitPrice,
        maxUnitPrice: value.maxUnitPrice,
        firstPrice,
        lastPrice,
        firstDate: sortedObservations[0]?.date ?? '',
        lastDate: sortedObservations.length ? sortedObservations[sortedObservations.length - 1]?.date ?? '' : '',
        variationPct,
        variationAbs,
      }
    })
    .sort((a, b) => b.spend - a.spend)

  const spendShare = articleAggregates.slice(0, 8).map((item) => ({ name: item.label, category: item.categoryInferred, value: item.spend }))
  const categoryShare = Array.from(
    items.reduce((acc, item) => {
      acc.set(item.categoryInferred, (acc.get(item.categoryInferred) ?? 0) + item.lineTotal)
      return acc
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))
  const stableArticles = articleAggregates.filter((item) => Math.abs(item.variationPct) < 0.01).length
  const risingArticles = articleAggregates.filter((item) => item.variationPct >= 0.01).length
  const fallingArticles = articleAggregates.filter((item) => item.variationPct <= -0.01).length
  const latestMonthSpend = monthlySpend.find((item) => item.label === latestMonthKey)?.value ?? 0

  return {
    totalSpend,
    ticketCount: distinctInvoices.size,
    avgTicket,
    latestMonthLabel: latestMonthKey ? formatMonthKey(latestMonthKey) : '-',
    latestMonthSpend,
    topPurchased: [...articleAggregates].sort((a, b) => b.quantity - a.quantity)[0] ?? null,
    mostRepeated: [...articleAggregates].sort((a, b) => b.occurrences - a.occurrences)[0] ?? null,
    mostExpensive: [...articleAggregates].sort((a, b) => b.avgUnitPrice - a.avgUnitPrice)[0] ?? null,
    cheapest: [...articleAggregates].sort((a, b) => a.avgUnitPrice - b.avgUnitPrice)[0] ?? null,
    biggestVariation: [...articleAggregates].sort((a, b) => Math.abs(b.variationPct) - Math.abs(a.variationPct))[0] ?? null,
    articleAggregates,
    monthlySpend,
    weeklySpend,
    dailySpend,
    weekdaySpend,
    spendShare,
    stableArticles,
    risingArticles,
    fallingArticles,
    latestMonthKey,
    availableMonths: [...new Set(items.map((item) => item.purchaseMonth))].sort(),
    articleOptions: articleAggregates.map((item) => ({ key: item.key, label: item.label })),
    categoryShare,
    categoryOptions: [...new Set(items.map((item) => item.categoryInferred))].sort(),
  }
}

function buildCalendarMatrix(month: string): Array<(string | null)[]> {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return []
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const firstDay = new Date(year, monthNumber - 1, 1)
  const startIndex = (firstDay.getDay() + 6) % 7
  const cells: (string | null)[] = Array.from({ length: startIndex }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const matrix: Array<(string | null)[]> = []
  for (let i = 0; i < cells.length; i += 7) matrix.push(cells.slice(i, i + 7))
  return matrix
}

function intensityColor(value: number, max: number): string {
  if (!value || !max) return 'rgba(255, 255, 255, 0.035)'
  const ratio = value / max
  if (ratio < 0.2) return 'rgba(124, 225, 195, 0.18)'
  if (ratio < 0.4) return 'rgba(124, 225, 195, 0.3)'
  if (ratio < 0.6) return 'rgba(139, 184, 255, 0.42)'
  if (ratio < 0.8) return 'rgba(139, 184, 255, 0.58)'
  return 'rgba(240, 198, 116, 0.76)'
}

function MetricCard({
  title,
  value,
  caption,
  icon,
  accent,
}: {
  title: string
  value: string
  caption: string
  icon: ReactNode
  accent?: 'green' | 'orange' | 'rose'
}) {
  return (
    <div className={`metric-card ${accent ? `accent-${accent}` : ''}`}>
      <div className="metric-top">
        <span>{title}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
      <p className="metric-caption">{caption}</p>
    </div>
  )
}

function Panel({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

function CalendarHeatmap({
  month,
  values,
  formatter,
}: {
  month: string
  values: Record<string, number>
  formatter: (value: number) => string
}) {
  const matrix = buildCalendarMatrix(month)
  const max = Math.max(0, ...Object.values(values))

  if (!month) {
    return <div className="empty-card small">Todavía no hay un mes disponible.</div>
  }

  return (
    <div className="calendar-wrapper">
      <div className="calendar-weekdays">
        {weekdayShort.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {matrix.flat().map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="calendar-cell empty" />
          const value = values[date] ?? 0
          return (
            <div
              key={date}
              className="calendar-cell"
              style={{ background: intensityColor(value, max) }}
              title={`${DATE_LABEL.format(fromISODate(date))}: ${formatter(value)}`}
            >
              <strong>{Number(date.slice(-2))}</strong>
              <span>{value ? formatter(value) : '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function App() {
  const [items, setItems] = useState<LineItem[]>([])
  const [logs, setLogs] = useState<IngestLog[]>([])
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard')
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('month')
  const [rankingMode, setRankingMode] = useState<RankingMode>('spend')
  const [selectedSpendMonth, setSelectedSpendMonth] = useState('')
  const [selectedPriceMonth, setSelectedPriceMonth] = useState('')
  const [selectedArticle, setSelectedArticle] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [excludePlasticFromStats, setExcludePlasticFromStats] = useState(true)
  const [priceStateView, setPriceStateView] = useState<PriceStateMode>(null)
  const [datasetSearch, setDatasetSearch] = useState('')
  const [datasetPage, setDatasetPage] = useState(1)

  const summary = useMemo(() => buildSummary(items, excludePlasticFromStats), [items, excludePlasticFromStats])
  const excludedItemsInDataset = useMemo(
    () => items.filter((item) => isExcludedFromArticleStats(item.articleNormalized)).length,
    [items],
  )

  useEffect(() => {
    if (!selectedSpendMonth && summary.latestMonthKey) setSelectedSpendMonth(summary.latestMonthKey)
    if (!selectedPriceMonth && summary.latestMonthKey) setSelectedPriceMonth(summary.latestMonthKey)
    const articleExists = summary.articleOptions.some((item) => item.key === selectedArticle)
    if ((!selectedArticle || !articleExists) && summary.articleOptions[0]?.key) setSelectedArticle(summary.articleOptions[0].key)
  }, [selectedArticle, selectedPriceMonth, selectedSpendMonth, summary.articleOptions, summary.latestMonthKey])


  useEffect(() => {
    setDatasetPage(1)
  }, [datasetSearch])

  const ranking = useMemo(() => {
    const copy = [...summary.articleAggregates]
    if (rankingMode === 'quantity') return copy.sort((a, b) => b.quantity - a.quantity)
    if (rankingMode === 'occurrences') return copy.sort((a, b) => b.occurrences - a.occurrences)
    return copy.sort((a, b) => b.spend - a.spend)
  }, [rankingMode, summary.articleAggregates])

  const timelineData = useMemo(() => {
    if (timelineMode === 'week') return summary.weeklySpend
    if (timelineMode === 'day') return summary.dailySpend.slice(-45)
    return summary.monthlySpend
  }, [summary.dailySpend, summary.monthlySpend, summary.weeklySpend, timelineMode])

  const timelineAverage = useMemo(() => {
    if (!timelineData.length) return 0
    return timelineData.reduce((sum, item) => sum + item.value, 0) / timelineData.length
  }, [timelineData])

  const spendCalendarValues = useMemo(() => {
    return items
      .filter((item) => item.purchaseMonth === selectedSpendMonth)
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.purchaseDate] = (acc[item.purchaseDate] ?? 0) + item.lineTotal
        return acc
      }, {})
  }, [items, selectedSpendMonth])

  const priceCalendarValues = useMemo(() => {
    const buckets = new Map<string, { total: number; count: number }>()
    items
      .filter((item) => item.purchaseMonth === selectedPriceMonth && item.articleNormalized === selectedArticle)
      .forEach((item) => {
        const current = buckets.get(item.purchaseDate) ?? { total: 0, count: 0 }
        current.total += item.unitPrice
        current.count += 1
        buckets.set(item.purchaseDate, current)
      })

    return Array.from(buckets.entries()).reduce<Record<string, number>>((acc, [date, value]) => {
      acc[date] = value.total / value.count
      return acc
    }, {})
  }, [items, selectedArticle, selectedPriceMonth])

  const selectedArticleHistory = useMemo(() => {
    const buckets = new Map<string, { total: number; count: number }>()
    items
      .filter((item) => item.articleNormalized === selectedArticle)
      .forEach((item) => {
        const current = buckets.get(item.purchaseDate) ?? { total: 0, count: 0 }
        current.total += item.unitPrice
        current.count += 1
        buckets.set(item.purchaseDate, current)
      })

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        label: date,
        value: value.total / value.count,
      }))
  }, [items, selectedArticle])

  async function handleDatasetUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsBusy(true)
      setStatusMessage(`Cargando dataset ${file.name}...`)
      const buffer = await file.arrayBuffer()
      const loaded = loadItemsFromWorkbook(buffer)
      setItems((current) => distinctByHash([...current, ...loaded]))
      if (loaded.length === 0) {
        setStatusMessage(`Dataset ${file.name} cargado correctamente, pero está vacío: la hoja line_items solo contiene cabeceras.`)
      } else {
        setStatusMessage(`Dataset ${file.name} incorporado con ${loaded.length} filas.`)
        setActiveTab('dashboard')
      }
    } catch (error) {
      setStatusMessage(`No se pudo leer ${file.name}. Verifica que incluya una hoja line_items.`)
      console.error(error)
    } finally {
      setIsBusy(false)
      event.target.value = ''
    }
  }

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    setIsBusy(true)
    const newLogs: IngestLog[] = []
    const parsedItems: LineItem[] = []

    try {
      for (const file of files) {
        setStatusMessage(`Extrayendo datos de ${file.name}...`)
        const text = await extractPdfText(file)
        const parsed = parseMercadonaPdf(text, file.name)
        newLogs.push(parsed.log)
        parsedItems.push(...parsed.items)
      }

      setLogs((current) => [...newLogs, ...current])
      setItems((current) => distinctByHash([...current, ...parsedItems]))
      setStatusMessage(`Ingesta terminada. ${parsedItems.length} líneas nuevas añadidas desde ${files.length} PDF.`)
      setActiveTab('dashboard')
    } catch (error) {
      setStatusMessage('Se produjo un error al leer uno o más PDFs. Revisa la consola del navegador.')
      console.error(error)
    } finally {
      setIsBusy(false)
      event.target.value = ''
    }
  }

  function handleDownloadDataset(): void {
    if (!items.length) return
    exportWorkbook(items)
    setStatusMessage('Se ha preparado la descarga de gastos.xlsx.')
  }

  function handleDownloadTemplate(): void {
    exportWorkbook([], 'gastos.xlsx')
    setStatusMessage('Se ha preparado una plantilla vacía de gastos.xlsx.')
  }

  const hasData = items.length > 0
  const reviewLogs = logs.filter((log) => log.status === 'review')
  const risingPriceArticles = useMemo(() => [...summary.articleAggregates].filter((item) => item.variationPct >= 0.01).sort((a, b) => b.variationPct - a.variationPct), [summary.articleAggregates])
  const stablePriceArticles = useMemo(() => [...summary.articleAggregates].filter((item) => Math.abs(item.variationPct) < 0.01).sort((a, b) => a.label.localeCompare(b.label, 'es')), [summary.articleAggregates])
  const fallingPriceArticles = useMemo(() => [...summary.articleAggregates].filter((item) => item.variationPct <= -0.01).sort((a, b) => a.variationPct - b.variationPct), [summary.articleAggregates])
  const biggestRise = risingPriceArticles[0] ?? null
  const biggestDrop = fallingPriceArticles[0] ?? null
  const priceStateDetails = priceStateView === 'rising' ? risingPriceArticles : priceStateView === 'stable' ? stablePriceArticles : priceStateView === 'falling' ? fallingPriceArticles : []
  const selectedArticleLabel = summary.articleOptions.find((item) => item.key === selectedArticle)?.label ?? '—'

  const datasetRows = useMemo(() => {
    return [...items]
      .sort(
        (a, b) =>
          a.purchaseDate.localeCompare(b.purchaseDate) ||
          a.invoiceId.localeCompare(b.invoiceId) ||
          a.article.localeCompare(b.article, 'es'),
      )
      .map((item) => ({
        invoice_id: item.invoiceId,
        purchase_date: item.purchaseDate,
        purchase_month: item.purchaseMonth,
        purchase_week: item.purchaseWeek,
        weekday: item.weekday,
        article: item.article,
        article_normalized: item.articleNormalized,
        category_inferred: item.categoryInferred,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_base: item.lineBase,
        tax_rate: item.taxRate,
        tax_amount: item.taxAmount,
        line_total: item.lineTotal,
        source_file: item.sourceFile,
        parser_status: item.parserStatus,
        hash: item.hash,
      }))
  }, [items])

  const datasetColumns = [
    'invoice_id',
    'purchase_date',
    'purchase_month',
    'purchase_week',
    'weekday',
    'article',
    'article_normalized',
    'category_inferred',
    'quantity',
    'unit_price',
    'line_base',
    'tax_rate',
    'tax_amount',
    'line_total',
    'source_file',
    'parser_status',
    'hash',
  ] as const

  const filteredDatasetRows = useMemo(() => {
    const query = datasetSearch.trim().toLowerCase()
    if (!query) return datasetRows
    return datasetRows.filter((row) => datasetColumns.some((column) => String(row[column]).toLowerCase().includes(query)))
  }, [datasetRows, datasetSearch])

  const datasetPageSize = 14
  const datasetTotalPages = Math.max(1, Math.ceil(filteredDatasetRows.length / datasetPageSize))
  const safeDatasetPage = Math.min(datasetPage, datasetTotalPages)
  const visibleDatasetRows = filteredDatasetRows.slice((safeDatasetPage - 1) * datasetPageSize, safeDatasetPage * datasetPageSize)

  return (
    <div className="app-shell">
      <div className="glow glow-1" />
      <div className="glow glow-2" />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-title-row">
            <h1>Mercadona-Dashboard</h1>
            <div className="brand-meta-inline">
              <span>by @NachusS</span>
              <span>{APP_CREATION_DATE}</span>
              <span>{APP_VERSION}</span>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <button className={activeTab === 'dashboard' ? 'nav-btn active' : 'nav-btn'} onClick={() => setActiveTab('dashboard')}>
            Dashboard
          </button>
          <button className={activeTab === 'datos' ? 'nav-btn active' : 'nav-btn'} onClick={() => setActiveTab('datos')}>
            Datos
          </button>
          <button className={activeTab === 'esquema' ? 'nav-btn active' : 'nav-btn'} onClick={() => setActiveTab('esquema')}>
            Dataset
          </button>
        </div>
      </header>



      {activeTab === 'dashboard' ? (
        <main className="page-grid">
          <section className="metrics-grid">
            <MetricCard
              title="Gasto total"
              value={formatCurrency(summary.totalSpend)}
              caption={`${summary.ticketCount} tickets analizados`}
              icon={<Euro size={18} />}
            />
            <MetricCard
              title="Gasto del último mes"
              value={formatCurrency(summary.latestMonthSpend)}
              caption={summary.latestMonthLabel}
              icon={<CalendarDays size={18} />}
              accent="green"
            />
            <MetricCard
              title="Artículo más comprado"
              value={summary.topPurchased ? summary.topPurchased.label : '—'}
              caption={summary.topPurchased ? `${formatNumber(summary.topPurchased.quantity)} unidades` : 'Sin datos'}
              icon={<ShoppingCart size={18} />}
            />
            <MetricCard
              title="Artículo más repetido"
              value={summary.mostRepeated ? summary.mostRepeated.label : '—'}
              caption={summary.mostRepeated ? `${summary.mostRepeated.occurrences} apariciones` : 'Sin datos'}
              icon={<Sparkles size={18} />}
            />
            <MetricCard
              title="Artículo más caro"
              value={summary.mostExpensive ? summary.mostExpensive.label : '—'}
              caption={summary.mostExpensive ? formatCurrency(summary.mostExpensive.avgUnitPrice) : 'Sin datos'}
              icon={<TrendingUp size={18} />}
              accent="orange"
            />
            <MetricCard
              title="Artículo más barato"
              value={summary.cheapest ? summary.cheapest.label : '—'}
              caption={summary.cheapest ? formatCurrency(summary.cheapest.avgUnitPrice) : 'Sin datos'}
              icon={<TrendingDown size={18} />}
              accent="rose"
            />
          </section>

          <div className="dashboard-note">
            <AlertTriangle size={16} />
            <span>{excludePlasticFromStats ? EXCLUDED_STATS_MESSAGE : "La bolsa de plástico también participa ahora en rankings e insights de artículos."}</span>
          </div>

          {!hasData ? (
            <section className="empty-state large">
              <PackageSearch size={38} />
              <h2>Sube tu primer dataset o varias facturas para activar el dashboard.</h2>
              <p>
                En cuanto haya datos, verás evolución por mes, semana y día; calendario de gasto; precio por artículo y ranking
                interactivo.
              </p>
            </section>
          ) : (
            <>
              <div className="content-grid content-grid-2x1">
                <Panel
                  title="Evolución del gasto"
                  subtitle="Alterna entre vista mensual, semanal o diaria."
                  actions={
                    <div className="segmented-control">
                      {(['month', 'week', 'day'] as TimelineMode[]).map((mode) => (
                        <button key={mode} className={timelineMode === mode ? 'active' : ''} onClick={() => setTimelineMode(mode)}>
                          {mode === 'month' ? 'Mes' : mode === 'week' ? 'Semana' : 'Día'}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <div className="chart-frame tall">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timelineData}>
                        <defs>
                          <linearGradient id="gastoFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor="#7ce1c3" stopOpacity={0.52} />
                            <stop offset="95%" stopColor="#7ce1c3" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: chartAxis, fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={(value) => `${value}€`} tick={{ fill: chartAxis, fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          formatter={(value: number, name: string) => [formatCurrency(value), name === 'media' ? 'Media del gasto' : 'Gasto']}
                          contentStyle={{ background: chartTooltipBg, border: chartTooltipBorder, borderRadius: 14, color: '#f4f7fb' }}
                        />
                        <ReferenceLine
                          y={timelineAverage}
                          stroke="#f0c674"
                          strokeWidth={3}
                          strokeDasharray="10 8"
                          ifOverflow="extendDomain"
                          label={{ value: `Media ${formatCurrency(timelineAverage)}`, position: 'insideTopRight', fill: '#f6d58c', fontSize: 12, fontWeight: 700 }}
                        />
                        <Area type="monotone" name="gasto" dataKey="value" stroke="#7ce1c3" fill="url(#gastoFill)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel title="Desglose de artículos" subtitle="Participación de gasto de los 8 artículos con mayor peso. El nombre del producto rodea el rosco y el detalle completo aparece al pasar el cursor.">
                  <div className="chart-frame article-breakdown-chart article-breakdown-chart-compact">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 18, right: 68, bottom: 18, left: 68 }}>
                        <Tooltip
                          formatter={(value: number, _name: string, payload: { payload?: { category?: string } }) => [formatCurrency(value), payload?.payload?.category ? `Categoría · ${payload.payload.category}` : 'Gasto']}
                          contentStyle={{ background: chartTooltipBg, border: chartTooltipBorder, borderRadius: 14, color: '#f4f7fb' }}
                        />
                        <Pie
                          data={summary.spendShare}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={64}
                          outerRadius={118}
                          paddingAngle={3}
                          labelLine={{ stroke: 'rgba(226, 232, 240, 0.42)', strokeWidth: 1.2 }}
                          label={({ cx, cy, midAngle, outerRadius, percent, name }) => {
                            if (
                              typeof cx !== 'number' ||
                              typeof cy !== 'number' ||
                              typeof midAngle !== 'number' ||
                              typeof outerRadius !== 'number' ||
                              typeof percent !== 'number'
                            ) return null
                            if (percent < 0.045 || typeof name !== 'string') return null
                            const radius = outerRadius + 22
                            const x = cx + radius * Math.cos((-midAngle * Math.PI) / 180)
                            const y = cy + radius * Math.sin((-midAngle * Math.PI) / 180)
                            const isRight = x >= cx
                            const label = name.length > 20 ? `${name.slice(0, 18)}…` : name
                            return (
                              <text
                                x={x}
                                y={y}
                                fill="#e9f1fb"
                                textAnchor={isRight ? 'start' : 'end'}
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight={600}
                              >
                                {label}
                              </text>
                            )
                          }}
                        >
                          {summary.spendShare.map((entry, index) => (
                            <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="inside"
                            formatter={(value: number) => `${formatNumber(value)} €`}
                            className="article-breakdown-value-label"
                          />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </div>

              <div className="content-grid content-grid-2x1">
                <Panel
                  title="Calendario de gasto"
                  subtitle="Vista diaria del gasto para el mes seleccionado."
                  actions={
                    <select value={selectedSpendMonth} onChange={(event) => setSelectedSpendMonth(event.target.value)}>
                      {summary.availableMonths.map((month) => (
                        <option key={month} value={month}>
                          {formatMonthKey(month)}
                        </option>
                      ))}
                    </select>
                  }
                >
                  <CalendarHeatmap month={selectedSpendMonth} values={spendCalendarValues} formatter={formatCurrency} />
                </Panel>

                <Panel
                  title="Calendario de precio por artículo"
                  subtitle="Precio medio diario del artículo seleccionado."
                  actions={
                    <div className="filter-bar compact">
                      <select value={selectedPriceMonth} onChange={(event) => setSelectedPriceMonth(event.target.value)}>
                        {summary.availableMonths.map((month) => (
                          <option key={month} value={month}>
                            {formatMonthKey(month)}
                          </option>
                        ))}
                      </select>
                      <select value={selectedArticle} onChange={(event) => setSelectedArticle(event.target.value)}>
                        {summary.articleOptions.map((article) => (
                          <option key={article.key} value={article.key}>
                            {article.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  }
                >
                  <CalendarHeatmap month={selectedPriceMonth} values={priceCalendarValues} formatter={formatCurrency} />
                </Panel>
              </div>

              <div className="content-grid content-grid-2x1">
                <Panel title="Evolución del precio" subtitle={`Serie histórica del precio medio para ${selectedArticleLabel}.`}>
                  <div className="chart-frame tall">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selectedArticleHistory}>
                        <CartesianGrid stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: chartAxis, fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={(value) => `${value}€`} tick={{ fill: chartAxis, fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          cursor={{ fill: 'rgba(240, 198, 116, 0.14)' }}
                          contentStyle={{ background: chartTooltipBg, border: '1px solid rgba(240, 198, 116, 0.3)', borderRadius: 14, color: '#f4f7fb' }}
                        />
                        <Bar dataKey="value" fill="#8bb8ff" stroke="#c6dbff" strokeWidth={1.2} radius={[10, 10, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Estado de precios" subtitle="Qué artículos suben, bajan o se mantienen en el histórico cargado.">
                  <div className="stat-strip">
                    <div>
                      <span>Suben</span>
                      <button
                        type="button"
                        className={priceStateView === 'rising' ? 'stat-action-btn active' : 'stat-action-btn'}
                        onClick={() => setPriceStateView((current) => (current === 'rising' ? null : 'rising'))}
                      >
                        {summary.risingArticles}
                      </button>
                    </div>
                    <div>
                      <span>Se mantienen</span>
                      <button
                        type="button"
                        className={priceStateView === 'stable' ? 'stat-action-btn active' : 'stat-action-btn'}
                        onClick={() => setPriceStateView((current) => (current === 'stable' ? null : 'stable'))}
                      >
                        {summary.stableArticles}
                      </button>
                    </div>
                    <div>
                      <span>Bajan</span>
                      <button
                        type="button"
                        className={priceStateView === 'falling' ? 'stat-action-btn active' : 'stat-action-btn'}
                        onClick={() => setPriceStateView((current) => (current === 'falling' ? null : 'falling'))}
                      >
                        {summary.fallingArticles}
                      </button>
                    </div>
                  </div>
                  {priceStateView ? (
                    <div className="price-state-list-card">
                      <div className="price-state-list-head">
                        <div>
                          <h4>
                            {priceStateView === 'rising'
                              ? 'Productos que suben'
                              : priceStateView === 'stable'
                                ? 'Productos que se mantienen'
                                : 'Productos que bajan'}
                          </h4>
                          <p>
                            {priceStateView === 'stable'
                              ? 'Listado de artículos sin cambio apreciable en su precio histórico.'
                              : 'Listado de artículos con la diferencia respecto a su primer precio detectado.'}
                          </p>
                        </div>
                        <button type="button" className="inline-ghost-btn" onClick={() => setPriceStateView(null)}>
                          Cerrar
                        </button>
                      </div>
                      <div className="price-state-list">
                        {priceStateDetails.map((item) => (
                          <div key={item.key} className="price-state-item">
                            <div>
                              <strong>{item.label}</strong>
                              <span>
                                De {formatCurrency(item.firstPrice)} a {formatCurrency(item.lastPrice)} · {item.firstDate} → {item.lastDate}
                              </span>
                            </div>
                            <span className={item.variationPct > 0 ? 'trend-pill up' : item.variationPct < 0 ? 'trend-pill down' : 'trend-pill neutral'}>
                              {priceStateView === 'stable' ? 'Sin cambios' : `${formatCurrency(item.variationAbs)} · ${formatPct(item.variationPct)}`}
                            </span>
                          </div>
                        ))}
                        {!priceStateDetails.length ? <p>No hay productos en esta categoría de evolución.</p> : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="price-alert-grid">
                    <div className="price-alert-card">
                      <h4>Variación al alza</h4>
                      {biggestRise ? (
                        <>
                          <strong>{biggestRise.label}</strong>
                          <p>
                            De {formatCurrency(biggestRise.firstPrice)} a {formatCurrency(biggestRise.lastPrice)} entre {biggestRise.firstDate} y {biggestRise.lastDate}.
                          </p>
                          <span className="trend-pill up">{formatCurrency(biggestRise.variationAbs)} · {formatPct(biggestRise.variationPct)}</span>
                        </>
                      ) : (
                        <p>No hay suficiente histórico con subidas para medir variaciones.</p>
                      )}
                    </div>
                    <div className="price-alert-card">
                      <h4>Variación a la baja</h4>
                      {biggestDrop ? (
                        <>
                          <strong>{biggestDrop.label}</strong>
                          <p>
                            De {formatCurrency(biggestDrop.firstPrice)} a {formatCurrency(biggestDrop.lastPrice)} entre {biggestDrop.firstDate} y {biggestDrop.lastDate}.
                          </p>
                          <span className="trend-pill down">{formatCurrency(biggestDrop.variationAbs)} · {formatPct(biggestDrop.variationPct)}</span>
                        </>
                      ) : (
                        <p>No hay suficiente histórico con bajadas para medir variaciones.</p>
                      )}
                    </div>
                  </div>
                </Panel>
              </div>

              <Panel
                title="Ranking de artículos"
                subtitle="Ordena por gasto total, cantidad comprada o número de repeticiones."
                actions={
                  <div className="segmented-control">
                    {(['spend', 'quantity', 'occurrences'] as RankingMode[]).map((mode) => (
                      <button key={mode} className={rankingMode === mode ? 'active' : ''} onClick={() => setRankingMode(mode)}>
                        {mode === 'spend' ? 'Gasto' : mode === 'quantity' ? 'Cantidad' : 'Repetición'}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Artículo</th>
                        <th>Categoría</th>
                        <th>Gasto</th>
                        <th>Unidades</th>
                        <th>Veces</th>
                        <th>Precio medio</th>
                        <th>Variación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.slice(0, 20).map((item, index) => (
                        <tr key={item.key}>
                          <td>{index + 1}</td>
                          <td>{item.label}</td>
                          <td>{item.categoryInferred}</td>
                          <td>{formatCurrency(item.spend)}</td>
                          <td>{formatNumber(item.quantity)}</td>
                          <td>{item.occurrences}</td>
                          <td>{formatCurrency(item.avgUnitPrice)}</td>
                          <td>
                            <span className={item.variationPct >= 0 ? 'trend-pill up' : 'trend-pill down'}>{formatPct(item.variationPct)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </main>
      ) : null}

      {activeTab === 'datos' ? (
        <main className="page-grid">
      <section className="hero-grid">
        <div className="hero-card hero-card-primary">
          <div className="hero-icon-wrap">
            <ShoppingCart size={26} />
          </div>
          <div>
            <h2>¿Ya tienes el dataset o empiezas desde PDFs?</h2>
            <p>
              La app soporta ambos caminos: cargar tu <strong>gastos.xlsx</strong> actual o alimentar el dataset desde nuevas facturas.
            </p>
          </div>
          <div className="hero-actions">
            <label className="cta-btn cta-solid">
              <Upload size={16} /> Cargar gastos.xlsx
              <input type="file" accept=".xlsx,.xls" onChange={handleDatasetUpload} hidden />
            </label>
            <label className="cta-btn cta-ghost">
              <FileText size={16} /> Cargar facturas PDF
              <input type="file" accept="application/pdf" multiple onChange={handlePdfUpload} hidden />
            </label>
            <button className="cta-btn cta-soft" onClick={handleDownloadTemplate}>
              <FileSpreadsheet size={16} /> Plantilla gastos.xlsx
            </button>
          </div>
        </div>

        <div className="hero-card stats-snapshot">
          <div>
            <span className="eyebrow">Estado actual</span>
            <h3>{hasData ? `${items.length} líneas en tu dataset` : 'Todavía no hay datos cargados'}</h3>
            <p>
              {statusMessage || 'El flujo recomendado es: cargar dataset → añadir PDFs → descargar gastos.xlsx.'}
              {excludedItemsInDataset > 0 ? ` ${excludePlasticFromStats ? EXCLUDED_STATS_MESSAGE : 'La bolsa de plástico se ha vuelto a incluir en las estadísticas finales.'}` : ''}
            </p>
          </div>
          <div className="snapshot-tags">
            <span>
              <BadgeCheck size={14} /> Excel descargable
            </span>
            <span>
              <CalendarDays size={14} /> Calendario de gasto
            </span>
            <span>
              <TrendingUp size={14} /> Variación de precios
            </span>
          </div>
          <div className="toggle-card">
            <div>
              <strong>Excluir bolsa de plástico de las estadísticas finales</strong>
              <p>
                Mantiene la bolsa dentro del dataset y del gasto total, pero puedes decidir si participa o no en los rankings e insights.
              </p>
            </div>
            <button
              type="button"
              className={excludePlasticFromStats ? 'switch active' : 'switch'}
              aria-pressed={excludePlasticFromStats}
              onClick={() => setExcludePlasticFromStats((value) => !value)}
            >
              <span className="switch-thumb" />
              <span className="switch-label">{excludePlasticFromStats ? 'Excluida' : 'Incluida'}</span>
            </button>
          </div>
          <button className="cta-btn cta-solid full" disabled={!hasData} onClick={handleDownloadDataset}>
            <Download size={16} /> Descargar gastos.xlsx
          </button>
        </div>
      </section>

          <div className="content-grid content-grid-2x1">
            <Panel title="1. Cargar dataset existente" subtitle="Importa tu gastos.xlsx para seguir ampliándolo con nuevas facturas.">
              <div className="step-card">
                <div className="step-icon">
                  <Database size={20} />
                </div>
                <div>
                  <h4>Reutiliza tu histórico</h4>
                  <p>
                    Si ya dispones de <strong>gastos.xlsx</strong>, esta opción lo incorpora a la memoria del navegador y te permite seguir
                    alimentándolo con más PDFs.
                  </p>
                </div>
              </div>
              <label className="dropzone">
                <Upload size={22} />
                <strong>Seleccionar dataset Excel</strong>
                <span>Formato recomendado: hoja line_items con los campos exportados por esta app.</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleDatasetUpload} hidden />
              </label>
            </Panel>

            <Panel title="2. Alimentar con facturas PDF" subtitle="Carga una o varias facturas para extraer día, artículo y precios.">
              <div className="step-card">
                <div className="step-icon">
                  <FileText size={20} />
                </div>
                <div>
                  <h4>Ingesta desde PDF</h4>
                  <p>
                    El parser intenta reconocer fecha, identificador de factura y líneas de producto. Cuando no está seguro, marca la
                    factura como revisable sin romper el dataset.
                  </p>
                </div>
              </div>
              <label className="dropzone accent">
                <FileText size={22} />
                <strong>Seleccionar facturas PDF</strong>
                <span>Se pueden subir varias a la vez.</span>
                <input type="file" accept="application/pdf" multiple onChange={handlePdfUpload} hidden />
              </label>
            </Panel>
          </div>

          <div className="content-grid content-grid-2x1">
            <Panel title="3. Descargar dataset" subtitle="Cada vez que completes una ingesta, descarga gastos.xlsx para conservar el estado.">
              <div className="download-stack">
                <button className="cta-btn cta-solid full" disabled={!items.length} onClick={handleDownloadDataset}>
                  <Download size={16} /> Descargar gastos.xlsx
                </button>
                <button className="cta-btn cta-soft full" onClick={handleDownloadTemplate}>
                  <FileSpreadsheet size={16} /> Descargar plantilla vacía
                </button>
              </div>
            </Panel>

            <Panel title="Estado de ingestión" subtitle="Resumen de lo último procesado en esta sesión.">
              <div className="status-grid">
                <div>
                  <span>Filas en memoria</span>
                  <strong>{items.length}</strong>
                </div>
                <div>
                  <span>Facturas con revisión</span>
                  <strong>{reviewLogs.length}</strong>
                </div>
                <div>
                  <span>Procesando</span>
                  <strong>{isBusy ? 'Sí' : 'No'}</strong>
                </div>
              </div>
              <p className="status-message">{statusMessage || 'Todavía no se ha ejecutado ninguna carga en esta sesión.'}</p>
            </Panel>
          </div>

          <Panel title="Registro de facturas" subtitle="Últimos archivos procesados y posibles incidencias.">
            {logs.length === 0 ? (
              <div className="empty-card small">Aún no hay logs de carga en esta sesión.</div>
            ) : (
              <div className="log-list">
                {logs.map((log) => (
                  <div key={`${log.fileName}-${log.invoiceId}`} className={`log-item ${log.status === 'review' ? 'review' : 'ok'}`}>
                    <div className="log-header">
                      <strong>{log.fileName}</strong>
                      <span className={log.status === 'review' ? 'log-pill warning' : 'log-pill success'}>
                        {log.status === 'review' ? 'Revisar' : 'Correcto'}
                      </span>
                    </div>
                    <div className="log-meta">
                      <span>Factura: {log.invoiceId}</span>
                      <span>Fecha: {log.purchaseDate ?? 'No detectada'}</span>
                      <span>Líneas: {log.itemsParsed}</span>
                    </div>
                    {log.notes.length ? (
                      <ul>
                        {log.notes.map((note) => (
                          <li key={note}>
                            <AlertTriangle size={14} /> {note}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </main>
      ) : null}

      {activeTab === 'esquema' ? (
        <main className="page-grid">
          <Panel
            title="Vista navegable de gastos.xlsx"
            subtitle="Consulta el contenido actual de la hoja line_items con búsqueda, scroll horizontal y paginación."
            actions={
              <div className="dataset-grid-actions">
                <input
                  type="search"
                  value={datasetSearch}
                  onChange={(event) => setDatasetSearch(event.target.value)}
                  placeholder="Buscar por artículo, fecha, factura o categoría..."
                  className="dataset-search"
                />
              </div>
            }
          >
            {!datasetRows.length ? (
              <div className="empty-card small">Todavía no hay filas en line_items. Carga un dataset o añade facturas PDF para ver aquí el detalle completo.</div>
            ) : (
              <div className="dataset-grid-wrap">
                <div className="dataset-grid-meta">
                  <span>{filteredDatasetRows.length} filas visibles</span>
                  <span>Página {safeDatasetPage} de {datasetTotalPages}</span>
                </div>
                <div className="table-wrap dataset-table">
                  <table>
                    <thead>
                      <tr>
                        {datasetColumns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDatasetRows.map((row) => (
                        <tr key={row.hash}>
                          {datasetColumns.map((column) => (
                            <td key={`${row.hash}-${column}`}>{String(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="dataset-grid-footer">
                  <button disabled={safeDatasetPage <= 1} onClick={() => setDatasetPage((page) => Math.max(1, page - 1))}>
                    Anterior
                  </button>
                  <button disabled={safeDatasetPage >= datasetTotalPages} onClick={() => setDatasetPage((page) => Math.min(datasetTotalPages, page + 1))}>
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Diseño del dataset" subtitle="Estructura propuesta para que la app pueda recalcular métricas y seguir creciendo.">
            <div className="schema-grid">
              {[
                ['invoice_id', 'Identificador de factura o ticket.'],
                ['purchase_date', 'Fecha de compra en ISO: YYYY-MM-DD.'],
                ['purchase_month', 'Mes de compra en formato YYYY-MM.'],
                ['purchase_week', 'Semana ISO para análisis semanal.'],
                ['weekday', 'Nombre del día de la semana.'],
                ['article', 'Nombre del artículo detectado en factura.'],
                ['article_normalized', 'Versión normalizada para agrupar artículos.'],
                ['quantity', 'Cantidad comprada.'],
                ['unit_price', 'Precio unitario observado.'],
                ['line_total', 'Importe total de la línea.'],
                ['tax_rate', 'Tipo de IVA detectado.'],
                ['source_file', 'Nombre del PDF o del dataset origen.'],
                ['parser_status', 'parsed o review, para trazabilidad.'],
                ['hash', 'Clave técnica para evitar duplicados.'],
              ].map(([field, description]) => (
                <div key={field} className="schema-item">
                  <strong>{field}</strong>
                  <p>{description}</p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="content-grid content-grid-2x1">
            <Panel title="Hojas exportadas en gastos.xlsx" subtitle="La hoja canónica es line_items; el resto acelera revisión y análisis externo.">
              <div className="sheet-cards">
                <div>
                  <strong>line_items</strong>
                  <p>Base transaccional completa para volver a cargar el dataset.</p>
                </div>
                <div>
                  <strong>purchases</strong>
                  <p>Resumen de tickets por fecha, mes y semana.</p>
                </div>
                <div>
                  <strong>article_prices</strong>
                  <p>Resumen de precios y gasto acumulado por artículo.</p>
                </div>
                <div>
                  <strong>metadata</strong>
                  <p>Información de generación del fichero y guía rápida.</p>
                </div>
              </div>
            </Panel>

            <Panel title="Publicación en GitHub" subtitle="Pensado como landing app estática con Vite + React.">
              <div className="publish-list">
                <div>
                  <BarChart3 size={18} />
                  <span>Frontend 100% cliente, sin backend.</span>
                </div>
                <div>
                  <BadgeCheck size={18} />
                  <span>Compatible con GitHub Pages mediante build estático.</span>
                </div>
                <div>
                  <FileSpreadsheet size={18} />
                  <span>Excel exportable con nombre fijo: gastos.xlsx.</span>
                </div>
              </div>
            </Panel>
          </div>
        </main>
      ) : null}
    </div>
  )
}
