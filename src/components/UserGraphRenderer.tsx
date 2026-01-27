import React, { useEffect, useRef, useCallback } from 'react';

interface UserGraphRendererProps {
  patientId: string;
  predictions: Record<string, number>;
  classifier1: {
    label: string;
    probability: number;
  };
  classifier2Outputs: Record<string, { label: string; probability: number }>;
}

interface NodeData {
  id: string;
  type: 'patient' | 'regressor' | 'classifier1' | 'classifier2' | 'outcome';
  x: number;
  y: number;
  radius: number;
  label: string;
  value?: number;
  color: string;
  modelIndex?: number;
  probability?: number; // For outcome nodes to show prob
}

interface EdgeData {
  from: string;
  to: string;
  type:
  | 'patient-regressor'
  | 'regressor-classifier2'
  | 'classifier1-outcome'
  | 'patient-classifier1'
  | 'classifier2-outcome';
  progress: number;
  label?: string;
  color?: string;
  modelIndex?: number;
  predictionValue?: number;
}

interface AnimationState {
  patientNodeAlpha: number;
  edgesProgress: Record<string, number>;
  regressorNodesAlpha: Record<string, number>;
  classifier1NodeAlpha: number;
  classifier2NodesAlpha: Record<string, number>;
  outcomeNodesAlpha: Record<string, number>;
  dashOffset: number;
}

const MODEL_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#d97706',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#f97316',
];

function getModelEdgeColor(modelIndex: number): string {
  return MODEL_COLORS[modelIndex % MODEL_COLORS.length];
}

