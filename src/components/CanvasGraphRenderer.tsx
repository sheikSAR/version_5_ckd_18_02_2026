import React, { useEffect, useRef, useState, useCallback } from 'react'

interface GraphData {
  patientId: string
  actualEGFR: number | null
  models: Array<{
    name: string
    prediction: number
    error: number
  }>
}

interface NodeData {
  id: string
  type: 'patient' | 'model' | 'error-range' | 'outcome'
  x: number
  y: number
  radius: number
  label: string
  value?: number
  color: string
  modelIndex?: number
}

interface EdgeData {
  from: string
  to: string
  type: 'patient-model' | 'model-error-range' | 'error-range-outcome'
  progress: number
  label?: string
  color?: string
  modelIndex?: number
  animationStartTime?: number
  predictionValue?: number
}

interface AnimationState {
  patientNodeAlpha: number
  edgesProgress: Record<string, number>
  modelNodesAlpha: Record<string, number>
  errorRangeNodesAlpha: Record<string, number>
  outcomeNodesAlpha: Record<string, number>
  dashOffset: number
  hoveredBranch: string | null
}

// Error range bucket definitions
function getErrorRangeBucket(error: number): string {
  const absError = Math.abs(error)
  if (absError >= 0.1 && absError <= 5) return 'error-range-0'
  if (absError >= 6 && absError <= 10) return 'error-range-1'
  if (absError >= 11 && absError <= 15) return 'error-range-2'
  if (absError >= 15 && absError <= 20) return 'error-range-3'
  if (absError >= 21 && absError <= 25) return 'error-range-4'
  return 'error-range-0' // Default fallback
}

function getErrorRangeLabel(bucket: string): string {
  const labels: Record<string, string> = {
    'error-range-0': '±0.1 to ±5',
    'error-range-1': '±6 to ±10',
    'error-range-2': '±11 to ±15',
    'error-range-3': '±15 to ±20',
    'error-range-4': '±21 to ±25',
  }
  return labels[bucket] || 'Unknown'
}

// Unified medium red for all error buckets
function getErrorRangeColor(bucket: string): string {
  return '#e74c3c' // Unified medium red
}

// CKD classification logic
function classifyOutcome(prediction: number): 'CKD' | 'NON-CKD' {
  return prediction >= 90 ? 'NON-CKD' : 'CKD'
}

// Per-model color assignment (12 distinct colors)
const MODEL_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#d97706', // Orange
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#84cc16', // Lime
  '#f97316', // Orange-red
]

function getModelEdgeColor(modelIndex: number): string {
  return MODEL_COLORS[modelIndex % MODEL_COLORS.length]
}

