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

  const uniqueConnections = new Map<string, AthleteSphereConnection>();
  nodes.forEach((node, from) => {
    nodes
      .map((candidate, to) => ({ to, distance: squaredDistance(node, candidate) }))
      .filter(({ to }) => to !== from)
      .sort((left, right) => left.distance - right.distance || left.to - right.to)
      .slice(0, 2)
      .forEach(({ to }) => {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        uniqueConnections.set(`${start}:${end}`, { from: start, to: end });
      });
  });

  return {
    nodes,
    connections: [...uniqueConnections.values()]
      .sort((left, right) => left.from - right.from || left.to - right.to)
      .slice(0, Math.min(36, nodes.length + 8)),
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