const UserGraphRenderer: React.FC<UserGraphRendererProps> = ({
  patientId,
  predictions,
  classifier1,
  classifier2Outputs,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const nodesRef = useRef<NodeData[]>([]);
  const edgesRef = useRef<EdgeData[]>([]);
  const animationStateRef = useRef<AnimationState>({
    patientNodeAlpha: 0,
    edgesProgress: {},
    regressorNodesAlpha: {},
    classifier1NodeAlpha: 0,
    classifier2NodesAlpha: {},
    outcomeNodesAlpha: {},
    dashOffset: 0,
  });

  const TIMINGS = {
    patientIn: 400,
    regressorBranchDelay: 100,
    regressorEdgeDuration: 500,
    regressorNodeDuration: 300,
    classifier1Delay: 100, // Branch 2 starts slightly after
    classifier1EdgeDuration: 600,
    classifier1NodeDuration: 300,
    classifier2EdgeDuration: 400,
    classifier2NodeDuration: 300,
    outcomeEdgeDuration: 400,
    outcomeNodeDuration: 300,
  };

  const calculateLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;

    // Define Grid Columns
    const colX = {
      patient: width * 0.08,
      regressors: width * 0.35,
      classifiers: width * 0.65,
      outcomes: width * 0.9,
    };

    const nodes: NodeData[] = [];
    const edges: EdgeData[] = [];

    // 1. Patient Node (Root)
    const patientY = height * 0.5;
    nodes.push({
      id: 'patient',
      type: 'patient',
      x: colX.patient,
      y: patientY,
      radius: 45,
      label: `Patient\n${patientId}`,
      color: '#2d3748',
    });

    // 2. Classifier 1 Node (Clinical + Image) - Upper Branch
    // Positioned visually distinct from regressor flow
    const classifier1Y = height * 0.15;
    nodes.push({
      id: 'classifier1',
      type: 'classifier1',
      x: colX.classifiers,
      y: classifier1Y,
      radius: 40,
      label: 'Classifier 1\n(Clinical + Img)',
      color: '#e53e3e',
    });

    // Edge: Patient -> Classifier 1
    edges.push({
      from: 'patient',
      to: 'classifier1',
      type: 'patient-classifier1',
      progress: 0,
      label: 'Clinical + Images',
      color: '#e53e3e',
    });

    // Outcome for Classifier 1
    const c1OutcomeId = `c1-outcome`;
    nodes.push({
      id: c1OutcomeId,
      type: 'outcome',
      x: colX.outcomes,
      y: classifier1Y,
      radius: 35,
      label: `${classifier1.label}\n${classifier1.probability.toFixed(1)}%`,
      color: classifier1.label === 'CKD' ? '#c53030' : '#2f855a',
      probability: classifier1.probability,
    });
    edges.push({
      from: 'classifier1',
      to: c1OutcomeId,
      type: 'classifier1-outcome',
      progress: 0,
      color: '#e53e3e',
    });

    // 3. Regressor Nodes + Classifier 2 Flow - Lower Area
    const modelKeys = Object.keys(predictions);
    const numModels = modelKeys.length;

    // Calculate vertical space for regressors
    // Start below the Classifier 1 area
    const regressorStartY = height * 0.35;
    const regressorEndY = height * 0.95;
    const regressorStep =
      (regressorEndY - regressorStartY) / (numModels - 1 || 1);

    modelKeys.forEach((modelName, i) => {
      const y = regressorStartY + i * regressorStep;
      const color = getModelEdgeColor(i);

      // Regressor Node
      const regressorId = `regressor-${i}`;
      nodes.push({
        id: regressorId,
        type: 'regressor',
        x: colX.regressors,
        y: y,
        radius: 30,
        label: modelName,
        value: predictions[modelName],
        color: color,
        modelIndex: i,
      });

      // Edge: Patient -> Regressor
      edges.push({
        from: 'patient',
        to: regressorId,
        type: 'patient-regressor',
        progress: 0,
        color: color,
        modelIndex: i,
      });

      // Classifier 2 Node (Per Model) - "Decision Node"
      // Positioned in classifier column, aligned with regressor
      const c2Id = `classifier2-${i}`;
      const c2Output = classifier2Outputs[modelName];
      const probability = c2Output ? c2Output.probability : 0;

      nodes.push({
        id: c2Id,
        type: 'classifier2',
        x: colX.classifiers,
        y: y,
        radius: 30,
        label: 'Classifier 2\n(Decision)',
        color: '#d69e2e',
        modelIndex: i,
      });

      // Edge: Regressor -> Classifier 2
      edges.push({
        from: regressorId,
        to: c2Id,
        type: 'regressor-classifier2',
        progress: 0,
        label: `eGFR: ${predictions[modelName]}`,
        color: color,
        modelIndex: i,
      });

      // Outcome Node for Classifier 2
      const c2OutcomeId = `c2-outcome-${i}`;
      nodes.push({
        id: c2OutcomeId,
        type: 'outcome',
        x: colX.outcomes,
        y: y,
        radius: 28,
        label: `${c2Output?.label || '?'}\n${probability.toFixed(1)}%`,
        color: c2Output?.label === 'CKD' ? '#c53030' : '#2f855a',
        probability: probability,
        modelIndex: i,
      });

      // Edge: Classifier 2 -> Outcome
      edges.push({
        from: c2Id,
        to: c2OutcomeId,
        type: 'classifier2-outcome',
        progress: 0,
        color: color,
        modelIndex: i,
      });
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;

    // Reset animation state
    const newState: AnimationState = {
      patientNodeAlpha: 0,
      edgesProgress: {},
      regressorNodesAlpha: {},
      classifier1NodeAlpha: 0,
      classifier2NodesAlpha: {},
      outcomeNodesAlpha: {},
      dashOffset: 0,
    };

    // Initialize keys
    edges.forEach((e) => (newState.edgesProgress[`${e.from}-${e.to}`] = 0));
    nodes.forEach((n) => {
      if (n.type === 'regressor') newState.regressorNodesAlpha[n.id] = 0;
      if (n.type === 'classifier2') newState.classifier2NodesAlpha[n.id] = 0;
      if (n.type === 'outcome') newState.outcomeNodesAlpha[n.id] = 0;
    });

    animationStateRef.current = newState;
  }, [patientId, predictions, classifier1, classifier2Outputs]);

  const updateAnimation = useCallback(
    (elapsed: number) => {
      const s = animationStateRef.current;
      const timings = TIMINGS;
      const modelKeys = Object.keys(predictions);

      // 0. Patient Node
      s.patientNodeAlpha = Math.min(elapsed / timings.patientIn, 1);

      // Branch 1: Classifier 1 Flow
      const c1Start = timings.patientIn + timings.classifier1Delay;
      s.edgesProgress['patient-classifier1'] = Math.min(
        Math.max(0, elapsed - c1Start) / timings.classifier1EdgeDuration,
        1
      );

      const c1NodeStart = c1Start + timings.classifier1EdgeDuration;
      s.classifier1NodeAlpha = Math.min(
        Math.max(0, elapsed - c1NodeStart) / timings.classifier1NodeDuration,
        1
      );

      const c1OutcomeEdgeStart = c1NodeStart + timings.classifier1NodeDuration;
      // Assume we have an edge for it
      s.edgesProgress['classifier1-c1-outcome'] = Math.min(
        Math.max(0, elapsed - c1OutcomeEdgeStart) / timings.outcomeEdgeDuration,
        1
      );

      const c1OutcomeNodeStart =
        c1OutcomeEdgeStart + timings.outcomeEdgeDuration;
      s.outcomeNodesAlpha['c1-outcome'] = Math.min(
        Math.max(0, elapsed - c1OutcomeNodeStart) / timings.outcomeNodeDuration,
        1
      );

      // Branch 2: Regressors Flow
      const regStart = timings.patientIn + timings.regressorBranchDelay;

      modelKeys.forEach((_, i) => {
        const regId = `regressor-${i}`;
        const c2Id = `classifier2-${i}`;
        const outId = `c2-outcome-${i}`;

        // Patient -> Regressor
        s.edgesProgress[`patient-${regId}`] = Math.min(
          Math.max(0, elapsed - regStart) / timings.regressorEdgeDuration,
          1
        );

        // Regressor Node
        const regNodeStart = regStart + timings.regressorEdgeDuration;
        s.regressorNodesAlpha[regId] = Math.min(
          Math.max(0, elapsed - regNodeStart) / timings.regressorNodeDuration,
          1
        );

        // Regressor -> Classifier 2
        const c2EdgeStart = regNodeStart + timings.regressorNodeDuration;
        s.edgesProgress[`${regId}-${c2Id}`] = Math.min(
          Math.max(0, elapsed - c2EdgeStart) / timings.classifier2EdgeDuration,
          1
        );

        // Classifier 2 Node
        const c2NodeStart = c2EdgeStart + timings.classifier2EdgeDuration;
        s.classifier2NodesAlpha[c2Id] = Math.min(
          Math.max(0, elapsed - c2NodeStart) / timings.classifier2NodeDuration,
          1
        );

        // Classifier 2 -> Outcome
        const outEdgeStart = c2NodeStart + timings.classifier2NodeDuration;
        s.edgesProgress[`${c2Id}-${outId}`] = Math.min(
          Math.max(0, elapsed - outEdgeStart) / timings.outcomeEdgeDuration,
          1
        );

        // Outcome Node
        const outNodeStart = outEdgeStart + timings.outcomeEdgeDuration;
        s.outcomeNodesAlpha[outId] = Math.min(
          Math.max(0, elapsed - outNodeStart) / timings.outcomeNodeDuration,
          1
        );
      });

      s.dashOffset = (s.dashOffset + 1) % 20;
    },
    [predictions, TIMINGS]
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
    // Simple logic to center multiline text
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
    ctx.lineWidth = 2;
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
      // Offset label slightly
      ctx.fillText(edge.label, mx, my - 10);
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
      else if (node.type === 'regressor')
        alpha = s.regressorNodesAlpha[node.id];
      else if (node.type === 'classifier2')
        alpha = s.classifier2NodesAlpha[node.id];
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
          // Height calculation (dynamic based on Regressors)
          const numRegressors = Object.keys(predictions).length;
          const height = Math.max(600, numRegressors * 80 + 200);
          canvasRef.current.height = height;
          calculateLayout();
        }
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial sizing
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateLayout, predictions]);

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
