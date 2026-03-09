import React, { useEffect, useRef, useCallback } from 'react';

interface UserGraphRendererProps {
  patientId: string;
  classifier1: {
    label: string;
    probability: number;
  };
  randomForest: {
    label: string;
    probability: number;
    model_used: string;
  };
}

interface NodeData {
  id: string;
  type: 'patient' | 'classifier1' | 'randomforest' | 'outcome';
  x: number;
  y: number;
  radius: number;
  label: string;
  color: string;
  probability?: number;
}

interface EdgeData {
  from: string;
  to: string;
  type: 'patient-classifier1' | 'classifier1-outcome' | 'patient-rf' | 'rf-outcome';
  progress: number;
  label?: string;
  color?: string;
}

interface AnimationState {
  patientNodeAlpha: number;
  edgesProgress: Record<string, number>;
  classifier1NodeAlpha: number;
  rfNodeAlpha: number;
  outcomeNodesAlpha: Record<string, number>;
  dashOffset: number;
}

const UserGraphRenderer: React.FC<UserGraphRendererProps> = ({
  patientId,
  classifier1,
  randomForest,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const nodesRef = useRef<NodeData[]>([]);
  const edgesRef = useRef<EdgeData[]>([]);
  const animationStateRef = useRef<AnimationState>({
    patientNodeAlpha: 0,
    edgesProgress: {},
    classifier1NodeAlpha: 0,
    rfNodeAlpha: 0,
    outcomeNodesAlpha: {},
    dashOffset: 0,
  });

  const TIMINGS = {
    patientIn: 400,
    edgeDuration: 500,
    nodeDuration: 300,
    outcomeEdgeDuration: 400,
    outcomeNodeDuration: 300,
  };

  const calculateLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;

    // Define Grid Columns
    const colX = {
      patient: width * 0.12,
      models: width * 0.42,
      outcomes: width * 0.80,
    };

    const nodes: NodeData[] = [];
    const edges: EdgeData[] = [];

    // Total rows: Classifier 1 + Random Forest
    const totalRows = 2;
    const rowStep = height / (totalRows + 1);

    // 1. Patient Node (Root) — vertically centered
    const patientY = height * 0.5;
    nodes.push({
      id: 'patient',
      type: 'patient',
      x: colX.patient,
      y: patientY,
      radius: 55,
      label: `Patient\n${patientId}`,
      color: '#2d3748',
    });

    // --- ROW 1: Classifier 1 ---
    const c1Y = rowStep * 1;
    nodes.push({
      id: 'classifier1',
      type: 'classifier1',
      x: colX.models,
      y: c1Y,
      radius: 50,
      label: 'Classifier 1\n(Clinical + Img)',
      color: '#e53e3e',
    });
    edges.push({
      from: 'patient',
      to: 'classifier1',
      type: 'patient-classifier1',
      progress: 0,
      color: '#e53e3e',
    });

    const c1Confidence = classifier1.probability < 50 ? 100 - classifier1.probability : classifier1.probability;
    const c1IsCKD = classifier1.label?.toLowerCase() === 'ckd';
    nodes.push({
      id: 'c1-outcome',
      type: 'outcome',
      x: colX.outcomes,
      y: c1Y,
      radius: 45,
      label: `${classifier1.label}\n${c1Confidence.toFixed(1)}%`,
      color: c1IsCKD ? '#c53030' : '#2f855a',
      probability: classifier1.probability,
    });
    edges.push({
      from: 'classifier1',
      to: 'c1-outcome',
      type: 'classifier1-outcome',
      progress: 0,
      color: '#e53e3e',
    });

    // --- ROW 2: Random Forest ---
    const rfY = rowStep * 2;
    const rfIsCKD = randomForest.label?.toLowerCase() === 'ckd';
    const rfModelLabel = 'Clinical Features';

    nodes.push({
      id: 'randomforest',
      type: 'randomforest',
      x: colX.models,
      y: rfY,
      radius: 50,
      label: `Random Forest\n(${rfModelLabel})`,
      color: '#3b82f6',
    });
    edges.push({
      from: 'patient',
      to: 'randomforest',
      type: 'patient-rf',
      progress: 0,
      color: '#3b82f6',
    });

    nodes.push({
      id: 'rf-outcome',
      type: 'outcome',
      x: colX.outcomes,
      y: rfY,
      radius: 45,
      label: `${randomForest.label}\n${randomForest.probability.toFixed(1)}%`,
      color: rfIsCKD ? '#c53030' : '#2f855a',
      probability: randomForest.probability,
    });
    edges.push({
      from: 'randomforest',
      to: 'rf-outcome',
      type: 'rf-outcome',
      progress: 0,
      color: '#3b82f6',
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // Reset animation state
    const newState: AnimationState = {
      patientNodeAlpha: 0,
      edgesProgress: {},
      classifier1NodeAlpha: 0,
      rfNodeAlpha: 0,
      outcomeNodesAlpha: {},
      dashOffset: 0,
    };

    edges.forEach((e) => (newState.edgesProgress[`${e.from}-${e.to}`] = 0));
    nodes.forEach((n) => {
      if (n.type === 'outcome') newState.outcomeNodesAlpha[n.id] = 0;
    });

    animationStateRef.current = newState;
  }, [patientId, classifier1, randomForest]);

  const updateAnimation = useCallback(
    (elapsed: number) => {
      const s = animationStateRef.current;
      const timings = TIMINGS;

      s.patientNodeAlpha = Math.min(elapsed / timings.patientIn, 1);

      // C1 timings
      const c1Start = timings.patientIn;
      s.edgesProgress['patient-classifier1'] = Math.min(Math.max(0, elapsed - c1Start) / timings.edgeDuration, 1);
      const c1NodeStart = c1Start + timings.edgeDuration;
      s.classifier1NodeAlpha = Math.min(Math.max(0, elapsed - c1NodeStart) / timings.nodeDuration, 1);
      const c1OutStart = c1NodeStart + timings.nodeDuration;
      s.edgesProgress['classifier1-c1-outcome'] = Math.min(Math.max(0, elapsed - c1OutStart) / timings.outcomeEdgeDuration, 1);
      s.outcomeNodesAlpha['c1-outcome'] = Math.min(Math.max(0, elapsed - (c1OutStart + timings.outcomeEdgeDuration)) / timings.outcomeNodeDuration, 1);

      // RF timings (starts slightly after C1)
      const rfStart = timings.patientIn + 150;
      s.edgesProgress['patient-randomforest'] = Math.min(Math.max(0, elapsed - rfStart) / timings.edgeDuration, 1);
      const rfNodeStart = rfStart + timings.edgeDuration;
      s.rfNodeAlpha = Math.min(Math.max(0, elapsed - rfNodeStart) / timings.nodeDuration, 1);
      const rfOutStart = rfNodeStart + timings.nodeDuration;
      s.edgesProgress['randomforest-rf-outcome'] = Math.min(Math.max(0, elapsed - rfOutStart) / timings.outcomeEdgeDuration, 1);
      s.outcomeNodesAlpha['rf-outcome'] = Math.min(Math.max(0, elapsed - (rfOutStart + timings.outcomeEdgeDuration)) / timings.outcomeNodeDuration, 1);

      s.dashOffset = (s.dashOffset + 1) % 20;
    },
    []
  );

  // Drawing Helpers
  const drawNode = (
    ctx: CanvasRenderingContext2D,
    node: NodeData,
    alpha: number
  ) => {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    // Fill
    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = node.label.split('\n');
    const fontSize =
      node.type === 'outcome' || node.type === 'patient' ? 13 : 11;
    ctx.font = `bold ${fontSize}px sans-serif`;

    const lineHeight = fontSize * 1.2;
    const blockHeight = lines.length * lineHeight;
    let startY = node.y - blockHeight / 2 + lineHeight / 2;

    lines.forEach((line, idx) => {
      ctx.fillText(line, node.x, startY + idx * lineHeight);
    });

    ctx.restore();
  };

  const drawEdge = (
    ctx: CanvasRenderingContext2D,
    edge: EdgeData,
    from: NodeData,
    to: NodeData,
    progress: number
  ) => {
    if (progress <= 0.01) return;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const currDist = dist * progress;

    const tx = from.x + (dx / dist) * currDist;
    const ty = from.y + (dy / dist) * currDist;

    ctx.save();
    ctx.strokeStyle = edge.color || '#ccc';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -animationStateRef.current.dashOffset;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();

    // Draw Label
    if (edge.label && progress > 0.8) {
      ctx.save();
      ctx.globalAlpha = (progress - 0.8) * 5;
      ctx.fillStyle = '#4a5568';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';

      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;

      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        angle += Math.PI;
      }

      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.fillText(edge.label, 0, -10);
      ctx.restore();
    }
  };

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (startTimeRef.current === 0) startTimeRef.current = performance.now();
    const elapsed = performance.now() - startTimeRef.current;

    updateAnimation(elapsed);

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const s = animationStateRef.current;

    // Draw Edges First
    edgesRef.current.forEach((edge) => {
      const from = nodesRef.current.find((n) => n.id === edge.from);
      const to = nodesRef.current.find((n) => n.id === edge.to);
      if (from && to) {
        const p = s.edgesProgress[`${edge.from}-${edge.to}`];
        drawEdge(ctx, edge, from, to, p || 0);
      }
    });

    // Draw Nodes
    nodesRef.current.forEach((node) => {
      let alpha = 0;
      if (node.type === 'patient') alpha = s.patientNodeAlpha;
      else if (node.type === 'classifier1') alpha = s.classifier1NodeAlpha;
      else if (node.type === 'randomforest') alpha = s.rfNodeAlpha;
      else if (node.type === 'outcome') alpha = s.outcomeNodesAlpha[node.id];

      drawNode(ctx, node, alpha || 0);
    });

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [updateAnimation]);

  // Start Animation Loop
  useEffect(() => {
    if (nodesRef.current.length === 0) calculateLayout();
    startTimeRef.current = 0;
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [animate, calculateLayout]);

  // Resize Handler
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const { parentElement } = canvasRef.current;
        if (parentElement) {
          canvasRef.current.width = parentElement.clientWidth;
          const height = Math.max(350, 400);
          canvasRef.current.height = height;
          calculateLayout();
        }
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial sizing
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateLayout]);

  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        background: '#f7fafc',
        borderRadius: '12px',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
};

export default UserGraphRenderer;
