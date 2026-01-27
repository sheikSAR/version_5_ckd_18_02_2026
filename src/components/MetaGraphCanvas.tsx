import React, { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/MetaGraphCanvas.css'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Patient {
  PatientID?: string
  id?: string
  gender: number
  age: number
  DR_OD: number
  DR_OS: number
  Hypertension: number
  HB: number
  HBA: number
  DR_SEVERITY_OD: number
  DR_SEVERITY_OS: number
  EGFR: number
  [key: string]: any
}

interface PredictionData {
  Patient_ID: string
  Actual_EGFR: number | null
  Predictions: Record<string, number>
  Errors: Record<string, number>
}

interface Node {
  id: string
  label: string
  x: number
  y: number
  radius: number
  color: string
  layer: 'L0' | 'L1' | 'L2'
  type: string
}

interface Edge {
  id: string
  fromId: string
  toId: string
  label: string
  color: string
  layer: 'L0' | 'L1' | 'L2' | 'cross'
}

interface Camera {
  x: number
  y: number
  zoom: number
}

interface LayerVisibility {
  L0: boolean
  L1: boolean
  L2: boolean
}

// ============================================================================
// LAYER DEFINITIONS & CONSTANTS
// ============================================================================

const LAYER_Y_RANGES = {
  L0: { min: 0, max: 500, centerY: 250 },
  L1: { min: 600, max: 1200, centerY: 900 },
  L2: { min: 1300, max: 1700, centerY: 1500 },
}

const CATEGORY_KEY_ORDER = [
  'Patient', 'Gender', 'Age_Group', 'DR_OD', 'DR_OS', 'HTN',
  'HB', 'HBA', 'DR_Severity_OD', 'DR_Severity_OS', 'EGFR'
]

