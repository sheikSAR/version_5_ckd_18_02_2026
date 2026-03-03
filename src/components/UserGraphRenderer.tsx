import React, { useEffect, useRef, useCallback } from 'react';

interface UserGraphRendererProps {
  patientId: string;
  predictions: Record<string, number>;
  classifier1: {
    label: string;
    probability: number;
  };
  classifier2?: Record<string, { label: string; probability: number }>;
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
  | 'regressor-outcome'
  | 'classifier1-outcome'
  | 'patient-classifier1'
  | 'regressor-classifier2'
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
  classifier2,
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
    outcomeEdgeDuration: 400,
    outcomeNodeDuration: 300,
  };

  const calculateLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;

    // Define Grid Columns
    const colX = {
      patient: width * 0.06,
      level1_reg: width * 0.25,
      level1_c2: width * 0.45,
      level2_reg: width * 0.65,
      level2_c2: width * 0.82,
      outcomes: width * 0.95,
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
      radius: 55,
      label: `Patient\n${patientId}`,
      color: '#2d3748',
    });

    const modelKeys = Object.keys(predictions);
    const treeKey = modelKeys.find((k) => k.toLowerCase() === 'tree');
    const level2Keys = modelKeys.filter((k) => k.toLowerCase() !== 'tree');

    const hasTreeC2 = treeKey && classifier2 && classifier2[treeKey];
    const totalRows = 1 + (treeKey ? (hasTreeC2 ? 2 : 1) : 0) + level2Keys.length;
    const rowStep = height / (totalRows + 1);

    let currentRow = 1;

    // --- ROW 1: Classifier 1 ---
    const c1Y = rowStep * currentRow++;
    nodes.push({
      id: 'classifier1',
      type: 'classifier1',
      x: colX.level1_reg,
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
      label: 'Clinical + Images',
      color: '#e53e3e',
    });

    const c1Confidence = classifier1.probability < 50 ? 100 - classifier1.probability : classifier1.probability;
    nodes.push({
      id: 'c1-outcome',
      type: 'outcome',
      x: colX.outcomes,
      y: c1Y,
      radius: 45,
      label: `${classifier1.label}\n${c1Confidence.toFixed(1)}%`,
      color: classifier1.label === 'CKD' ? '#c53030' : '#2f855a',
      probability: classifier1.probability,
    });
    edges.push({
      from: 'classifier1',
      to: 'c1-outcome',
      type: 'classifier1-outcome',
      progress: 0,
      color: '#e53e3e',
    });

    let treeRegId = '';
    let treeC2Id = '';

    // --- ROW 2 & 3: Tree Regressor and Classifier 2 (Tree) ---
    if (treeKey) {
      const treeY = rowStep * currentRow++;
      treeRegId = `regressor-tree`;
      const treePrediction = predictions[treeKey] || 0;

      nodes.push({
        id: treeRegId,
        type: 'regressor',
        x: colX.level1_reg,
        y: treeY,
        radius: 45,
        label: `Level 1 Tree\nReg`,
        value: treePrediction,
        color: '#10b981',
      });
      edges.push({
        from: 'patient',
        to: treeRegId,
        type: 'patient-regressor',
        progress: 0,
        color: '#10b981',
      });

      const isCKD = treePrediction < 60;
      nodes.push({
        id: `reg-outcome-tree`,
        type: 'outcome',
        x: colX.outcomes,
        y: treeY,
        radius: 38,
        label: `${isCKD ? 'CKD' : 'NON-CKD'}\neGFR: ${treePrediction}`,
        color: isCKD ? '#c53030' : '#2f855a',
      });
      edges.push({
        from: treeRegId,
        to: `reg-outcome-tree`,
        type: 'regressor-outcome',
        progress: 0,
        label: `predict eGFR: ${treePrediction}`,
        color: '#10b981',
      });

      if (hasTreeC2) {
        const treeC2Y = rowStep * currentRow++;
        const c2Result = classifier2![treeKey];
        treeC2Id = `classifier2-tree`;

        nodes.push({
          id: treeC2Id,
          type: 'classifier2',
          x: colX.level1_c2,
          y: treeC2Y,
          radius: 45,
          label: `Level 1 C2\n(Tree label)`,
          color: '#d69e2e',
        });
        edges.push({
          from: treeRegId,
          to: treeC2Id,
          type: 'regressor-classifier2',
          progress: 0,
          label: `eGFR: ${treePrediction}`,
          color: '#d69e2e',
        });

        const c2Confidence = c2Result.probability < 50 ? 100 - c2Result.probability : c2Result.probability;
        nodes.push({
          id: `c2-outcome-tree`,
          type: 'outcome',
          x: colX.outcomes,
          y: treeC2Y,
          radius: 38,
          label: `${c2Result.label}\n${c2Confidence.toFixed(1)}%`,
          color: c2Result.label === 'CKD' ? '#c53030' : '#2f855a',
        });
        edges.push({
          from: treeC2Id,
          to: `c2-outcome-tree`,
          type: 'classifier2-outcome',
          progress: 0,
          color: '#d69e2e',
        });
      }
    }

    // --- ROWS 4..N: Level 2 Regressors ---
    level2Keys.forEach((modelName, idx) => {
      const i = idx + 1; // Use color shifting from 1 to avoid overlap with Tree
      const color = getModelEdgeColor(i);
      const l2Y = rowStep * currentRow++;

      const regressorId = `regressor-${modelName}`;
      const regPrediction = predictions[modelName] || 0;

      nodes.push({
        id: regressorId,
        type: 'regressor',
        x: colX.level2_reg,
        y: l2Y,
        radius: 40,
        label: `L2 ${modelName}`,
        value: regPrediction,
        color: color,
        modelIndex: i,
      });

      // Show edge from Tree Regressor if exists
      if (treeRegId) {
        edges.push({
          from: treeRegId,
          to: regressorId,
          type: 'patient-regressor',
          progress: 0,
          label: `eGFR`,
          color: color,
        });
      }

      // Show edge from C2 Tree if exists
      if (treeC2Id) {
        edges.push({
          from: treeC2Id,
          to: regressorId,
          type: 'patient-regressor',
          progress: 0,
          label: `label`,
          color: color,
        });
      }

      // If no tree model present, default connect to patient
      if (!treeRegId && !treeC2Id) {
        edges.push({
          from: 'patient',
          to: regressorId,
          type: 'patient-regressor',
          progress: 0,
          color: color,
        });
      }

      // Level 2 C2 Node -> Outcome
      const hasC2 = classifier2 && classifier2[modelName];
      if (hasC2) {
        const c2Result = classifier2[modelName];
        const c2Id = `classifier2-${modelName}`;

        nodes.push({
          id: c2Id,
          type: 'classifier2',
          x: colX.level2_c2,
          y: l2Y,
          radius: 38,
          label: `C2\n(${modelName})`,
          color: color, // Inherit color of its level 2 model
        });

        edges.push({
          from: regressorId,
          to: c2Id,
          type: 'regressor-classifier2',
          progress: 0,
          label: `eGFR: ${regPrediction}`,
          color: color,
        });

        const outId = `c2-outcome-${modelName}`;
        const c2Confidence = c2Result.probability < 50 ? 100 - c2Result.probability : c2Result.probability;
        nodes.push({
          id: outId,
          type: 'outcome',
          x: colX.outcomes,
          y: l2Y,
          radius: 35,
          label: `${c2Result.label}\n${c2Confidence.toFixed(1)}%`,
          color: c2Result.label === 'CKD' ? '#c53030' : '#2f855a',
        });

        edges.push({
          from: c2Id,
          to: outId,
          type: 'classifier2-outcome',
          progress: 0,
          color: color,
        });
      }
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

    edges.forEach((e) => (newState.edgesProgress[`${e.from}-${e.to}`] = 0));
    nodes.forEach((n) => {
      if (n.type === 'regressor') newState.regressorNodesAlpha[n.id] = 0;
      if (n.type === 'classifier2') newState.classifier2NodesAlpha[n.id] = 0;
      if (n.type === 'outcome') newState.outcomeNodesAlpha[n.id] = 0;
    });

    animationStateRef.current = newState;
  }, [patientId, predictions, classifier1, classifier2]);

  const updateAnimation = useCallback(
    (elapsed: number) => {
      const s = animationStateRef.current;
      const timings = TIMINGS;

      s.patientNodeAlpha = Math.min(elapsed / timings.patientIn, 1);

      // C1 timings
      const c1Start = timings.patientIn;
      s.edgesProgress['patient-classifier1'] = Math.min(Math.max(0, elapsed - c1Start) / 400, 1);
      const c1NodeStart = c1Start + 400;
      s.classifier1NodeAlpha = Math.min(Math.max(0, elapsed - c1NodeStart) / 300, 1);
      const c1OutStart = c1NodeStart + 300;
      s.edgesProgress['classifier1-c1-outcome'] = Math.min(Math.max(0, elapsed - c1OutStart) / 300, 1);
      s.outcomeNodesAlpha['c1-outcome'] = Math.min(Math.max(0, elapsed - (c1OutStart + 300)) / 300, 1);

      // Tree Level 1 timings
      const l1Start = timings.patientIn + 100;
      s.edgesProgress['patient-regressor-tree'] = Math.min(Math.max(0, elapsed - l1Start) / 400, 1);
      const l1NodeStart = l1Start + 400;
      s.regressorNodesAlpha['regressor-tree'] = Math.min(Math.max(0, elapsed - l1NodeStart) / 300, 1);

      const l1OutStart = l1NodeStart + 300;
      s.edgesProgress['regressor-tree-reg-outcome-tree'] = Math.min(Math.max(0, elapsed - l1OutStart) / 300, 1);
      s.outcomeNodesAlpha['reg-outcome-tree'] = Math.min(Math.max(0, elapsed - (l1OutStart + 300)) / 300, 1);

      // Tree C2 timings
      const c2TreeStart = l1NodeStart + 300;
      s.edgesProgress['regressor-tree-classifier2-tree'] = Math.min(Math.max(0, elapsed - c2TreeStart) / 400, 1);
      const c2TreeNodeStart = c2TreeStart + 400;
      s.classifier2NodesAlpha['classifier2-tree'] = Math.min(Math.max(0, elapsed - c2TreeNodeStart) / 300, 1);

      const c2TreeOutStart = c2TreeNodeStart + 300;
      s.edgesProgress['classifier2-tree-c2-outcome-tree'] = Math.min(Math.max(0, elapsed - c2TreeOutStart) / 300, 1);
      s.outcomeNodesAlpha['c2-outcome-tree'] = Math.min(Math.max(0, elapsed - (c2TreeOutStart + 300)) / 300, 1);

      // Level 2 Regressors timings
      // They fire after the C2 Tree is ready
      const l2Start = c2TreeNodeStart + 100;

      Object.keys(predictions).forEach((modelName) => {
        if (modelName.toLowerCase() === 'tree') return;
        const regId = `regressor-${modelName}`;

        // Input edges to Level 2
        s.edgesProgress[`regressor-tree-${regId}`] = Math.min(Math.max(0, elapsed - l2Start) / 400, 1);
        s.edgesProgress[`classifier2-tree-${regId}`] = Math.min(Math.max(0, elapsed - l2Start) / 400, 1);
        s.edgesProgress[`patient-${regId}`] = Math.min(Math.max(0, elapsed - l2Start) / 400, 1); // fallback

        const l2NodeStart = l2Start + 400;
        s.regressorNodesAlpha[regId] = Math.min(Math.max(0, elapsed - l2NodeStart) / 300, 1);

        const hasC2 = classifier2 && classifier2[modelName];
        if (hasC2) {
          const c2Id = `classifier2-${modelName}`;
          const outId = `c2-outcome-${modelName}`;

          const l2c2Start = l2NodeStart + 300;
          s.edgesProgress[`${regId}-${c2Id}`] = Math.min(Math.max(0, elapsed - l2c2Start) / 300, 1);

          const l2c2NodeStart = l2c2Start + 300;
          s.classifier2NodesAlpha[c2Id] = Math.min(Math.max(0, elapsed - l2c2NodeStart) / 300, 1);

          const l2OutStart = l2c2NodeStart + 300;
          s.edgesProgress[`${c2Id}-${outId}`] = Math.min(Math.max(0, elapsed - l2OutStart) / 300, 1);

          s.outcomeNodesAlpha[outId] = Math.min(Math.max(0, elapsed - (l2OutStart + 300)) / 300, 1);
        }
      });

      s.dashOffset = (s.dashOffset + 1) % 20;
    },
    [predictions, classifier2]
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

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;

      // Calculate angle
      let angle = Math.atan2(dy, dx);
      // Keep text upright
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        angle += Math.PI;
      }

      ctx.translate(mx, my);

      // Move it along the line if it is patient-classifier1 to avoid node overlapping
      if (edge.type === 'patient-classifier1') {
        ctx.translate(dx * 0.25, dy * 0.25);
      }

      ctx.rotate(angle);

      // Offset label slightly above the line
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
      else if (node.type === 'classifier2') alpha = s.classifier2NodesAlpha[node.id];
      else if (node.type === 'regressor')
        alpha = s.regressorNodesAlpha[node.id];
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
