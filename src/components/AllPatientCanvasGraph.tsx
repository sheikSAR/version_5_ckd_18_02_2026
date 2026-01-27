import React, { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/AllPatientCanvasGraph.css'

interface PredictionData {
  Patient_ID: string
  Actual_EGFR: number | null
  Predictions: Record<string, number>
  Errors: Record<string, number>
}

interface NodeData {
  id: string
  type: 'patients' | 'model' | 'prediction' | 'error-range' | 'count'
  x: number
  y: number
  radius: number
  label: string
  value?: number | string
  color: string
  column: number
  modelIndex?: number
}

interface EdgeData {
  from: string
  to: string
  type: string
  progress: number
}

interface AnimationState {
  patientsNodeAlpha: number
  edgesProgress: Record<string, number>
  modelNodesAlpha: Record<string, number>
  predictionNodesAlpha: Record<string, number>
  errorRangeNodesAlpha: Record<string, number>
  countNodesAlpha: Record<string, number>
  dashOffset: number
  hoveredBranch: string | null
}

interface ErrorBinCount {
  range: string
  min: number
  max: number
  count: number
}

interface ModelErrorData {
  modelName: string
  bins: ErrorBinCount[]
}

const AllPatientCanvasGraph: React.FC<{ predictions: PredictionData[] | null; selectedModels?: string[]; loading?: boolean }> = ({
  predictions = null,
  selectedModels = [],
  loading = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const nodesRef = useRef<NodeData[]>([])
  const edgesRef = useRef<EdgeData[]>([])
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const animationStateRef = useRef<AnimationState>({
    patientsNodeAlpha: 0,
    edgesProgress: {},
    modelNodesAlpha: {},
    predictionNodesAlpha: {},
    errorRangeNodesAlpha: {},
    countNodesAlpha: {},
    dashOffset: 0,
    hoveredBranch: null,
  })
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [dragNode, setDragNode] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Fixed error ranges (exact spec)
  const ERROR_RANGES: ErrorBinCount[] = [
    { range: '±0.1 to ±5', min: 0.1, max: 5, count: 0 },
    { range: '±6 to ±10', min: 6, max: 10, count: 0 },
    { range: '±11 to ±15', min: 11, max: 15, count: 0 },
    { range: '±16 to ±20', min: 16, max: 20, count: 0 },
    { range: '±21 to ±25', min: 21, max: 25, count: 0 },
  ]

  // Zoom constants
  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 3
  const ZOOM_SENSITIVITY = 0.0008

  // Animation timings (reused from CanvasGraphRenderer)
  const TIMINGS = {
    patientsIn: 390,
    edgeDelay: 100,
    edgeDuration: 490,
    modelInDelay: 147,
    modelInDuration: 290,
    predictionEdgeDelay: 100,
    predictionEdgeDuration: 390,
    predictionInDelay: 100,
    predictionInDuration: 290,
    errorEdgeDelay: 100,
    errorEdgeDuration: 390,
    errorInDelay: 100,
    errorInDuration: 290,
    countEdgeDelay: 100,
    countEdgeDuration: 390,
    countInDelay: 100,
    countInDuration: 290,
  }

  // Extract unique model names in consistent order
  const getModelNames = useCallback((data: PredictionData[]): string[] => {
    const modelNames = new Set<string>()
    data.forEach((patient) => {
      if (patient.Errors) {
        Object.keys(patient.Errors).forEach((modelName) => {
          modelNames.add(modelName)
        })
      }
    })
    return Array.from(modelNames).sort()
  }, [])

  // Bin errors for a specific model based on that model's error values
  const binErrorsForModel = useCallback((data: PredictionData[], modelName: string): ErrorBinCount[] => {
    const bins = ERROR_RANGES.map((range) => ({ ...range, count: 0 }))

    data.forEach((patient) => {
      const error = patient.Errors?.[modelName]
      if (error === undefined) return

      const absError = Math.abs(error)

      // Find which bin this error falls into
      for (let i = 0; i < bins.length; i++) {
        if (absError >= bins[i].min && absError <= bins[i].max) {
          bins[i].count++
          break
        }
      }
    })

    return bins
  }, [])

  // Get model-specific error binning data for all models or selected models
  const getModelErrorData = useCallback((data: PredictionData[], filterByModels?: string[]): ModelErrorData[] => {
    let modelNames = getModelNames(data)

    // Filter to only selected models if provided
    if (filterByModels && filterByModels.length > 0) {
      const selectedSet = new Set(filterByModels)
      modelNames = modelNames.filter(name => selectedSet.has(name))
    }

    return modelNames.map((modelName) => ({
      modelName,
      bins: binErrorsForModel(data, modelName),
    }))
  }, [getModelNames, binErrorsForModel])

  // Calculate deterministic left-to-right hierarchical layout with multiple models
  const calculateLayout = useCallback((data: PredictionData[]) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height

    const modelErrorData = getModelErrorData(data, selectedModels.length > 0 ? selectedModels : undefined)
    const numModels = modelErrorData.length
    const numErrorRanges = ERROR_RANGES.length

    // 5-column layout with specific x positions (reduced horizontal spacing)
    const columnX = {
      patients: width * 0.08,
      model: width * 0.18,
      prediction: width * 0.30,
      errorRange: width * 0.45,
      count: width * 0.60,
    }

    const nodes: NodeData[] = []
    const edges: EdgeData[] = []

    // Vertical spacing between models
    const minVerticalSpacingPerModel = (numErrorRanges + 1) * 85
    const totalRequiredHeight = numModels * minVerticalSpacingPerModel
    const startYOffset = Math.max(60, (height - totalRequiredHeight) / 2)

    // Column 0: "All Patients" node (vertically centered)
    const centerY = height / 2
    nodes.push({
      id: 'patients',
      type: 'patients',
      x: columnX.patients,
      y: centerY,
      radius: 45,
      label: `All\nPatients\n(${data.length})`,
      column: 0,
      color: '#667eea',
    })

    // For each model, create a complete hierarchical lane
    modelErrorData.forEach((modelData, modelIndex) => {
      const modelName = modelData.modelName
      const bins = modelData.bins

      // Base Y position for this model's lane
      const laneBaseY = startYOffset + modelIndex * minVerticalSpacingPerModel

      // Model node
      const modelId = `model-${modelIndex}`
      nodes.push({
        id: modelId,
        type: 'model',
        x: columnX.model,
        y: laneBaseY + 120,
        radius: 40,
        label: modelName,
        column: 1,
        color: '#764ba2',
        modelIndex,
      })

      // Edge: Patients -> Model
      edges.push({
        from: 'patients',
        to: modelId,
        type: 'patients-model',
        progress: 0,
      })

      // Prediction node for this model
      const predictionId = `prediction-${modelIndex}`
      nodes.push({
        id: predictionId,
        type: 'prediction',
        x: columnX.prediction,
        y: laneBaseY + 120,
        radius: 35,
        label: 'eGFR\nPredictions',
        column: 2,
        color: '#3b82f6',
        modelIndex,
      })

      // Edge: Model -> Prediction
      edges.push({
        from: modelId,
        to: predictionId,
        type: 'model-prediction',
        progress: 0,
      })

      // Error ranges and counts for this model
      const errorVerticalStart = laneBaseY
      const errorVerticalSpacing = 85

      bins.forEach((bin, binIndex) => {
        const errorY = errorVerticalStart + binIndex * errorVerticalSpacing

        // Error Range node
        const errorId = `error-${modelIndex}-${binIndex}`
        nodes.push({
          id: errorId,
          type: 'error-range',
          x: columnX.errorRange,
          y: errorY,
          radius: 32,
          label: bin.range,
          column: 3,
          color: '#f59e0b',
          modelIndex,
        })

        // Edge: Prediction -> Error Range
        edges.push({
          from: predictionId,
          to: errorId,
          type: 'prediction-error',
          progress: 0,
        })

        // Count node
        const countId = `count-${modelIndex}-${binIndex}`
        nodes.push({
          id: countId,
          type: 'count',
          x: columnX.count,
          y: errorY,
          radius: 28,
          label: String(bin.count),
          value: bin.count,
          column: 4,
          color: '#10b981',
          modelIndex,
        })

        // Edge: Error Range -> Count
        edges.push({
          from: errorId,
          to: countId,
          type: 'error-count',
          progress: 0,
        })
      })
    })

    nodesRef.current = nodes
    edgesRef.current = edges

    // Initialize animation state
    animationStateRef.current = {
      patientsNodeAlpha: 0,
      edgesProgress: {},
      modelNodesAlpha: {},
      predictionNodesAlpha: {},
      errorRangeNodesAlpha: {},
      countNodesAlpha: {},
      dashOffset: 0,
      hoveredBranch: null,
    }

    edges.forEach((edge) => {
      animationStateRef.current.edgesProgress[`${edge.from}-${edge.to}`] = 0
    })

    nodes.forEach((node) => {
      if (node.type === 'model') {
        animationStateRef.current.modelNodesAlpha[node.id] = 0
      } else if (node.type === 'prediction') {
        animationStateRef.current.predictionNodesAlpha[node.id] = 0
      } else if (node.type === 'error-range') {
        animationStateRef.current.errorRangeNodesAlpha[node.id] = 0
      } else if (node.type === 'count') {
        animationStateRef.current.countNodesAlpha[node.id] = 0
      }
    })
  }, [getModelErrorData, selectedModels])

  // Update animation state over time with parallel phase waves for all models
  const updateAnimation = useCallback((elapsed: number) => {
    const state = animationStateRef.current
    const nodes = nodesRef.current
    const edges = edgesRef.current

    // Get unique model indices
    const modelIndices = new Set<number>()
    nodes.forEach((n) => {
      if (n.modelIndex !== undefined) {
        modelIndices.add(n.modelIndex)
      }
    })

    // Phase 1: Patients node (0-390ms)
    state.patientsNodeAlpha = Math.min(elapsed / TIMINGS.patientsIn, 1)

    // For each model, animate its entire lane in parallel
    modelIndices.forEach((modelIndex) => {
      // Phase 2: Patients -> Model edge and Model node
      const phase2StartTime = TIMINGS.patientsIn + TIMINGS.edgeDelay
      const phase2EdgeDuration = TIMINGS.edgeDuration
      const phase2NodeDelay = TIMINGS.modelInDelay
      const phase2NodeDuration = TIMINGS.modelInDuration
      const phase2TotalDuration = phase2EdgeDuration + phase2NodeDelay + phase2NodeDuration

      const edgeElapsed = Math.max(0, elapsed - phase2StartTime)
      const edgeProgress = Math.min(edgeElapsed / phase2EdgeDuration, 1)
      state.edgesProgress[`patients-model-${modelIndex}`] = edgeProgress

      const nodeStartTime = phase2StartTime + phase2EdgeDuration + phase2NodeDelay
      const nodeElapsed = Math.max(0, elapsed - nodeStartTime)
      const nodeAlpha = Math.min(nodeElapsed / phase2NodeDuration, 1)
      state.modelNodesAlpha[`model-${modelIndex}`] = nodeAlpha

      // Phase 3: Model -> Prediction edge and Prediction node
      const phase3StartTime = phase2StartTime + phase2TotalDuration + TIMINGS.predictionEdgeDelay
      const phase3EdgeDuration = TIMINGS.predictionEdgeDuration
      const phase3NodeDelay = TIMINGS.predictionInDelay
      const phase3NodeDuration = TIMINGS.predictionInDuration
      const phase3TotalDuration = phase3EdgeDuration + phase3NodeDelay + phase3NodeDuration

      const edgeElapsed3 = Math.max(0, elapsed - phase3StartTime)
      const edgeProgress3 = Math.min(edgeElapsed3 / phase3EdgeDuration, 1)
      state.edgesProgress[`model-${modelIndex}-prediction-${modelIndex}`] = edgeProgress3

      const nodeStartTime3 = phase3StartTime + phase3EdgeDuration + phase3NodeDelay
      const nodeElapsed3 = Math.max(0, elapsed - nodeStartTime3)
      const nodeAlpha3 = Math.min(nodeElapsed3 / phase3NodeDuration, 1)
      state.predictionNodesAlpha[`prediction-${modelIndex}`] = nodeAlpha3

      // Phase 4: Prediction -> Error Ranges (all in parallel for this model)
      const phase4StartTime = phase3StartTime + phase3TotalDuration + TIMINGS.errorEdgeDelay
      const phase4EdgeDuration = TIMINGS.errorEdgeDuration
      const phase4NodeDelay = TIMINGS.errorInDelay
      const phase4NodeDuration = TIMINGS.errorInDuration
      const phase4TotalDuration = phase4EdgeDuration + phase4NodeDelay + phase4NodeDuration

      const numErrorRanges = ERROR_RANGES.length

      for (let errorIndex = 0; errorIndex < numErrorRanges; errorIndex++) {
        const edgeElapsed4 = Math.max(0, elapsed - phase4StartTime)
        const edgeProgress4 = Math.min(edgeElapsed4 / phase4EdgeDuration, 1)
        state.edgesProgress[`prediction-${modelIndex}-error-${modelIndex}-${errorIndex}`] = edgeProgress4

        const nodeStartTime4 = phase4StartTime + phase4EdgeDuration + phase4NodeDelay
        const nodeElapsed4 = Math.max(0, elapsed - nodeStartTime4)
        const nodeAlpha4 = Math.min(nodeElapsed4 / phase4NodeDuration, 1)
        state.errorRangeNodesAlpha[`error-${modelIndex}-${errorIndex}`] = nodeAlpha4
      }

      // Phase 5: Error Range -> Count (all in parallel for this model)
      const phase5StartTime = phase4StartTime + phase4TotalDuration + TIMINGS.countEdgeDelay
      const phase5EdgeDuration = TIMINGS.countEdgeDuration
      const phase5NodeDelay = TIMINGS.countInDelay
      const phase5NodeDuration = TIMINGS.countInDuration

      for (let errorIndex = 0; errorIndex < numErrorRanges; errorIndex++) {
        const edgeElapsed5 = Math.max(0, elapsed - phase5StartTime)
        const edgeProgress5 = Math.min(edgeElapsed5 / phase5EdgeDuration, 1)
        state.edgesProgress[`error-${modelIndex}-${errorIndex}-count-${modelIndex}-${errorIndex}`] = edgeProgress5

        const nodeStartTime5 = phase5StartTime + phase5EdgeDuration + phase5NodeDelay
        const nodeElapsed5 = Math.max(0, elapsed - nodeStartTime5)
        const nodeAlpha5 = Math.min(nodeElapsed5 / phase5NodeDuration, 1)
        state.countNodesAlpha[`count-${modelIndex}-${errorIndex}`] = nodeAlpha5
      }
    })

    // Continuous dash offset for animated dotted lines
    state.dashOffset = (state.dashOffset + 2) % 20
  }, [])

  const drawNode = useCallback(
    (ctx: CanvasRenderingContext2D, node: NodeData, alpha: number, isHovered: boolean) => {
      if (alpha <= 0) return

      const scale = alpha
      const radius = node.radius * scale
      const fontSize = 11 * scale

      ctx.save()
      ctx.globalAlpha = alpha

      // Draw shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 2

      // Draw node circle
      ctx.fillStyle = isHovered ? adjustBrightness(node.color, 20) : node.color
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
      ctx.fill()

      // Draw border for hover
      if (isHovered) {
        ctx.strokeStyle = adjustBrightness(node.color, 40)
        ctx.lineWidth = 3
        ctx.stroke()
      }

      // Draw text
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto'`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'none'

      if (node.label.includes('\n')) {
        // Multi-line text
        const lines = node.label.split('\n')
        const lineCount = lines.length
        const offset = (lineCount - 1) / 2

        for (let i = 0; i < lineCount; i++) {
          const y = node.y + (i - offset) * 13 * scale
          ctx.fillText(lines[i], node.x, y)
        }
      } else {
        // Single-line text
        ctx.fillText(node.label, node.x, node.y)
      }

      ctx.restore()
    },
    []
  )

  const drawEdge = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      edge: EdgeData,
      fromNode: NodeData,
      toNode: NodeData,
      progress: number,
      isHovered: boolean
    ) => {
      if (progress <= 0) return

      const startX = fromNode.x
      const startY = fromNode.y
      const endX = toNode.x
      const endY = toNode.y

      const dx = endX - startX
      const dy = endY - startY
      const length = Math.sqrt(dx * dx + dy * dy)
      const currentLength = length * progress

      const t = length > 0 ? currentLength / length : 0
      const currentX = startX + dx * t
      const currentY = startY + dy * t

      ctx.save()
      ctx.globalAlpha = progress

      // Draw dotted line
      ctx.strokeStyle = isHovered ? '#667eea' : '#cbd5e1'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.lineDashOffset = -animationStateRef.current.dashOffset
      ctx.lineCap = 'round'

      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(currentX, currentY)
      ctx.stroke()

      ctx.restore()
    },
    []
  )

  const drawLoadingAnimation = useCallback((ctx: CanvasRenderingContext2D, elapsed: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2

    // Clear canvas
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    // Draw rotating nodes
    const rotation = (elapsed / 20) % (Math.PI * 2)
    const radius = 60

    for (let i = 0; i < 3; i++) {
      const angle = rotation + (i / 3) * Math.PI * 2
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius

      const alpha = 0.3 + 0.5 * Math.sin(rotation + i)

      ctx.fillStyle = `rgba(102, 126, 234, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, 15, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw center node
    ctx.fillStyle = 'rgba(102, 126, 234, 0.8)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 20, 0, Math.PI * 2)
    ctx.fill()

    // Draw loading text
    ctx.fillStyle = '#667eea'
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto"'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Loading predictions...', centerX, centerY + 120)
  }, [])

  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: false })
    if (!ctx) return

    const now = performance.now()
    if (startTimeRef.current === 0) {
      startTimeRef.current = now
    }

    const elapsed = now - startTimeRef.current

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.98)')
    gradient.addColorStop(1, 'rgba(248, 249, 250, 0.98)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply camera transformation (pan and zoom)
    const camera = cameraRef.current
    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)

    if (loading) {
      drawLoadingAnimation(ctx, elapsed)
    } else if (predictions && nodesRef.current.length > 0) {
      updateAnimation(elapsed)

      const state = animationStateRef.current
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const edgesProgress = state.edgesProgress

      // Create node lookup map
      const nodeMap = new Map<string, NodeData>()
      nodes.forEach((node) => nodeMap.set(node.id, node))

      // Draw edges (background layer)
      edges.forEach((edge) => {
        const fromNode = nodeMap.get(edge.from)
        const toNode = nodeMap.get(edge.to)
        if (fromNode && toNode) {
          const progress = edgesProgress[`${edge.from}-${edge.to}`] || 0
          drawEdge(ctx, edge, fromNode, toNode, progress, false)
        }
      })

      // Draw nodes (foreground layer)
      const patientsAlpha = state.patientsNodeAlpha
      const modelAlphas = state.modelNodesAlpha
      const predictionAlphas = state.predictionNodesAlpha
      const errorRangeAlphas = state.errorRangeNodesAlpha
      const countAlphas = state.countNodesAlpha

      nodes.forEach((node) => {
        let alpha = 0

        switch (node.type) {
          case 'patients':
            alpha = patientsAlpha
            break
          case 'model':
            alpha = modelAlphas[node.id] || 0
            break
          case 'prediction':
            alpha = predictionAlphas[node.id] || 0
            break
          case 'error-range':
            alpha = errorRangeAlphas[node.id] || 0
            break
          case 'count':
            alpha = countAlphas[node.id] || 0
            break
        }

        if (alpha > 0) {
          drawNode(ctx, node, alpha, hoveredBranch !== null)
        }
      })

      ctx.restore()
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [predictions, loading, drawNode, drawEdge, updateAnimation, drawLoadingAnimation, hoveredBranch, camera])

  // Helper: Convert screen coordinates to world coordinates
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

  // Handle node dragging and canvas panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)
    const { x, y } = coords

    // Check if clicked on a node
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i]
      const distSquared = (x - node.x) ** 2 + (y - node.y) ** 2

      if (distSquared <= node.radius ** 2) {
        // Don't allow dragging the patients node
        if (node.type === 'patients') return
        setDragNode(node.id)
        setDragStart({ x: x - node.x, y: y - node.y })
        setIsDragging(true)
        return
      }
    }

    // If not on a node, start panning
    setIsPanning(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [getCanvasCoords])

  // Handle mouse move for dragging and panning
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)

    // Check for node hover
    let foundHover = null
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i]
      const distSquared = (coords.x - node.x) ** 2 + (coords.y - node.y) ** 2

      if (distSquared <= node.radius ** 2) {
        foundHover = node.id
        break
      }
    }
    setHoveredNode(foundHover)

    if (isDragging && dragNode) {
      // Update node position
      const nodeIndex = nodesRef.current.findIndex(n => n.id === dragNode)
      if (nodeIndex !== -1) {
        nodesRef.current[nodeIndex].x = coords.x - dragStart.x
        nodesRef.current[nodeIndex].y = coords.y - dragStart.y
      }
    } else if (isPanning) {
      // Pan the canvas
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }, [getCanvasCoords, isDragging, isPanning, dragNode, dragStart])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsPanning(false)
    setDragNode(null)
  }, [])

  // Handle zoom with mouse wheel (mouse-centered)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Current world position under mouse
    const worldX = (mouseX - camera.x) / camera.zoom
    const worldY = (mouseY - camera.y) / camera.zoom

    const delta = -e.deltaY * ZOOM_SENSITIVITY
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * (1 + delta)))

    // Calculate new position to keep world point under mouse stable
    const newX = mouseX - worldX * newZoom
    const newY = mouseY - worldY * newZoom

    setCamera({ x: newX, y: newY, zoom: newZoom })
  }, [camera])

  // Sync camera state with cameraRef for use in animate
  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  // Helper: Fit graph to screen
  const fitToScreen = useCallback(() => {
    if (nodesRef.current.length === 0 || !containerRef.current) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodesRef.current.forEach(node => {
      minX = Math.min(minX, node.x - node.radius)
      minY = Math.min(minY, node.y - node.radius)
      maxX = Math.max(maxX, node.x + node.radius)
      maxY = Math.max(maxY, node.y + node.radius)
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

  const zoomIn = useCallback(() => {
    setCamera(prev => ({ ...prev, zoom: Math.min(MAX_ZOOM, prev.zoom * 1.2) }))
  }, [])

  const zoomOut = useCallback(() => {
    setCamera(prev => ({ ...prev, zoom: Math.max(MIN_ZOOM, prev.zoom / 1.2) }))
  }, [])

  const resetCamera = useCallback(() => {
    setCamera({ x: 0, y: 0, zoom: 1 })
  }, [])

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()

      // Set display size (css pixels)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      // Set actual size in memory (scaled to account for extra pixel density)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)

      if (predictions && predictions.length > 0) {
        calculateLayout(predictions)
      }
    }

    const resizeObserver = new ResizeObserver(updateCanvasSize)
    resizeObserver.observe(container)
    updateCanvasSize()

    return () => resizeObserver.disconnect()
  }, [predictions, calculateLayout])

  // Calculate layout on predictions change
  useEffect(() => {
    if (predictions && predictions.length > 0) {
      const canvas = canvasRef.current
      if (canvas) {
        calculateLayout(predictions)
        startTimeRef.current = 0
      }
    }
  }, [predictions, calculateLayout])

  // Auto-fit on first load
  useEffect(() => {
    if (predictions && predictions.length > 0 && nodesRef.current.length > 0) {
      const timer = setTimeout(fitToScreen, 100)
      return () => clearTimeout(timer)
    }
  }, [predictions, fitToScreen])

  // Start animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [animate])

  return (
    <div ref={containerRef} className="all-patient-graph-container">
      <canvas
        ref={canvasRef}
        className="all-patient-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: isPanning ? 'grabbing' : (isDragging ? 'grabbing' : (hoveredNode ? 'pointer' : 'default')),
        }}
      />
      <div className="zoom-indicator">{Math.round(camera.zoom * 100)}%</div>
    </div>
  )
}

function adjustBrightness(color: string, amount: number): string {
  const usePound = color[0] === '#'
  const col = usePound ? color.slice(1) : color
  const num = parseInt(col, 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0x00ff) + amount)
  const b = Math.min(255, (num & 0x0000ff) + amount)
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`
}

export default AllPatientCanvasGraph
