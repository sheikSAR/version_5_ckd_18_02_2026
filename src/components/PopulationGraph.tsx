import React, { useEffect, useRef, useState, useCallback } from 'react'
import nodeData from '../data/node.json'
import { COLOR_PALETTES } from '../utils/colors'
import '../styles/PopulationGraph.css'

// --- Enhanced Edge Interface with Visual Metadata ---
interface Node {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  color: string
  bgColor: string
  textColor: string
  isHeader: boolean
}

interface Edge {
  id: string
  sourceId: string
  targetId: string
  color: string
  patientIndex: number

  // Core data (from backend or aggregation)
  count: number
  chainedProbability: number
  posteriorCKD?: number
  patientIds: string[]

  // CONDITIONING GUARD DATA (from backend edges_metadata)
  denominatorCount?: number        // count(F1..Fi) - denominator for chained conditional
  numeratorCount?: number          // count(F1..Fi, Fi+1) - numerator for chained conditional

  // Visual encoding metadata (computed per view state)
  label: string                    // e.g., "count: 200\nP = 0.384721"
  normalizedWidth: number          // sqrt(count / maxCount)
  normalizedOpacity: number        // min(1, count / avgCount)

  // Rendering gate: MANDATORY
  shouldRender: boolean            // TRUE only if (count > 0) AND (label non-empty OR normalizedWidth >= MIN_WIDTH_THRESHOLD)

  // Conditioning validity gate
  isValidPath: boolean             // FALSE if denominatorCount === 0 or undefined

  // Metadata for expanded view
  isParallel?: boolean             // TRUE if this is one of the parallel expanded edges
  parallelOffset?: number          // offset index for parallel rendering
  individualPatientId?: string     // patient ID for parallel edges
}

interface Camera {
  x: number
  y: number
  zoom: number
}

interface NormalizationState {
  maxCount: number
  avgCount: number
  viewMode: 'all' | 'single'
  zoomLevel: number
  densitySlider: number
}

// --- Constants ---
const NODE_WIDTH = 90
const NODE_HEIGHT = 90
const COL_SPACING = 380
const ROW_SPACING = 130
const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const ZOOM_SENSITIVITY = 0.0008
const PARALLEL_EXPAND_THRESHOLD = 1.5
const MAX_PARALLEL_EDGES = 50
const MIN_WIDTH_THRESHOLD = 0.8  // Minimum normalizedWidth to render edge even without label
const BASE_WIDTH = 2.0           // Base stroke width in pixels

const categoriesOrdered = [
  'Patient', 'Gender', 'Age_Group', 'DR_OD', 'DR_OS', 'HTN',
  'HB', 'HBA', 'DR_Severity_OD', 'DR_Severity_OS', 'EGFR'
]

const categoryValues: any = {
  Patient: ['Patient'],
  Gender: ['Male', 'Female'],
  Age_Group: ['Age < 40', 'Age == 40', '40 < Age <= 45', '45 < Age <= 50', '50 < Age <= 55', '55 < Age <= 60', '60 < Age <= 65', '65 < Age <= 70', '70 < Age <= 75', '75 < Age <= 78', 'Age > 78'],
  DR_OD: ['Non DR_OD', 'DR_OD'],
  DR_OS: ['Non DR_OS', 'DR_OS'],
  HTN: ['No HTN', 'HTN'],
  HB: ['HB <= 9', '9 < HB <= 12', '12 < HB <= 15', '15 < HB <= 18', 'HB > 18'],
  HBA: ['HBA <= 5', '5 < HBA <= 10', '10 < HBA <= 15', 'HBA > 15'],
  DR_Severity_OD: ['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'],
  DR_Severity_OS: ['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'],
  EGFR: ['EGFR >= 90', 'EGFR < 90']
}

const categoryToFeature: Record<string, string> = {
  'Gender': 'gender',
  'Age_Group': 'age',
  'DR_OD': 'DR_OD',
  'DR_OS': 'DR_OS',
  'HTN': 'Hypertension',
  'HB': 'HB',
  'HBA': 'HBA',
  'DR_Severity_OD': 'DR_SEVERITY_OD',
  'DR_Severity_OS': 'DR_SEVERITY_OS',
  'EGFR': 'EGFR'
}