const CATEGORY_VALUES: Record<string, string[]> = {
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

const COLOR_PALETTE = [
  { primary: '#667eea', light: '#e6f0ff', header: '#5568d3' },
  { primary: '#764ba2', light: '#f3e8ff', header: '#6a3d8e' },
  { primary: '#f093fb', light: '#ffe0ff', header: '#e073eb' },
  { primary: '#4facfe', light: '#e0f4ff', header: '#387dd9' },
  { primary: '#43e97b', light: '#e0ffe8', header: '#2dcf65' },
  { primary: '#fa709a', light: '#ffe8f0', header: '#e35682' },
  { primary: '#feca57', light: '#fff8e0', header: '#e8b931' },
  { primary: '#ff9a9e', light: '#ffe8ea', header: '#ff6b7a' },
  { primary: '#a8edea', light: '#e0fffe', header: '#7fe1dd' },
  { primary: '#fed6e3', light: '#fffbf0', header: '#fdbac8' },
  { primary: '#d299c2', light: '#f3e8ff', header: '#c278b8' },
]

const ERROR_RANGES = [
  { range: '±0.1 to ±5', min: 0.1, max: 5 },
  { range: '±6 to ±10', min: 6, max: 10 },
  { range: '±11 to ±15', min: 11, max: 15 },
  { range: '±16 to ±20', min: 16, max: 20 },
  { range: '±21 to ±25', min: 21, max: 25 },
]

// ============================================================================
// COMPONENT
// ============================================================================

interface MetaGraphCanvasProps {
  configPath: string
}

const MetaGraphCanvas: React.FC<MetaGraphCanvasProps> = ({ configPath }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Data state
  const [patientData, setPatientData] = useState<Patient[]>([])
  const [predictionData, setPredictionData] = useState<PredictionData[]>([])
  const [loading, setLoading] = useState(!configPath)
  const [error, setError] = useState<string | null>(null)

  // Camera & interaction state
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Layer visibility state
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    L0: true,
    L1: true,
    L2: true,
  })

  // Graph data refs
  const nodesRef = useRef<Node[]>([])
  const edgesRef = useRef<Edge[]>([])
  const animationFrameRef = useRef<number | null>(null)

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [patientRes, predictionRes] = await Promise.all([
          fetch(`http://localhost:5000/configurator/${configPath}/input/initial_data.json`),
          fetch(`http://localhost:5000/configurator/${configPath}/output/regressor_predictions.json`)
        ])

        if (!patientRes.ok) throw new Error('Failed to load patient data')
        const patients = await patientRes.json()
        setPatientData(Array.isArray(patients) ? patients : [])

        if (predictionRes.ok) {
          const predictions = await predictionRes.json()
          // Convert object indexed by Patient_ID to array
          const predictionArray = Array.isArray(predictions)
            ? predictions
            : Object.values(predictions)
          setPredictionData(predictionArray)
        }

        setError(null)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (configPath) fetchData()
  }, [configPath])

  // ============================================================================
  // GRAPH CONSTRUCTION
  // ============================================================================

  useEffect(() => {
    if (!patientData.length) return

    const nodes: Node[] = []
    const edges: Edge[] = []

    // --- L0: Data Graph Layer ---
    const l0NodeX = [50, 230, 410, 590, 770, 950, 1130, 1310, 1490, 1670, 1850]
    const l0Range = LAYER_Y_RANGES.L0

    CATEGORY_KEY_ORDER.forEach((catKey, colIndex) => {
      const palette = COLOR_PALETTE[colIndex % COLOR_PALETTE.length]

      // Header node
      nodes.push({
        id: `L0-header-${catKey}`,
        label: catKey.replace(/_/g, ' '),
        x: l0NodeX[colIndex],
        y: l0Range.min + 30,
        radius: 20,
        color: palette.header,
        layer: 'L0',
        type: 'header'
      })

      // Value nodes
      CATEGORY_VALUES[catKey].forEach((val, rIndex) => {
        nodes.push({
          id: `L0-${catKey}-${rIndex}`,
          label: val.substring(0, 15),
          x: l0NodeX[colIndex],
          y: l0Range.min + 80 + rIndex * 35,
          radius: 15,
          color: palette.primary,
          layer: 'L0',
          type: 'value'
        })
      })
    })

    // L0 edges (sample few connections to show data flow)
    nodes.forEach(node => {
      if (node.layer === 'L0' && node.type === 'value') {
        const nextNodes = nodes.filter(n => n.layer === 'L0' && n.type === 'value' && n.x > node.x)
        if (nextNodes.length > 0) {
          const next = nextNodes[Math.floor(Math.random() * Math.min(nextNodes.length, 2))]
          edges.push({
            id: `L0-edge-${node.id}-${next.id}`,
            fromId: node.id,
            toId: next.id,
            label: '',
            color: 'rgba(102, 126, 234, 0.3)',
            layer: 'L0'
          })
        }
      }
    })

    // --- L1: DL Inference Graph Layer ---
    const l1Range = LAYER_Y_RANGES.L1
    let nodeIndex = 0

    // All Patients node
    nodes.push({
      id: 'L1-all-patients',
      label: `All Patients\n(${predictionData.length})`,
      x: 100,
      y: l1Range.centerY,
      radius: 40,
      color: '#667eea',
      layer: 'L1',
      type: 'patients'
    })

    // Model nodes & prediction nodes
    const modelNames = new Set<string>()
    predictionData.forEach(p => {
      if (p.Errors) {
        Object.keys(p.Errors).forEach(m => modelNames.add(m))
      }
    })

    const models = Array.from(modelNames).sort()
    const modelSpacing = Math.max(150, 800 / models.length)

    models.forEach((modelName, modelIdx) => {
      const modelX = 300 + modelIdx * modelSpacing
      const modelY = l1Range.centerY - 100

      // Model node
      nodes.push({
        id: `L1-model-${modelIdx}`,
        label: modelName.substring(0, 12),
        x: modelX,
        y: modelY,
        radius: 35,
        color: '#764ba2',
        layer: 'L1',
        type: 'model'
      })

      // Edge: Patients -> Model
      edges.push({
        id: `L1-edge-patients-model-${modelIdx}`,
        fromId: 'L1-all-patients',
        toId: `L1-model-${modelIdx}`,
        label: '',
        color: 'rgba(118, 75, 162, 0.4)',
        layer: 'L1'
      })

      // Prediction node
      nodes.push({
        id: `L1-pred-${modelIdx}`,
        label: 'eGFR\nPred.',
        x: modelX,
        y: modelY + 120,
        radius: 30,
        color: '#3b82f6',
        layer: 'L1',
        type: 'prediction'
      })

      // Edge: Model -> Prediction
      edges.push({
        id: `L1-edge-model-pred-${modelIdx}`,
        fromId: `L1-model-${modelIdx}`,
        toId: `L1-pred-${modelIdx}`,
        label: '',
        color: 'rgba(59, 130, 246, 0.4)',
        layer: 'L1'
      })

      // Error bucket nodes
      ERROR_RANGES.forEach((range, errIdx) => {
        const errorX = modelX + 100
        const errorY = l1Range.min + 80 + errIdx * 90

        nodes.push({
          id: `L1-error-${modelIdx}-${errIdx}`,
          label: range.range,
          x: errorX,
          y: errorY,
          radius: 25,
          color: '#f59e0b',
          layer: 'L1',
          type: 'error'
        })

        // Edge: Prediction -> Error
        edges.push({
          id: `L1-edge-pred-error-${modelIdx}-${errIdx}`,
          fromId: `L1-pred-${modelIdx}`,
          toId: `L1-error-${modelIdx}-${errIdx}`,
          label: '',
          color: 'rgba(245, 158, 11, 0.4)',
          layer: 'L1'
        })
      })
    })

    // --- L2/L3: Aggregation & Decision Layer ---
    const l2Range = LAYER_Y_RANGES.L2

    // Feature Pooling node (aggregates L0)
    nodes.push({
      id: 'L2-pooling',
      label: 'Feature\nPooling',
      x: 300,
      y: l2Range.centerY,
      radius: 38,
      color: '#10b981',
      layer: 'L2',
      type: 'aggregation'
    })

    // Model Aggregation node (aggregates L1)
    nodes.push({
      id: 'L2-model-agg',
      label: 'Model\nAggregation',
      x: 700,
      y: l2Range.centerY,
      radius: 38,
      color: '#f59e0b',
      layer: 'L2',
      type: 'aggregation'
    })

    // Decision node (final outcome)
    nodes.push({
      id: 'L2-decision',
      label: 'CKD/NON-CKD\nDecision',
      x: 1100,
      y: l2Range.centerY,
      radius: 38,
      color: '#ef4444',
      layer: 'L2',
      type: 'decision'
    })

    // L2 internal edges
    edges.push({
      id: 'L2-edge-pooling-agg',
      fromId: 'L2-pooling',
      toId: 'L2-model-agg',
      label: '',
      color: 'rgba(16, 185, 129, 0.3)',
      layer: 'L2'
    })

    edges.push({
      id: 'L2-edge-agg-decision',
      fromId: 'L2-model-agg',
      toId: 'L2-decision',
      label: '',
      color: 'rgba(239, 68, 68, 0.3)',
      layer: 'L2'
    })

    // --- CROSS-LAYER EDGES ---
    // L0 -> L2 (Feature Pooling)
    const l0ValueNodes = nodes.filter(n => n.layer === 'L0' && n.type === 'value')
    if (l0ValueNodes.length > 0) {
      const sample = l0ValueNodes[Math.floor(l0ValueNodes.length / 2)]
      edges.push({
        id: `cross-l0-l2-pooling`,
        fromId: sample.id,
        toId: 'L2-pooling',
        label: 'Feature Pooling',
        color: 'rgba(34, 197, 94, 0.6)',
        layer: 'cross'
      })
    }

    // L1 -> L2 (Model Aggregation)
    const l1ErrorNodes = nodes.filter(n => n.layer === 'L1' && n.type === 'error')
    if (l1ErrorNodes.length > 0) {
      const sample = l1ErrorNodes[Math.floor(l1ErrorNodes.length / 2)]
      edges.push({
        id: `cross-l1-l2-agg`,
        fromId: sample.id,
        toId: 'L2-model-agg',
        label: 'Model Aggregation',
        color: 'rgba(249, 115, 22, 0.6)',
        layer: 'cross'
      })
    }

    // L2 -> Decision (Outcome Aggregation - internal to L2 but semantically important)
    edges.push({
      id: `cross-l2-decision`,
      fromId: 'L2-model-agg',
      toId: 'L2-decision',
      label: 'Outcome Aggregation',
      color: 'rgba(239, 68, 68, 0.6)',
      layer: 'cross'
    })

    nodesRef.current = nodes
    edgesRef.current = edges
  }, [patientData, predictionData])

  // ============================================================================
  // CANVAS RENDERING
  // ============================================================================

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)

    // Layer background separators
    ctx.fillStyle = 'rgba(226, 232, 240, 0.3)'
    Object.values(LAYER_Y_RANGES).forEach(range => {
      ctx.fillRect(0, range.min / camera.zoom - camera.y / camera.zoom, width, (range.max - range.min) / camera.zoom)
    })

    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)

    const viewLeft = -camera.x / camera.zoom
    const viewTop = -camera.y / camera.zoom
    const viewRight = viewLeft + width / camera.zoom
    const viewBottom = viewTop + height / camera.zoom

    // Draw layer labels
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.font = '700 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    if (layerVisibility.L0) {
      ctx.fillText('L0 – Data Graph', 30, LAYER_Y_RANGES.L0.min + 10)
    }
    if (layerVisibility.L1) {
      ctx.fillText('L1 – DL Inference Graph', 30, LAYER_Y_RANGES.L1.min + 10)
    }
    if (layerVisibility.L2) {
      ctx.fillText('L2/L3 – Aggregation & Decision', 30, LAYER_Y_RANGES.L2.min + 10)
    }

    // Draw edges
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    edgesRef.current.forEach(edge => {
      let shouldRender = false

      if (edge.layer === 'cross') {
        // For cross-layer edges, show only if both source and target layers are visible
        const sourceLayer = edge.fromId.split('-')[0] as keyof LayerVisibility
        const targetLayer = edge.toId.split('-')[0] as keyof LayerVisibility
        shouldRender = layerVisibility[sourceLayer] && layerVisibility[targetLayer]
      } else {
        // For same-layer edges, show only if that layer is visible
        shouldRender = layerVisibility[edge.layer as keyof LayerVisibility]
      }

      if (!shouldRender) return

      const fromNode = nodesRef.current.find(n => n.id === edge.fromId)
      const toNode = nodesRef.current.find(n => n.id === edge.toId)
      if (!fromNode || !toNode) return

      const fromX = fromNode.x + fromNode.radius
      const fromY = fromNode.y + fromNode.radius
      const toX = toNode.x + toNode.radius
      const toY = toNode.y + toNode.radius

      ctx.lineWidth = edge.layer === 'cross' ? 2.5 : 1.5
      ctx.strokeStyle = edge.color
      ctx.globalAlpha = hoveredEdge === edge.id ? 1 : 0.7

      // Curved edge
      ctx.beginPath()
      const midX = (fromX + toX) / 2
      const midY = (fromY + toY) / 2
      const dx = toX - fromX
      const dy = toY - fromY
      const dist = Math.hypot(dx, dy)
      const controlX = midX - dy * 0.2
      const controlY = midY + dx * 0.2

      ctx.moveTo(fromX, fromY)
      ctx.quadraticCurveTo(controlX, controlY, toX, toY)
      ctx.stroke()

      // Draw edge label if cross-layer
      if (edge.layer === 'cross' && edge.label) {
        ctx.globalAlpha = 1
        ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffffff'

        const labelX = (fromX + toX) / 2
        const labelY = (fromY + toY) / 2

        // Background for label
        const metrics = ctx.measureText(edge.label)
        const textWidth = metrics.width
        const textHeight = 14
        const padding = 4

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(labelX - textWidth / 2 - padding, labelY - textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2)

        ctx.fillStyle = '#ffffff'
        ctx.fillText(edge.label, labelX, labelY)
      }
    })

    ctx.globalAlpha = 1

    // Draw nodes
    nodesRef.current.forEach(node => {
      const shouldRender = layerVisibility[node.layer]
      if (!shouldRender) return

      const nodeX = node.x + node.radius
      const nodeY = node.y + node.radius

      if (nodeX < viewLeft || nodeX > viewRight || nodeY < viewTop || nodeY > viewBottom) return

      const isHovered = hoveredNode === node.id

      // Node circle
      ctx.fillStyle = node.color
      ctx.beginPath()
      ctx.arc(nodeX, nodeY, node.radius, 0, Math.PI * 2)
      ctx.fill()

      // Hover effect
      if (isHovered) {
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
        ctx.shadowBlur = 8
      }

      // Node label
      ctx.fillStyle = '#ffffff'
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const lines = node.label.split('\n')
      const lineHeight = 13
      const totalHeight = lines.length * lineHeight

      lines.forEach((line, idx) => {
        ctx.fillText(line, nodeX, nodeY - totalHeight / 2 + idx * lineHeight + 6)
      })
    })

    ctx.shadowColor = 'transparent'
  }, [camera, hoveredNode, hoveredEdge, layerVisibility])

  // Animation loop
  useEffect(() => {
    const render = () => {
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

  // Canvas resize
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

  // ============================================================================
  // INTERACTION HANDLERS
  // ============================================================================

  const getCanvasCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - camera.y) / camera.zoom
    }
  }, [camera])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)

    // Check if clicking on node
    for (const node of nodesRef.current) {
      const dist = Math.hypot(
        coords.x - (node.x + node.radius),
        coords.y - (node.y + node.radius)
      )
      if (dist <= node.radius) {
        if (node.type === 'header') return
        setIsDragging(true)
        setDragStart({ x: coords.x - (node.x + node.radius), y: coords.y - (node.y + node.radius) })
        return
      }
    }

    // Otherwise, start panning
    setIsPanning(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [getCanvasCoords])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)

    // Check node hover
    let foundNode = null
    for (const node of nodesRef.current) {
      const dist = Math.hypot(
        coords.x - (node.x + node.radius),
        coords.y - (node.y + node.radius)
      )
      if (dist <= node.radius) {
        foundNode = node.id
        break
      }
    }
    setHoveredNode(foundNode)

    // Check edge hover
    let foundEdge = null
    const threshold = 30 / camera.zoom
    for (const edge of edgesRef.current) {
      const fromNode = nodesRef.current.find(n => n.id === edge.fromId)
      const toNode = nodesRef.current.find(n => n.id === edge.toId)
      if (!fromNode || !toNode) continue

      const fromX = fromNode.x + fromNode.radius
      const fromY = fromNode.y + fromNode.radius
      const toX = toNode.x + toNode.radius
      const toY = toNode.y + toNode.radius

      const midX = (fromX + toX) / 2
      const midY = (fromY + toY) / 2

      const dist = Math.hypot(coords.x - midX, coords.y - midY)
      if (dist < threshold) {
        foundEdge = edge.id
        setTooltipPos({ x: e.clientX, y: e.clientY })
        break
      }
    }
    setHoveredEdge(foundEdge)

    if (isPanning) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }, [getCanvasCoords, isPanning, dragStart, camera.zoom])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsPanning(false)
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

    const ZOOM_SENSITIVITY = 0.0008
    const delta = -e.deltaY * ZOOM_SENSITIVITY
    const newZoom = Math.max(0.1, Math.min(3, camera.zoom * (1 + delta)))

    const newX = mouseX - worldX * newZoom
    const newY = mouseY - worldY * newZoom

    setCamera({ x: newX, y: newY, zoom: newZoom })
  }, [camera])

  const fitToScreen = useCallback(() => {
    if (!containerRef.current || nodesRef.current.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodesRef.current.forEach(node => {
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + node.radius * 2)
      maxY = Math.max(maxY, node.y + node.radius * 2)
    })

    const padding = 100
    const graphWidth = maxX - minX + padding * 2
    const graphHeight = maxY - minY + padding * 2

    const rect = containerRef.current.getBoundingClientRect()
    const scaleX = rect.width / graphWidth
    const scaleY = rect.height / graphHeight
    const newZoom = Math.max(0.1, Math.min(2, Math.min(scaleX, scaleY)))

    const graphCenterX = (minX + maxX) / 2
    const graphCenterY = (minY + maxY) / 2
    const containerCenterX = rect.width / 2
    const containerCenterY = rect.height / 2

    const newX = containerCenterX - graphCenterX * newZoom
    const newY = containerCenterY - graphCenterY * newZoom

    setCamera({ x: newX, y: newY, zoom: newZoom })
  }, [])

  // Auto-fit on load
  useEffect(() => {
    if (!loading && nodesRef.current.length > 0) {
      const timer = setTimeout(fitToScreen, 100)
      return () => clearTimeout(timer)
    }
  }, [loading, fitToScreen])

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="meta-graph-loading">
        <div className="meta-graph-spinner"></div>
        <p className="meta-graph-loading-text">Composing Meta Graph...</p>
      </div>
    )
  }

  if (error) {
    return <div className="meta-graph-error">Error: {error}</div>
  }

  return (
    <div className="meta-graph-wrapper">
      <div className="meta-graph-header">
        <div className="meta-graph-info">
          3 Layers • L0 Data • L1 DL Inference • L2/L3 Aggregation
        </div>

        <div className="meta-graph-controls-group">
          <div className="meta-graph-layer-toggles">
            <label className="meta-graph-toggle">
              <input
                type="checkbox"
                checked={layerVisibility.L0}
                onChange={(e) => setLayerVisibility(prev => ({ ...prev, L0: e.target.checked }))}
              />
              <span>Show L0</span>
            </label>
            <label className="meta-graph-toggle">
              <input
                type="checkbox"
                checked={layerVisibility.L1}
                onChange={(e) => setLayerVisibility(prev => ({ ...prev, L1: e.target.checked }))}
              />
              <span>Show L1</span>
            </label>
            <label className="meta-graph-toggle">
              <input
                type="checkbox"
                checked={layerVisibility.L2}
                onChange={(e) => setLayerVisibility(prev => ({ ...prev, L2: e.target.checked }))}
              />
              <span>Show L2/L3</span>
            </label>
          </div>

          <div className="meta-graph-zoom-controls">
            <button
              onClick={() => setCamera(prev => ({ ...prev, zoom: Math.max(0.1, prev.zoom / 1.2) }))}
              className="meta-graph-zoom-btn"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={fitToScreen}
              className="meta-graph-zoom-btn"
              title="Fit to Screen"
            >
              ⤢
            </button>
            <button
              onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}
              className="meta-graph-zoom-btn meta-graph-zoom-reset"
              title="Reset 100%"
            >
              1:1
            </button>
            <button
              onClick={() => setCamera(prev => ({ ...prev, zoom: Math.min(3, prev.zoom * 1.2) }))}
              className="meta-graph-zoom-btn"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="meta-graph-canvas-container">
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
            cursor: isPanning ? 'grabbing' : (isDragging ? 'grabbing' : (hoveredNode ? 'pointer' : 'default'))
          }}
        />

        <div className="meta-graph-zoom-indicator">{Math.round(camera.zoom * 100)}%</div>

        {hoveredEdge && (
          <div
            className="meta-graph-edge-tooltip"
            style={{
              position: 'absolute',
              left: `${tooltipPos.x + 10}px`,
              top: `${tooltipPos.y + 10}px`
            }}
          >
            {edgesRef.current.find(e => e.id === hoveredEdge)?.label || 'Connection'}
          </div>
        )}
      </div>
    </div>
  )
}

export default MetaGraphCanvas
