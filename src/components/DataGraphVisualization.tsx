import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import nodeData from '../data/node.json'
import { COLOR_PALETTES } from '../utils/colors'
import '../styles/DataGraphVisualization.css'

interface ContainerData {
  name: string
  nodes: string[]
  color: string
  bgColor: string
  headerColor: string
  nodeColor: string
  x: number
  y: number
  width: number
  height: number
}

interface NodeData {
  text: string
  x: number
  y: number
  width: number
  height: number
  containerIndex: number
  nodeIndex: number
}

// Constants
const CONTAINER_PADDING = 16
const CONTAINER_GAP = 20
const HEADER_HEIGHT = 44
const NODE_HEIGHT = 60  // Diameter for circular nodes
const NODE_RADIUS = NODE_HEIGHT / 2
const NODE_GAP = 6
const CONTAINER_WIDTH = NODE_HEIGHT + CONTAINER_PADDING * 2  // Dynamic width based on node size
const MIN_ZOOM = 0.3
const MAX_ZOOM = 2
const ZOOM_SENSITIVITY = 0.0008

interface Camera {
  x: number
  y: number
  zoom: number
}

const DataGraphVisualization: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number>()

  const [camera, setCamera] = useState<Camera>({ x: 40, y: 40, zoom: 1.4 })
  const [isPanning, setIsPanning] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<{ container: number; node: number } | null>(null)
  const [hoveredContainer, setHoveredContainer] = useState<number | null>(null)

  const containersRef = useRef<ContainerData[]>([])
  const nodesRef = useRef<NodeData[]>([])

  // Calculate container layouts
  const containerConfig = useMemo(() => {
    const containers: ContainerData[] = []
    const nodes: NodeData[] = []

    // Single row layout: arrange all containers horizontally
    let cumulativeX = 0
    Object.entries(nodeData).forEach((entry, index) => {
      const [containerName, nodeList] = entry as [string, string[]]
      const palette = COLOR_PALETTES[index % COLOR_PALETTES.length]

      const x = cumulativeX
      const y = 0

      const nodeCount = nodeList.length
      const containerHeight = HEADER_HEIGHT + CONTAINER_PADDING * 2 + nodeCount * NODE_HEIGHT + (nodeCount - 1) * NODE_GAP + 12

      containers.push({
        name: containerName,
        nodes: nodeList,
        color: palette.color,
        bgColor: palette.bgColor,
        headerColor: palette.headerColor,
        nodeColor: palette.nodeColor,
        x,
        y,
        width: CONTAINER_WIDTH,
        height: containerHeight
      })

      // Calculate node positions
      nodeList.forEach((nodeText, nodeIdx) => {
        nodes.push({
          text: nodeText,
          x: x + CONTAINER_PADDING + (CONTAINER_WIDTH - CONTAINER_PADDING * 2 - NODE_HEIGHT) / 2,
          y: y + HEADER_HEIGHT + CONTAINER_PADDING + nodeIdx * (NODE_HEIGHT + NODE_GAP),
          width: NODE_HEIGHT,
          height: NODE_HEIGHT,
          containerIndex: index,
          nodeIndex: nodeIdx
        })
      })

      // Move to next horizontal position
      cumulativeX += CONTAINER_WIDTH + CONTAINER_GAP
    })

    return { containers, nodes }
  }, [])

  useEffect(() => {
    containersRef.current = containerConfig.containers
    nodesRef.current = containerConfig.nodes
  }, [containerConfig])

  // Drawing function
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr

    // Clear and setup
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = '#f0f4f8'
    ctx.fillRect(0, 0, width, height)

    // Apply camera transform
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)

    // Calculate visible bounds
    const viewLeft = -camera.x / camera.zoom
    const viewTop = -camera.y / camera.zoom
    const viewRight = viewLeft + width / camera.zoom
    const viewBottom = viewTop + height / camera.zoom

    // Draw containers
    containersRef.current.forEach((container, containerIdx) => {
      // Culling
      if (container.x + container.width < viewLeft || container.x > viewRight ||
        container.y + container.height < viewTop || container.y > viewBottom) return

      const isHovered = hoveredContainer === containerIdx

      // Container shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
      ctx.shadowBlur = 12 / camera.zoom
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 3 / camera.zoom

      // Container background
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(container.x, container.y, container.width, container.height, 10)
      ctx.fill()

      // Reset shadow
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // Container border
      ctx.strokeStyle = isHovered ? container.headerColor : 'rgba(0, 0, 0, 0.06)'
      ctx.lineWidth = 1 / camera.zoom
      ctx.stroke()

      // Header
      ctx.fillStyle = container.headerColor
      ctx.beginPath()
      ctx.roundRect(container.x, container.y, container.width, HEADER_HEIGHT, [10, 10, 0, 0])
      ctx.fill()

      // Header text
      ctx.fillStyle = '#ffffff'
      ctx.font = `600 ${13 / camera.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'

      const headerText = container.name.replace(/_/g, ' ')
      ctx.fillText(
        headerText,
        container.x + 14,
        container.y + HEADER_HEIGHT / 2
      )

      // Node count badge
      const badgeText = `${container.nodes.length}`
      ctx.font = `600 ${11 / camera.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      const badgeMetrics = ctx.measureText(badgeText)
      const badgeWidth = badgeMetrics.width + 14
      const badgeX = container.x + container.width - badgeWidth - 10
      const badgeY = container.y + HEADER_HEIGHT / 2 - 9

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.beginPath()
      ctx.roundRect(badgeX, badgeY, badgeWidth, 18, 9)
      ctx.fill()

      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + 9)
    })

    // Draw nodes
    nodesRef.current.forEach((node) => {
      const container = containersRef.current[node.containerIndex]
      const radius = NODE_RADIUS

      // Culling
      if (node.x + node.width < viewLeft || node.x > viewRight ||
        node.y + node.height < viewTop || node.y > viewBottom) return

      const isHovered = hoveredNode?.container === node.containerIndex &&
        hoveredNode?.node === node.nodeIndex

      // Node shadow (subtle)
      if (isHovered) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
        ctx.shadowBlur = 8 / camera.zoom
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 2 / camera.zoom
      }

      // Node background circle
      ctx.fillStyle = isHovered ? container.nodeColor : container.bgColor
      ctx.beginPath()
      ctx.arc(node.x + radius, node.y + radius, radius, 0, Math.PI * 2)
      ctx.fill()

      // Reset shadow
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // Node border
      ctx.strokeStyle = isHovered ? container.nodeColor : 'rgba(0, 0, 0, 0.05)'
      ctx.lineWidth = (isHovered ? 1.5 : 0.5) / camera.zoom
      ctx.stroke()

      // Node text - centered in circle
      ctx.fillStyle = isHovered ? '#ffffff' : container.color
      ctx.font = `500 ${12 / camera.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Truncate text if needed - circle diameter minus padding
      const maxWidth = node.width - 12
      let displayText = node.text
      let textMetrics = ctx.measureText(displayText)

      if (textMetrics.width > maxWidth) {
        while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
          displayText = displayText.slice(0, -1)
        }
        displayText += '...'
      }

      ctx.fillText(displayText, node.x + radius, node.y + radius)
    })

  }, [camera, hoveredNode, hoveredContainer])

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

  // Canvas resize with DPI
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    handleResize()

    return () => resizeObserver.disconnect()
  }, [])

  // Interaction handlers
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
    setIsPanning(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getCanvasCoords(e)

    // Check container hover
    let foundContainer = null
    containersRef.current.forEach((container, idx) => {
      if (coords.x >= container.x && coords.x <= container.x + container.width &&
        coords.y >= container.y && coords.y <= container.y + container.height) {
        foundContainer = idx
      }
    })
    setHoveredContainer(foundContainer)

    // Check node hover (circle collision)
    let foundNode = null
    nodesRef.current.forEach((node) => {
      const radius = NODE_RADIUS
      const centerX = node.x + radius
      const centerY = node.y + radius
      const distSquared = (coords.x - centerX) ** 2 + (coords.y - centerY) ** 2

      if (distSquared <= radius ** 2) {
        foundNode = {
          container: node.containerIndex,
          node: node.nodeIndex
        }
      }
    })
    setHoveredNode(foundNode)

    if (isPanning) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }, [getCanvasCoords, isPanning, dragStart])

  const handleMouseUp = useCallback(() => {
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

    const delta = -e.deltaY * ZOOM_SENSITIVITY
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * (1 + delta)))

    const newX = mouseX - worldX * newZoom
    const newY = mouseY - worldY * newZoom

    setCamera({ x: newX, y: newY, zoom: newZoom })
  }, [camera])

  const resetCamera = () => {
    setCamera({ x: 40, y: 40, zoom: 1 })
  }

  const zoomIn = () => {
    setCamera(prev => ({ ...prev, zoom: Math.min(MAX_ZOOM, prev.zoom * 1.3) }))
  }

  const zoomOut = () => {
    setCamera(prev => ({ ...prev, zoom: Math.max(MIN_ZOOM, prev.zoom / 1.3) }))
  }

  return (
    <div className="data-graph-container">
      <div className="data-graph-header">
        <div className="data-graph-info">
          <strong>{containersRef.current.length}</strong> categories • <strong>{nodesRef.current.length}</strong> nodes
        </div>
        <div className="data-graph-controls">
          <button onClick={zoomOut} className="zoom-btn" title="Zoom Out">−</button>
          <button onClick={resetCamera} className="zoom-btn reset" title="Reset View">Reset</button>
          <button onClick={zoomIn} className="zoom-btn" title="Zoom In">+</button>
        </div>
      </div>

      <div ref={containerRef} className="data-graph-canvas-container">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            cursor: isPanning ? 'grabbing' : (hoveredNode || hoveredContainer !== null ? 'pointer' : 'grab')
          }}
        />
        <div className="zoom-indicator">{Math.round(camera.zoom * 100)}%</div>
      </div>
    </div>
  )
}

export default DataGraphVisualization