const CanvasGraphRenderer: React.FC<{ data: GraphData | null; loading?: boolean }> = ({
  data,
  loading = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const nodesRef = useRef<NodeData[]>([])
  const edgesRef = useRef<EdgeData[]>([])
  const animationStateRef = useRef<AnimationState>({
    patientNodeAlpha: 0,
    edgesProgress: {},
    modelNodesAlpha: {},
    errorRangeNodesAlpha: {},
    outcomeNodesAlpha: {},
    dashOffset: 0,
    hoveredBranch: null,
  })
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null)

  // Timing constants (in milliseconds)
  const TIMINGS = {
    patientIn: 390,
    edgeDelay: 100,
    edgeDuration: 490,
    modelInDelay: 147,
    modelInDuration: 290,
    errorRangeEdgeDelay: 100,
    errorRangeEdgeDuration: 390,
    errorRangeInDelay: 100,
    errorRangeInDuration: 290,
    outcomeEdgeDelay: 100,
    outcomeEdgeDuration: 390,
    outcomeInDelay: 100,
    outcomeInDuration: 290,
  }

  // Calculate layout positions with strict 5-column horizontal pipeline
  const calculateLayout = useCallback((graphData: GraphData) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height

    // 5-column layout: Patient | Model | Error Range | CKD/NON-CKD
    // Reduced spacing between error range and outcome columns
    const columnX = {
      patient: width * 0.08,
      model: width * 0.28,
      errorRange: width * 0.52,
      outcome: width * 0.82, // Reduced from 0.90 to 0.82
    }

    const nodes: NodeData[] = []
    const edges: EdgeData[] = []

    const numModels = graphData.models.length

    // Vertical spacing: minimum 100px between rows, centered in canvas
    const minVerticalSpacing = 100
    const nodeRadiusMax = 45 // Patient node max
    const totalRequiredHeight = numModels * minVerticalSpacing + nodeRadiusMax * 2

    const paddingTop = Math.max(60, (height - totalRequiredHeight) / 2)
    const startY = paddingTop + nodeRadiusMax

    // Patient node - Column 1 (vertically centered, single node)
    const centerY = height / 2
    nodes.push({
      id: 'patient',
      type: 'patient',
      x: columnX.patient,
      y: centerY,
      radius: 50,
      label: `Patient\n${graphData.patientId}`,
      color: '#667eea',
    })

    // Track model connections to error ranges and outcomes
    const modelToErrorRange: Record<number, string> = {}
    const modelToOutcome: Record<number, string> = {}

    // First pass: Create all nodes and edges, tracking connections
    graphData.models.forEach((model, index) => {
      const modelY = startY + index * minVerticalSpacing

      // Model node - Column 2
      const modelId = `model-${index}`
      nodes.push({
        id: modelId,
        type: 'model',
        x: columnX.model,
        y: modelY,
        radius: 42,
        label: model.name,
        color: '#764ba2',
        modelIndex: index,
      })

      // Edge: Patient -> Model
      edges.push({
        from: 'patient',
        to: modelId,
        type: 'patient-model',
        progress: 0,
        color: getModelEdgeColor(index),
        modelIndex: index,
      })

      // Determine error range bucket and outcome for this model
      const errorRangeBucket = getErrorRangeBucket(model.error)
      const outcome = classifyOutcome(model.prediction)

      modelToErrorRange[index] = errorRangeBucket
      modelToOutcome[index] = outcome

      // Edge: Model -> Error Range (labeled with "Predicted eGFR = <value>")
      edges.push({
        from: modelId,
        to: errorRangeBucket,
        type: 'model-error-range',
        progress: 0,
        label: `Predicted eGFR = ${model.prediction.toFixed(1)}`,
        color: getModelEdgeColor(index),
        modelIndex: index,
        predictionValue: model.prediction,
      })

      // Edge: Error Range -> Outcome
      edges.push({
        from: errorRangeBucket,
        to: outcome,
        type: 'error-range-outcome',
        progress: 0,
        color: getModelEdgeColor(index),
        modelIndex: index,
      })
    })

    // Always create all 5 error range nodes (even if empty) - center-aligned as a group
    const allErrorRanges = ['error-range-0', 'error-range-1', 'error-range-2', 'error-range-3', 'error-range-4']
    const errorRangeCount = allErrorRanges.length
    const errorRangeTotalHeight = (errorRangeCount - 1) * minVerticalSpacing
    const errorRangeStartY = centerY - errorRangeTotalHeight / 2

    allErrorRanges.forEach((bucket, bucketIndex) => {
      const errorRangeY = errorRangeStartY + bucketIndex * minVerticalSpacing

      nodes.push({
        id: bucket,
        type: 'error-range',
        x: columnX.errorRange,
        y: errorRangeY,
        radius: 32,
        label: getErrorRangeLabel(bucket),
        color: getErrorRangeColor(bucket),
      })
    })

    // Always create both outcome nodes (even if empty) - center-aligned as a group
    const outcomes = ['CKD', 'NON-CKD']
    const outcomeCount = outcomes.length
    const outcomeTotalHeight = (outcomeCount - 1) * minVerticalSpacing
    const outcomeStartY = centerY - outcomeTotalHeight / 2

    outcomes.forEach((outcome, outcomeIndex) => {
      const outcomeY = outcomeStartY + outcomeIndex * minVerticalSpacing

      nodes.push({
        id: outcome,
        type: 'outcome',
        x: columnX.outcome,
        y: outcomeY,
        radius: 50,
        label: outcome,
        color: outcome === 'CKD' ? '#ef4444' : '#10b981',
      })
    })

    nodesRef.current = nodes
    edgesRef.current = edges

    // Initialize animation state
    animationStateRef.current = {
      patientNodeAlpha: 0,
      edgesProgress: {},
      modelNodesAlpha: {},
      errorRangeNodesAlpha: {},
      outcomeNodesAlpha: {},
      dashOffset: 0,
      hoveredBranch: null,
    }

    edges.forEach((edge) => {
      animationStateRef.current.edgesProgress[`${edge.from}-${edge.to}`] = 0
    })

    // Always initialize all error range nodes to 0 alpha
    allErrorRanges.forEach((bucket) => {
      animationStateRef.current.errorRangeNodesAlpha[bucket] = 0
    })

    // Always initialize both outcome nodes to 0 alpha
    outcomes.forEach((outcome) => {
      animationStateRef.current.outcomeNodesAlpha[outcome] = 0
    })

    // Initialize model nodes
    for (let i = 0; i < numModels; i++) {
      animationStateRef.current.modelNodesAlpha[`model-${i}`] = 0
    }
  }, [])

  // Update animation state over time
  const updateAnimation = useCallback((elapsed: number) => {
    const state = animationStateRef.current
    const canvas = canvasRef.current
    if (!canvas) return

    // Patient node animation (0-390ms)
    state.patientNodeAlpha = Math.min(elapsed / TIMINGS.patientIn, 1)

    const numModels = nodesRef.current.filter((n) => n.type === 'model').length
    const edges = edgesRef.current

    // Phase 1: Patient -> Models (all edges animate in parallel)
    const phase1StartTime = TIMINGS.patientIn + TIMINGS.edgeDelay
    const phase1EdgeDuration = TIMINGS.edgeDuration
    const phase1NodeDelay = TIMINGS.modelInDelay
    const phase1NodeDuration = TIMINGS.modelInDuration
    const phase1TotalDuration = phase1EdgeDuration + phase1NodeDelay + phase1NodeDuration

    for (let modelIndex = 0; modelIndex < numModels; modelIndex++) {
      const edgeElapsed = Math.max(0, elapsed - phase1StartTime)
      const edgeProgress = Math.min(edgeElapsed / phase1EdgeDuration, 1)
      state.edgesProgress[`patient-model-${modelIndex}`] = edgeProgress

      const nodeStartTime = phase1StartTime + phase1EdgeDuration + phase1NodeDelay
      const nodeElapsed = Math.max(0, elapsed - nodeStartTime)
      const nodeAlpha = Math.min(nodeElapsed / phase1NodeDuration, 1)
      state.modelNodesAlpha[`model-${modelIndex}`] = nodeAlpha
    }

    // Phase 2: Models -> Error Range (all edges animate in parallel)
    const phase2StartTime = phase1StartTime + phase1TotalDuration + TIMINGS.errorRangeEdgeDelay
    const phase2EdgeDuration = TIMINGS.errorRangeEdgeDuration
    const phase2NodeDelay = TIMINGS.errorRangeInDelay
    const phase2NodeDuration = TIMINGS.errorRangeInDuration
    const phase2TotalDuration = phase2EdgeDuration + phase2NodeDelay + phase2NodeDuration

    const edgeElapsed2 = Math.max(0, elapsed - phase2StartTime)
    const edgeProgress2 = Math.min(edgeElapsed2 / phase2EdgeDuration, 1)

    // Update all model -> error range edges
    edges.forEach((edge) => {
      if (edge.type === 'model-error-range') {
        state.edgesProgress[`${edge.from}-${edge.to}`] = edgeProgress2
      }
    })

    // Update all error range nodes with same alpha (always visible)
    const nodeStartTime2 = phase2StartTime + phase2EdgeDuration + phase2NodeDelay
    const nodeElapsed2 = Math.max(0, elapsed - nodeStartTime2)
    const nodeAlpha2 = Math.min(nodeElapsed2 / phase2NodeDuration, 1)

    const errorRangeNodes = nodesRef.current.filter((n) => n.type === 'error-range')
    errorRangeNodes.forEach((node) => {
      state.errorRangeNodesAlpha[node.id] = nodeAlpha2
    })

    // Phase 3: Error Range -> CKD/NON-CKD (all edges animate in parallel)
    const phase3StartTime = phase2StartTime + phase2TotalDuration + TIMINGS.outcomeEdgeDelay
    const phase3EdgeDuration = TIMINGS.outcomeEdgeDuration
    const phase3NodeDelay = TIMINGS.outcomeInDelay
    const phase3NodeDuration = TIMINGS.outcomeInDuration

    const edgeElapsed3 = Math.max(0, elapsed - phase3StartTime)
    const edgeProgress3 = Math.min(edgeElapsed3 / phase3EdgeDuration, 1)

    // Update all error range -> outcome edges
    edges.forEach((edge) => {
      if (edge.type === 'error-range-outcome') {
        state.edgesProgress[`${edge.from}-${edge.to}`] = edgeProgress3
      }
    })

    // Update all outcome nodes with same alpha (always visible)
    const nodeStartTime3 = phase3StartTime + phase3EdgeDuration + phase3NodeDelay
    const nodeElapsed3 = Math.max(0, elapsed - nodeStartTime3)
    const nodeAlpha3 = Math.min(nodeElapsed3 / phase3NodeDuration, 1)

    const outcomeNodes = nodesRef.current.filter((n) => n.type === 'outcome')
    outcomeNodes.forEach((node) => {
      state.outcomeNodesAlpha[node.id] = nodeAlpha3
    })

    // Continuous dash offset for animated dotted lines (always moving)
    state.dashOffset = (state.dashOffset + 2) % 20
  }, [])

  const drawEdgeLabel = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      label: string,
      fromNode: NodeData,
      toNode: NodeData,
      edgeProgress: number,
      isBelow: boolean
    ) => {
      if (edgeProgress < 0.5) return

      const labelAlpha = Math.min((edgeProgress - 0.5) * 2, 1)
      if (labelAlpha <= 0) return

      const midX = (fromNode.x + toNode.x) / 2
      const midY = (fromNode.y + toNode.y) / 2

      ctx.save()
      ctx.globalAlpha = labelAlpha

      // Calculate edge angle for text rotation
      const dx = toNode.x - fromNode.x
      const dy = toNode.y - fromNode.y
      const angle = Math.atan2(dy, dx)

      // Keep text readable by not rotating > 90 degrees
      let rotationAngle = angle
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        rotationAngle = angle + Math.PI
      }

      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto"'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.fillStyle = '#667eea'

      // Offset perpendicular to edge for label placement
      const offsetDistance = 16
      const perpX = -Math.sin(angle)
      const perpY = Math.cos(angle)

      const labelX = midX + perpX * offsetDistance
      const labelY = midY + perpY * offsetDistance

      // Translate to label position, rotate, then draw
      ctx.translate(labelX, labelY)
      ctx.rotate(rotationAngle)
      ctx.fillText(label, 0, 0)

      ctx.restore()
    },
    []
  )

  // Draw functions
  const drawNode = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      node: NodeData,
      alpha: number,
      isHovered: boolean
    ) => {
      if (alpha <= 0) return

      const scale = alpha
      const radius = node.radius * scale
      const fontSize = node.type === 'outcome' ? 14 * scale : 12 * scale

      ctx.save()
      ctx.globalAlpha = alpha

      // Draw shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 2

      // Draw node circle
      ctx.fillStyle = isHovered
        ? adjustBrightness(node.color, 20)
        : node.color
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

      if (node.type === 'patient') {
        // Multi-line text for patient node
        const lines = node.label.split('\n')
        const lineCount = lines.length
        const offset = (lineCount - 1) / 2

        for (let i = 0; i < lineCount; i++) {
          const y = node.y + (i - offset) * 14 * scale
          ctx.fillText(lines[i], node.x, y)
        }
      } else if (node.type === 'error-range') {
        // Error range label on one line
        ctx.fillText(node.label, node.x, node.y)
      } else {
        // Other nodes
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

      // Compute deltas once
      const dx = endX - startX
      const dy = endY - startY
      const length = Math.sqrt(dx * dx + dy * dy)
      const currentLength = length * progress

      // Calculate current endpoint with direct linear interpolation
      const t = length > 0 ? currentLength / length : 0
      const currentX = startX + dx * t
      const currentY = startY + dy * t

      ctx.save()
      ctx.globalAlpha = progress

      // Draw dotted line with unique color per model
      const edgeColor = edge.color || '#cbd5e1'
      ctx.strokeStyle = isHovered ? adjustBrightness(edgeColor, 30) : edgeColor
      ctx.lineWidth = 2.5
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

    if (loading) {
      drawLoadingAnimation(ctx, elapsed)
    } else if (data && nodesRef.current.length > 0) {
      updateAnimation(elapsed)

      const state = animationStateRef.current
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const edgesProgress = state.edgesProgress
      const hoveredBranch = state.hoveredBranch

      // Create node lookup map
      const nodeMap = new Map<string, NodeData>()
      nodes.forEach((node) => nodeMap.set(node.id, node))

      // Draw edges (background layer)
      edges.forEach((edge) => {
        const fromNode = nodeMap.get(edge.from)
        const toNode = nodeMap.get(edge.to)
        if (fromNode && toNode) {
          const progress = edgesProgress[`${edge.from}-${edge.to}`] || 0
          const isBranchHovered = hoveredBranch === `branch-${fromNode.modelIndex || 0}`
          drawEdge(ctx, edge, fromNode, toNode, progress, isBranchHovered)
        }
      })

      // Draw edge labels (middle layer - after edges, before nodes)
      const numModels = nodes.filter((n) => n.type === 'model').length
      for (let modelIndex = 0; modelIndex < numModels; modelIndex++) {
        const modelNode = nodeMap.get(`model-${modelIndex}`)
        if (modelNode && modelNode.modelIndex !== undefined) {
          // Find the error range node this model connects to
          const modelEdges = edges.filter((e) => e.from === `model-${modelIndex}` && e.type === 'model-error-range')
          modelEdges.forEach((edge) => {
            const errorRangeNode = nodeMap.get(edge.to)
            if (errorRangeNode && edge.label) {
              const edgeProgress = edgesProgress[`${edge.from}-${edge.to}`] || 0
              drawEdgeLabel(ctx, edge.label, modelNode, errorRangeNode, edgeProgress, false)
            }
          })
        }
      }

      // Draw nodes (foreground layer)
      const patientAlpha = state.patientNodeAlpha
      const modelAlphas = state.modelNodesAlpha
      const errorRangeAlphas = state.errorRangeNodesAlpha
      const outcomeAlphas = state.outcomeNodesAlpha

      nodes.forEach((node) => {
        let alpha = 0

        switch (node.type) {
          case 'patient':
            alpha = patientAlpha
            break
          case 'model':
            alpha = modelAlphas[node.id] || 0
            break
          case 'error-range':
            alpha = errorRangeAlphas[node.id] || 0
            break
          case 'outcome':
            alpha = outcomeAlphas[node.id] || 0
            break
        }

        if (alpha > 0) {
          const isBranchHovered =
            hoveredBranch === `branch-${node.modelIndex || 0}` ||
            hoveredBranch === `branch-patient`
          drawNode(ctx, node, alpha, isBranchHovered)
        }
      })
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [data, loading, drawNode, drawEdge, drawEdgeLabel, updateAnimation, drawLoadingAnimation])

  // Handle canvas mouse events for hover detection
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      let hoveredBranchId: string | null = null
      const state = animationStateRef.current

      // Check which node is under cursor
      for (let i = 0; i < nodesRef.current.length; i++) {
        const node = nodesRef.current[i]

        // Get node alpha to check if visible
        let alpha = 0
        switch (node.type) {
          case 'patient':
            alpha = state.patientNodeAlpha
            break
          case 'model':
            alpha = state.modelNodesAlpha[node.id] || 0
            break
          case 'error-range':
            alpha = state.errorRangeNodesAlpha[node.id] || 0
            break
          case 'outcome':
            alpha = state.outcomeNodesAlpha[node.id] || 0
            break
        }

        if (alpha > 0.1) {
          // Use squared distance to avoid sqrt
          const dx = x - node.x
          const dy = y - node.y
          const distSquared = dx * dx + dy * dy
          const radiusSquared = node.radius * node.radius

          if (distSquared <= radiusSquared) {
            hoveredBranchId =
              node.type === 'patient' ? `branch-patient` : `branch-${node.modelIndex || 0}`
            break
          }
        }
      }

      if (animationStateRef.current.hoveredBranch !== hoveredBranchId) {
        animationStateRef.current.hoveredBranch = hoveredBranchId
        setHoveredBranch(hoveredBranchId)
      }

      canvas.style.cursor = hoveredBranchId ? 'pointer' : 'default'
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    animationStateRef.current.hoveredBranch = null
    setHoveredBranch(null)
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.cursor = 'default'
    }
  }, [])

  // Handle canvas resize with dynamic sizing based on model count
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const updateCanvasSize = () => {
      let numModels = 1
      if (data?.models) {
        numModels = Math.max(1, data.models.length)
      }

      const viewportWidth = window.innerWidth
      const displayWidth = Math.max(1200, Math.min(viewportWidth - 80, 1500))

      const minVerticalSpacing = 100
      const labelPadding = 60
      const displayHeight = Math.max(400, numModels * minVerticalSpacing + labelPadding)

      canvas.width = displayWidth
      canvas.height = displayHeight

      canvas.style.width = `${displayWidth}px`
      canvas.style.height = `${displayHeight}px`

      if (data) {
        calculateLayout(data)
      }
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
    }
  }, [data, calculateLayout])

  // Initialize and start animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (data && !loading) {
      calculateLayout(data)
      startTimeRef.current = 0
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [data, loading, calculateLayout, animate])

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.03) 100%)',
        borderRadius: '16px',
        padding: '1px',
        display: 'flex',
        justifyContent: 'center',
        minWidth: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          border: '1px solid rgba(102, 126, 234, 0.2)',
          borderRadius: '16px',
          display: 'block',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 249, 250, 0.98) 100%)',
        }}
      />
    </div>
  )
}

// Helper function to adjust color brightness
function adjustBrightness(color: string, amount: number): string {
  const usePound = color[0] === '#'
  const col = usePound ? color.slice(1) : color
  const num = parseInt(col, 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0x00ff) + amount)
  const b = Math.min(255, (num & 0x0000ff) + amount)
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`
}

export default CanvasGraphRenderer
