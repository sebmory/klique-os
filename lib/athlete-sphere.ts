import type { PublicAthleteCard } from "@/lib/public-athletes";

export type AthleteSphereNode = {
  athlete: PublicAthleteCard;
  x: number;
  y: number;
  z: number;
};

export type AthleteSphereConnection = {
  from: number;
  to: number;
};

export type AthleteSphereModel = {
  nodes: AthleteSphereNode[];
  connections: AthleteSphereConnection[];
};

export type ProjectedAthleteSphereNode = AthleteSphereNode & {
  index: number;
  screenX: number;
  screenY: number;
  depth: number;
  radius: number;
  opacity: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const stableScore = (value: string): number => {
  let score = 2166136261;
  for (const character of value) {
    score ^= character.charCodeAt(0);
    score = Math.imul(score, 16777619);
  }
  return score >>> 0;
};

const squaredDistance = (left: AthleteSphereNode, right: AthleteSphereNode): number =>
  (left.x - right.x) ** 2
  + (left.y - right.y) ** 2
  + (left.z - right.z) ** 2;

const connectionKey = (from: number, to: number): string =>
  `${Math.min(from, to)}-${Math.max(from, to)}`;

const createSphereConnections = (
  nodes: readonly AthleteSphereNode[],
): AthleteSphereConnection[] => {
  const candidates = nodes.flatMap((node, from) =>
    nodes.slice(from + 1).map((candidate, offset) => ({
      from,
      to: from + offset + 1,
      distance: squaredDistance(node, candidate),
    })))
    .sort((left, right) =>
      left.distance - right.distance
      || left.from - right.from
      || left.to - right.to);
  const parents = nodes.map((_, index) => index);
  const degrees = nodes.map(() => 0);
  const connections = new Map<string, AthleteSphereConnection>();
  const findRoot = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root]!;
    while (parents[index] !== index) {
      const parent = parents[index]!;
      parents[index] = root;
      index = parent;
    }
    return root;
  };
  const addConnection = ({ from, to }: AthleteSphereConnection) => {
    const key = connectionKey(from, to);
    if (from === to || connections.has(key)) return;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    connections.set(key, { from: start, to: end });
    degrees[start] = (degrees[start] ?? 0) + 1;
    degrees[end] = (degrees[end] ?? 0) + 1;
  };

  for (const candidate of candidates) {
    const fromRoot = findRoot(candidate.from);
    const toRoot = findRoot(candidate.to);
    if (fromRoot === toRoot) continue;
    parents[toRoot] = fromRoot;
    addConnection(candidate);
    if (connections.size === Math.max(0, nodes.length - 1)) break;
  }

  if (nodes.length >= 3) {
    nodes.forEach((_, index) => {
      for (const candidate of candidates) {
        if ((degrees[index] ?? 0) >= 2) break;
        if (candidate.from !== index && candidate.to !== index) continue;
        addConnection(candidate);
      }
    });
  }

  const targetCount = Math.min(candidates.length, nodes.length * 2 + 2);
  for (const candidate of candidates) {
    if (connections.size >= targetCount) break;
    addConnection(candidate);
  }

  return [...connections.values()]
    .sort((left, right) => left.from - right.from || left.to - right.to);
};

export const createAthleteSphereModel = (
  athletes: readonly PublicAthleteCard[],
): AthleteSphereModel => {
  const orderedAthletes = athletes.slice().sort((left, right) =>
    stableScore(left.slug) - stableScore(right.slug)
    || left.slug.localeCompare(right.slug, "fr"));
  const divisor = Math.max(orderedAthletes.length - 1, 1);
  const nodes = orderedAthletes.map((athlete, index) => {
    const y = 1 - (index / divisor) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = GOLDEN_ANGLE * index;
    return {
      athlete,
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
    };
  });

  return {
    nodes,
    connections: createSphereConnections(nodes),
  };
};

export const projectAthleteSphereNodes = (
  nodes: readonly AthleteSphereNode[],
  yaw: number,
  pitch: number,
  width: number,
  height: number,
): ProjectedAthleteSphereNode[] => {
  const sphereRadius = Math.min(width, height) * 0.39;
  const centerX = width / 2;
  const centerY = height / 2;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  return nodes.map((node, index) => {
    const yawX = node.x * cosYaw - node.z * sinYaw;
    const yawZ = node.x * sinYaw + node.z * cosYaw;
    const rotatedY = node.y * cosPitch - yawZ * sinPitch;
    const depth = node.y * sinPitch + yawZ * cosPitch;
    const perspective = 2.8 / (2.8 - depth * 0.55);
    const normalizedDepth = (depth + 1) / 2;
    return {
      ...node,
      index,
      screenX: centerX + yawX * sphereRadius * perspective,
      screenY: centerY + rotatedY * sphereRadius * perspective,
      depth,
      radius: 3.5 + normalizedDepth * 6,
      opacity: 0.34 + normalizedDepth * 0.66,
    };
  });
};

export const findAthleteSphereNodeAtPoint = (
  nodes: readonly ProjectedAthleteSphereNode[],
  x: number,
  y: number,
  hitRadius = 20,
): ProjectedAthleteSphereNode | null =>
  nodes
    .slice()
    .sort((left, right) => right.depth - left.depth)
    .find((node) =>
      Math.hypot(node.screenX - x, node.screenY - y)
      <= Math.max(hitRadius, node.radius + 8)) ?? null;