// --- Helper Functions ---
const getPaletteForCategory = (catKey: string, sampleValues: string[]) => {
  const nodeEntries = Object.entries(nodeData)

  const keyMatchIndex = nodeEntries.findIndex(([key]) =>
    key === catKey ||
    (catKey === 'Patient' && key === 'Patient_ID')
  )
  if (keyMatchIndex !== -1) return COLOR_PALETTES[keyMatchIndex % COLOR_PALETTES.length]

  const valueMatchIndex = nodeEntries.findIndex(([_, values]) =>
    values.some(v => sampleValues.includes(v))
  )
  if (valueMatchIndex !== -1) return COLOR_PALETTES[valueMatchIndex % COLOR_PALETTES.length]

  return COLOR_PALETTES[0]
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath()
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2)
  ctx.closePath()
}

// --- Core Edge Validation & Label Generation ---
/**
 * Conditioning Guard: Validates that probability computation is only meaningful
 * when the denominator (conditioning set) has supporting data.
 *
 * Returns true ONLY if:
 * 1. denominatorCount exists AND > 0
 * 2. chainedProbability was computed from valid denominator
 *
 * If denominatorCount is 0 or missing, the conditioning set is empty in the data
 * and P = 0 would be meaningless (not "zero frequency" but "no data").
 */
function isValidConditioningPath(edge: {
  denominatorCount?: number
  chainedProbability: number
}): boolean {
  // If denominator is not provided or is 0, this is an invalid path
  if (edge.denominatorCount === undefined || edge.denominatorCount === 0) {
    return false
  }
  // Valid path: denominator > 0
  return true
}

/**
 * Generates a label for an edge. Follows the specification exactly:
 * - All-patients mode: "count: N\nP = 0.XXXXXX" optionally + "\nCKD = 0.XXXXXX"
 * - Single-patient mode: "P = 0.XXXXXX" (no count)
 *
 * ENHANCED: Now shows "P = N/A" when probability data is unavailable (denominatorCount = 0)
 * This ensures edges are still visible even when conditioning data is missing.
 */
function generateEdgeLabel(
  edge: Omit<Edge, 'label' | 'normalizedWidth' | 'normalizedOpacity' | 'shouldRender' | 'isValidPath'>,
  isSinglePatient: boolean,
  targetNodeId: string
): string {
  const targetCategory = targetNodeId.split('-')[0]
  const isEGFREdge = targetCategory === 'EGFR'
  const hasValidDenominator = isValidConditioningPath(edge)

  if (isSinglePatient) {
    // Single patient: show probability or N/A
    let label = hasValidDenominator
      ? `P = ${edge.chainedProbability.toFixed(6)}`
      : 'P = N/A'

    if (isEGFREdge && edge.posteriorCKD !== undefined) {
      label += `\nCKD = ${edge.posteriorCKD.toFixed(6)}`
    }
    return label
  } else {
    // All-patients: show count + probability or N/A
    if (edge.count > 0) {
      let label = `count: ${edge.count}\n`
      label += hasValidDenominator
        ? `P = ${edge.chainedProbability.toFixed(6)}`
        : 'P = N/A'

      if (isEGFREdge && edge.posteriorCKD !== undefined) {
        label += `\nCKD = ${edge.posteriorCKD.toFixed(6)}`
      }
      return label
    }
    return ''
  }
}

/**
 * Deterministic rendering gate: an edge is rendered if and only if:
 * 1. count > 0 (at least one patient took this path)
 *
 * ENHANCED: Now renders edges even if probability data is unavailable (shows N/A)
 * This ensures complete connectivity in the graph.
 */
function computeShouldRender(
  label: string,
  normalizedWidth: number,
  count: number
): boolean {
  // Render if any patients follow this edge path
  return count > 0
}

/**
 * Recalculate normalization state based on current view mode and parameters.
 * This ensures maxCount and avgCount are recomputed every time view state changes.
 */
function recalculateNormalization(
  edgeCounts: number[],
  viewMode: 'all' | 'single',
  zoomLevel: number,
  densitySlider: number
): NormalizationState {
  const validCounts = edgeCounts.filter(c => c > 0)

  const maxCount = validCounts.length > 0 ? Math.max(...validCounts) : 1
  const avgCount = validCounts.length > 0
    ? validCounts.reduce((a, b) => a + b, 0) / validCounts.length
    : 1

  return {
    maxCount,
    avgCount,
    viewMode,
    zoomLevel,
    densitySlider
  }
}

interface PopulationGraphProps {
  configPath: string
}

export default function PopulationGraph({ configPath }: PopulationGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [patientData, setPatientData] = useState<any[]>([])
  const [edgesMetadata, setEdgesMetadata] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [maxPatients, setMaxPatients] = useState(100)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [patientIds, setPatientIds] = useState<string[]>([])

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [dragNode, setDragNode] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [animationTime, setAnimationTime] = useState<number>(0)

  const nodesRef = useRef<Node[]>([])
  const edgesRef = useRef<Edge[]>([])
  const normalizationRef = useRef<NormalizationState>({
    maxCount: 1,
    avgCount: 1,
    viewMode: 'all',
    zoomLevel: 1,
    densitySlider: 100
  })
  const animationFrameRef = useRef<number | null>(null)

  // --- Fetch Data ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [patientResponse, edgesResponse] = await Promise.all([
          fetch(`http://localhost:5000/configurator/${configPath}/input/initial_data.json`),
          fetch(`http://localhost:5000/configurator/${configPath}/input/edges_metadata.json`)
        ])

        if (!patientResponse.ok) throw new Error('Failed to fetch patient data')
        const data = await patientResponse.json()
        setPatientData(data)

        const ids = data.map((patient: any, index: number) =>
          patient.PatientID || patient.id || `Patient_${index}`
        )
        setPatientIds(ids)

        if (edgesResponse.ok) {
          const metadata = await edgesResponse.json()
          setEdgesMetadata(metadata)
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    if (configPath) fetchData()
  }, [configPath])

  // --- Prepare Graph Data with Strict Edge Validation ---
  useEffect(() => {
    if (!patientData.length) return

    const newNodes: Node[] = []
    const nodeIdMap = new Set<string>()

    categoriesOrdered.forEach((catKey, colIndex) => {
      const palette = getPaletteForCategory(catKey, categoryValues[catKey])
      const { color: primary, bgColor: light, headerColor: header } = palette

      newNodes.push({
        id: `header-${catKey}`,
        label: catKey.replace(/_/g, ' '),
        x: colIndex * COL_SPACING,
        y: -100,
        width: NODE_WIDTH,
        height: 36,
        color: header,
        bgColor: header,
        textColor: '#ffffff',
        isHeader: true
      })

      categoryValues[catKey].forEach((val: string, rIndex: number) => {
        const id = `${catKey}-${rIndex}`
        nodeIdMap.add(id)
        newNodes.push({
          id,
          label: val,
          x: colIndex * COL_SPACING,
          y: rIndex * ROW_SPACING,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          color: primary,
          bgColor: light,
          textColor: '#1a1a1a',
          isHeader: false
        })
      })
    })

    const newEdges: Edge[] = []
    const patientPalette = COLOR_PALETTES[0]
    const limited = patientData.slice(0, maxPatients)

    if (selectedPatientId) {
      // Single patient mode: render one patient's path
      const selectedIndex = patientIds.indexOf(selectedPatientId)
      if (selectedIndex !== -1 && selectedIndex < limited.length) {
        const patient = limited[selectedIndex]
        const path = [
          `Patient-0`,
          `Gender-${patient.gender}`,
          `Age_Group-${patient.age}`,
          `DR_OD-${patient.DR_OD}`,
          `DR_OS-${patient.DR_OS}`,
          `HTN-${patient.Hypertension}`,
          `HB-${patient.HB - 1}`,
          `HBA-${patient.HBA - 1}`,
          patient.DR_SEVERITY_OD > 0 ? `DR_Severity_OD-${patient.DR_SEVERITY_OD - 1}` : null,
          patient.DR_SEVERITY_OS > 0 ? `DR_Severity_OS-${patient.DR_SEVERITY_OS - 1}` : null,
          `EGFR-${patient.EGFR}`
        ].filter(Boolean) as string[]

        for (let i = 0; i < path.length - 1; i++) {
          const s = path[i]
          const t = path[i + 1]
          if (!nodeIdMap.has(s) || !nodeIdMap.has(t)) continue

          const categoryName = t.split('-')[0]
          const featureName = categoryToFeature[categoryName] || categoryName.toLowerCase()

          // CONDITIONING GUARD: Look up metadata to get denominatorCount
          const edgeKey = `${s}|${t}`
          const metadata = edgesMetadata[edgeKey]

          // For single-patient mode, prefer backend metadata probability when available
          // Otherwise fall back to patient's individual chained probability
          const chainedProb = metadata?.chainedProbability ?? patient[`probability_of_${featureName}`] ?? 0

          const baseEdge: Edge = {
            id: `e-${selectedIndex}-${i}`,
            sourceId: s,
            targetId: t,
            color: patientPalette.color,
            patientIndex: selectedIndex,
            count: 1,
            chainedProbability: chainedProb,
            posteriorCKD: metadata?.posteriorCKD ?? (t.startsWith('EGFR') ? patient.posteriorCKD : undefined),
            patientIds: [selectedPatientId],

            // CONDITIONING GUARD DATA
            denominatorCount: metadata?.denominatorCount,
            numeratorCount: metadata?.numeratorCount,

            label: '',
            normalizedWidth: 1,
            normalizedOpacity: 1,
            shouldRender: false,
            isValidPath: metadata?.denominatorCount !== undefined && metadata?.denominatorCount > 0
          }

          // Generate label for single-patient mode (now includes N/A for missing data)
          baseEdge.label = generateEdgeLabel(baseEdge, true, t)

          // For single patient, render if patient took this path (count > 0)
          baseEdge.shouldRender = computeShouldRender(baseEdge.label, baseEdge.normalizedWidth, baseEdge.count)

          if (baseEdge.shouldRender) {
            newEdges.push(baseEdge)
          }
        }
      }
    } else {
      // All-patients mode: aggregate edges and validate
      const edgeAggregates = new Map<string, {
        count: number
        sourceId: string
        targetId: string
        chainedProbability: number
        posteriorCKD?: number
        denominatorCount?: number
        numeratorCount?: number
        contributingPatients: string[]
      }>()

      limited.forEach((patient, pIdx) => {
        const path = [
          `Patient-0`,
          `Gender-${patient.gender}`,
          `Age_Group-${patient.age}`,
          `DR_OD-${patient.DR_OD}`,
          `DR_OS-${patient.DR_OS}`,
          `HTN-${patient.Hypertension}`,
          `HB-${patient.HB - 1}`,
          `HBA-${patient.HBA - 1}`,
          patient.DR_SEVERITY_OD > 0 ? `DR_Severity_OD-${patient.DR_SEVERITY_OD - 1}` : null,
          patient.DR_SEVERITY_OS > 0 ? `DR_Severity_OS-${patient.DR_SEVERITY_OS - 1}` : null,
          `EGFR-${patient.EGFR}`
        ].filter(Boolean) as string[]

        for (let i = 0; i < path.length - 1; i++) {
          const s = path[i]
          const t = path[i + 1]
          if (!nodeIdMap.has(s) || !nodeIdMap.has(t)) continue

          const edgeKey = `${s}|${t}`
          const existing = edgeAggregates.get(edgeKey)
          const patientId = patientIds[pIdx] || `Patient_${pIdx}`

          if (existing) {
            existing.count += 1
            existing.contributingPatients.push(patientId)
          } else {
            const metadata = edgesMetadata[edgeKey]

            // CONDITIONING GUARD: Include denominator information from backend
            // Only use probability if denominator > 0
            const denominatorCount = metadata?.denominatorCount
            const numeratorCount = metadata?.numeratorCount
            const chainedProbability = metadata?.chainedProbability || 0

            edgeAggregates.set(edgeKey, {
              count: 1,
              sourceId: s,
              targetId: t,
              chainedProbability: chainedProbability,
              posteriorCKD: t.startsWith('EGFR') ? metadata?.posteriorCKD : undefined,
              denominatorCount: denominatorCount,
              numeratorCount: numeratorCount,
              contributingPatients: [patientId]
            })
          }
        }
      })

      // Convert aggregates to edges with validation
      let edgeId = 0
      const edgeCounts: number[] = []

      edgeAggregates.forEach((aggregate) => {
        edgeCounts.push(aggregate.count)
      })

      // Recalculate normalization for all-patients view
      const normalization = recalculateNormalization(
        edgeCounts,
        'all',
        camera.zoom,
        maxPatients
      )
      normalizationRef.current = normalization

      edgeAggregates.forEach((aggregate) => {
        // CONDITIONING GUARD: Check denominator before creating edge
        // We already know aggregate.count > 0, but need to verify the conditioning prefix exists
        const denominatorCount = aggregate.denominatorCount
        const numeratorCount = aggregate.numeratorCount

        // An edge is only valid if the denominator (conditioning set) has supporting data
        const isValidPath = denominatorCount !== undefined && denominatorCount > 0

        const baseEdge: Edge = {
          id: `e-agg-${edgeId}`,
          sourceId: aggregate.sourceId,
          targetId: aggregate.targetId,
          color: patientPalette.color,
          patientIndex: -1,
          count: aggregate.count,
          chainedProbability: aggregate.chainedProbability,
          posteriorCKD: aggregate.posteriorCKD,
          patientIds: aggregate.contributingPatients.slice(0, MAX_PARALLEL_EDGES),

          // CONDITIONING GUARD DATA
          denominatorCount: denominatorCount,
          numeratorCount: numeratorCount,

          label: '',
          normalizedWidth: 0,
          normalizedOpacity: 0,
          shouldRender: false,
          isValidPath: isValidPath
        }

        // Compute visual encoding
        baseEdge.normalizedWidth = Math.sqrt(baseEdge.count / normalization.maxCount)
        baseEdge.normalizedOpacity = Math.min(1, baseEdge.count / normalization.avgCount)

        // Generate label (now includes N/A for missing probability data)
        baseEdge.label = generateEdgeLabel(baseEdge, false, aggregate.targetId)

        // Render if patients follow this path (count > 0)
        baseEdge.shouldRender = computeShouldRender(
          baseEdge.label,
          baseEdge.normalizedWidth,
          baseEdge.count
        )

        if (baseEdge.shouldRender) {
          newEdges.push(baseEdge)
        }

        edgeId += 1
      })
    }

    nodesRef.current = newNodes
    edgesRef.current = newEdges
  }, [patientData, maxPatients, selectedPatientId, patientIds, edgesMetadata, camera.zoom])

  // --- High-DPI Drawing Loop ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)

    const viewLeft = -camera.x / camera.zoom
    const viewTop = -camera.y / camera.zoom
    const viewRight = viewLeft + width / camera.zoom
    const viewBottom = viewTop + height / camera.zoom

    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)

    const nodeMap = new Map<string, { x: number, y: number }>()
    nodesRef.current.forEach(n => {
      nodeMap.set(n.id, { x: n.x + n.width / 2, y: n.y + n.height / 2 })
    })

    const visibleEdges = edgesRef.current.filter(e => e.shouldRender)
    const isPatientSelected = selectedPatientId !== null
    const shouldExpandEdges = camera.zoom >= PARALLEL_EXPAND_THRESHOLD && !isPatientSelected

    // Draw edges
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    visibleEdges.forEach(edge => {
      const src = nodeMap.get(edge.sourceId)
      const tgt = nodeMap.get(edge.targetId)
      if (!src || !tgt) return

      const minX = Math.min(src.x, tgt.x)
      const maxX = Math.max(src.x, tgt.x)
      const minY = Math.min(src.y, tgt.y)
      const maxY = Math.max(src.y, tgt.y)

      if (maxX < viewLeft || minX > viewRight || maxY < viewTop || minY > viewBottom) return

      const parallelCount = shouldExpandEdges && edge.count > 1 && edge.patientIds
        ? Math.min(edge.patientIds.length, MAX_PARALLEL_EDGES)
        : 1

      for (let p = 0; p < parallelCount; p++) {
        // Calculate offset for parallel edges
        const offsetDistance = (p - (parallelCount - 1) / 2) * 8 / camera.zoom
        const dx = tgt.x - src.x
        const dy = tgt.y - src.y
        const dist = Math.hypot(dx, dy)
        const offsetX = (dy / dist) * offsetDistance
        const offsetY = -(dx / dist) * offsetDistance

        // Calculate stroke width
        const weightFactor = edge.normalizedWidth
        const lineWidth = shouldExpandEdges && edge.count > 1
          ? 1 / camera.zoom
          : (BASE_WIDTH * (0.5 + weightFactor * 0.8)) / camera.zoom
        ctx.lineWidth = lineWidth

        // Calculate opacity
        const alphaFactor = edge.normalizedOpacity
        const opacity = isPatientSelected ? 1 : Math.min(1, 0.1 + alphaFactor * 0.6)
        ctx.globalAlpha = opacity

        // Animated stroke for selected patient
        if (isPatientSelected) {
          ctx.strokeStyle = edge.color
          ctx.setLineDash([8, 8])
          ctx.lineDashOffset = -(animationTime % 16)
        } else {
          ctx.strokeStyle = edge.color
          ctx.setLineDash([])
        }

        // Draw bezier curve
        ctx.beginPath()
        const midX = (src.x + tgt.x) / 2
        ctx.moveTo(src.x + offsetX, src.y + offsetY)
        ctx.bezierCurveTo(midX, src.y + offsetY, midX, tgt.y + offsetY, tgt.x + offsetX, tgt.y + offsetY)
        ctx.stroke()
      }

      // Highlight hovered edge
      if (hoveredEdge === edge.id) {
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)'
        ctx.globalAlpha = 1
        ctx.lineWidth = (BASE_WIDTH * 1.5) / camera.zoom
        ctx.setLineDash([])
        ctx.beginPath()
        const midX = (src.x + tgt.x) / 2
        ctx.moveTo(src.x, src.y)
        ctx.bezierCurveTo(midX, src.y, midX, tgt.y, tgt.x, tgt.y)
        ctx.stroke()
      }
    })

    ctx.globalAlpha = 1.0
    ctx.setLineDash([])

    // Draw edge labels at normal zoom (< 1.5x)
    if (camera.zoom < PARALLEL_EXPAND_THRESHOLD) {
      ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'

      visibleEdges.forEach(edge => {
        const src = nodeMap.get(edge.sourceId)
        const tgt = nodeMap.get(edge.targetId)
        if (!src || !tgt) return

        const minX = Math.min(src.x, tgt.x)
        const maxX = Math.max(src.x, tgt.x)
        const minY = Math.min(src.y, tgt.y)
        const maxY = Math.max(src.y, tgt.y)

        if (maxX < viewLeft || minX > viewRight || maxY < viewTop || minY > viewBottom) return

        if (!edge.label) return

        const midX = (src.x + tgt.x) / 2
        const midY = (src.y + tgt.y) / 2

        // Draw label with white background
        const lines = edge.label.split('\n')
        const lineHeight = 12
        const totalHeight = lines.length * lineHeight
        const padding = 3

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.fillRect(
          midX - 40,
          midY - totalHeight / 2 - padding,
          80,
          totalHeight + padding * 2
        )

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        lines.forEach((line, idx) => {
          ctx.fillText(
            line,
            midX,
            midY - totalHeight / 2 + (idx * lineHeight) + 8
          )
        })
      })
    }

    // Draw nodes
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    nodesRef.current.forEach(node => {
      if (node.x + node.width < viewLeft || node.x > viewRight ||
        node.y + node.height < viewTop || node.y > viewBottom) return

      const isHovered = hoveredNode === node.id
      const radius = node.width / 2

      if (node.isHeader) {
        ctx.fillStyle = node.color
        ctx.font = '800 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.label, node.x + radius, node.y + radius)
        return
      }

      if (isHovered) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
        ctx.shadowBlur = 12 / camera.zoom
        ctx.shadowOffsetY = 4 / camera.zoom
      }

      ctx.fillStyle = node.bgColor
      drawCircle(ctx, node.x, node.y, radius)
      ctx.fill()

      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      ctx.strokeStyle = node.color
      ctx.lineWidth = (isHovered ? 2.5 : 1.5) / camera.zoom
      ctx.stroke()

      ctx.fillStyle = node.textColor
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(node.label, node.x + radius, node.y + radius)
    })
  }, [camera, hoveredNode, hoveredEdge, animationTime, selectedPatientId])

  // --- Animation Loop ---
  useEffect(() => {
    const render = () => {
      setAnimationTime(prev => prev + 1)
      draw()
      animationFrameRef.current = requestAnimationFrame(render)
    }
    render()
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [draw])

  // --- Canvas Resize with DPI ---
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()

      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)

      draw()
    }

    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    handleResize()

    return () => resizeObserver.disconnect()
  }, [draw])

  // --- Fit to Screen ---
  const fitToScreen = useCallback(() => {
    if (nodesRef.current.length === 0 || !containerRef.current) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodesRef.current.forEach(node => {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.width)
      maxY = Math.max(maxY, node.y + node.height)
    })

    const padding = 50
    const graphWidth = maxX - minX + padding * 2
    const graphHeight = maxY - minY + padding * 2

    const rect = containerRef.current.getBoundingClientRect()

    const scaleX = rect.width / graphWidth
    const scaleY = rect.height / graphHeight

    let newZoom = Math.min(scaleX, scaleY)
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))

    const graphCenterX = (minX + maxX) / 2
    const graphCenterY = (minY + maxY) / 2

    const containerCenterX = rect.width / 2
    const containerCenterY = rect.height / 2

    const newX = containerCenterX - graphCenterX * newZoom
    const newY = containerCenterY - graphCenterY * newZoom

    setCamera({ x: newX, y: newY, zoom: newZoom })

  }, [])

  // Auto-fit on first load
  useEffect(() => {
    if (!loading && nodesRef.current.length > 0) {
      const timer = setTimeout(fitToScreen, 100)
      return () => clearTimeout(timer)
    }
  }, [loading, fitToScreen])

  // --- Interaction Handlers ---
  const getCanvasCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0, screenX: 0, screenY: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - camera.y) / camera.zoom,
      screenX: e.clientX,
      screenY: e.clientY
    }
  }, [camera])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)
    const { x, y } = coords

    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i]
      const radius = node.width / 2
      const centerX = node.x + radius
      const centerY = node.y + radius
      const distSquared = (x - centerX) ** 2 + (y - centerY) ** 2

      if (distSquared <= radius ** 2) {
        if (node.isHeader) return
        setDragNode(node.id)
        setDragStart({ x: x - centerX, y: y - centerY })
        setIsDragging(true)
        return
      }
    }

    setIsPanning(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [getCanvasCoords])

  const nodeMap = new Map<string, { x: number, y: number }>()
  nodesRef.current.forEach(n => {
    nodeMap.set(n.id, { x: n.x + n.width / 2, y: n.y + n.height / 2 })
  })

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)

    let foundHover = null
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i]
      const radius = node.width / 2
      const centerX = node.x + radius
      const centerY = node.y + radius
      const distSquared = (coords.x - centerX) ** 2 + (coords.y - centerY) ** 2

      if (distSquared <= radius ** 2) {
        foundHover = node.id
        break
      }
    }
    setHoveredNode(foundHover)

    let foundEdgeHover = null
    if (!foundHover && !isDragging && !isPanning) {
      const threshold = 20 / camera.zoom
      for (const edge of edgesRef.current.filter(e => e.shouldRender)) {
        const src = nodeMap.get(edge.sourceId)
        const tgt = nodeMap.get(edge.targetId)
        if (!src || !tgt) continue

        const midX = (src.x + tgt.x) / 2
        const dist = Math.hypot(
          coords.x - midX,
          coords.y - (src.y + tgt.y) / 2
        )
        if (dist < threshold) {
          foundEdgeHover = edge.id
          setTooltipPos({ x: e.clientX, y: e.clientY })
          break
        }
      }
    }
    setHoveredEdge(foundEdgeHover)

    if (isDragging && dragNode) {
      const nodeIndex = nodesRef.current.findIndex(n => n.id === dragNode)
      if (nodeIndex !== -1) {
        const radius = nodesRef.current[nodeIndex].width / 2
        nodesRef.current[nodeIndex].x = coords.x - dragStart.x - radius
        nodesRef.current[nodeIndex].y = coords.y - dragStart.y - radius
      }
    } else if (isPanning) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }, [getCanvasCoords, isDragging, isPanning, dragNode, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsPanning(false)
    setDragNode(null)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const worldX = (mouseX - camera.x) / camera.zoom
    const worldY = (mouseY - camera.y) / camera.zoom

    const delta = -e.deltaY * ZOOM_SENSITIVITY
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * (1 + delta)))

    const newX = mouseX - worldX * newZoom
    const newY = mouseY - worldY * newZoom

    setCamera({ x: newX, y: newY, zoom: newZoom })
  }, [camera])

  const resetCamera = () => {
    setCamera({ x: 50, y: 100, zoom: 1.0 })
  }

  const zoomIn = () => {
    setCamera(prev => ({ ...prev, zoom: Math.min(MAX_ZOOM, prev.zoom * 1.2) }))
  }

  const zoomOut = () => {
    setCamera(prev => ({ ...prev, zoom: Math.max(MIN_ZOOM, prev.zoom / 1.2) }))
  }

  // --- Get Edge Tooltip ---
  const getEdgeTooltip = (edgeId: string) => {
    const edge = edgesRef.current.find(e => e.id === edgeId)
    if (!edge) return null

    const isPatientSelected = selectedPatientId !== null

    if (isPatientSelected) {
      // Single patient: show patient ID and probability
      let tooltip = `Patient: ${selectedPatientId}\n`
      tooltip += `Chained: P(...) = ${edge.chainedProbability.toFixed(6)}`
      if (edge.posteriorCKD !== undefined) {
        tooltip += `\nPosterior CKD: ${edge.posteriorCKD.toFixed(6)}`
      }
      return tooltip
    } else {
      // All patients: show aggregated data
      let tooltip = `Patients: ${edge.count}\n`
      tooltip += `Chained: P(...) = ${edge.chainedProbability.toFixed(6)}`
      if (edge.posteriorCKD !== undefined) {
        tooltip += `\nPosterior CKD: ${edge.posteriorCKD.toFixed(6)}`
      }
      return tooltip
    }
  }

  if (loading) return <div className="population-graph-loading">Analyzing Patient Flow...</div>
  if (error) return <div className="population-graph-error">Error: {error}</div>

  return (
    <div className="population-graph-wrapper">
      <div className="population-graph-header">
        <button
          onClick={() => window.location.href = '/configurator/data-graph'}
          className="graph-back-button"
          title="Back to Data Graph"
        >
          ← Back
        </button>
        <div className="patient-info">
          Displaying <strong>{Math.min(maxPatients, patientData.length)}</strong> patients • {edgesRef.current.filter(e => e.shouldRender).length} data-rich edges
        </div>
        <div className="controls-group">
          <div className="patient-filter-control">
            <label>Filter Patient:</label>
            <select
              value={selectedPatientId || ''}
              onChange={(e) => setSelectedPatientId(e.target.value || null)}
              className="patient-filter-dropdown"
            >
              <option value="">All Patients</option>
              {patientIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div className="patient-limit-control">
            <label>Density Control:</label>
            <input
              type="range"
              min="10"
              max={patientData.length || 100}
              value={maxPatients}
              onChange={(e) => setMaxPatients(parseInt(e.target.value))}
              className="patient-limit-slider"
            />
            <span className="limit-value">{maxPatients}</span>
          </div>
          <div className="zoom-controls">
            <button onClick={zoomOut} className="zoom-btn" title="Zoom Out">−</button>
            <button onClick={fitToScreen} className="zoom-btn" title="Fit to Screen">⤢</button>
            <button onClick={resetCamera} className="zoom-btn reset" title="Reset 100%">1:1</button>
            <button onClick={zoomIn} className="zoom-btn" title="Zoom In">+</button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="canvas-container">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            width: '100%',
            height: '100%',
            cursor: isPanning ? 'grabbing' : (isDragging ? 'grabbing' : (hoveredNode ? 'pointer' : (hoveredEdge ? 'help' : 'default')))
          }}
        />
        <div className="zoom-indicator">{Math.round(camera.zoom * 100)}%</div>

        {hoveredEdge && (
          <div
            className="edge-tooltip"
            style={{
              position: 'absolute',
              left: `${tooltipPos.x + 10}px`,
              top: `${tooltipPos.y + 10}px`,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              whiteSpace: 'pre-line',
              pointerEvents: 'none',
              zIndex: 1000,
              fontFamily: 'monospace',
              maxWidth: '300px',
              wordWrap: 'break-word'
            }}
          >
            {getEdgeTooltip(hoveredEdge)}
          </div>
        )}
      </div>
    </div>
  )
}
