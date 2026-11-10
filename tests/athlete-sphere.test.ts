import { describe, expect, it } from "vitest";
import {
  createAthleteSphereModel,
  findAthleteSphereNodeAtPoint,
  projectAthleteSphereNodes,
} from "@/lib/athlete-sphere";
import type { PublicAthleteCard } from "@/lib/public-athletes";

const athletes: PublicAthleteCard[] = Array.from({ length: 24 }, (_, index) => ({
  slug: `athlete-${index + 1}`,
  name: `Athlète ${index + 1}`,
  sport: index % 2 ? "Football" : "Judo",
  club: `Club ${index + 1}`,
  colorCategory: index % 2 ? "field" : "combat",
}));

describe("athlete sphere model", () => {
  it("places all 24 public athletes in one deterministic, locally connected graph", () => {
    const forward = createAthleteSphereModel(athletes);
    const reverse = createAthleteSphereModel([...athletes].reverse());
    const keys = forward.connections.map(({ from, to }) => `${from}-${to}`);
    const degrees = Array.from({ length: forward.nodes.length }, () => 0);
    const neighbors = Array.from(
      { length: forward.nodes.length },
      () => [] as number[],
    );
    for (const { from, to } of forward.connections) {
      degrees[from]! += 1;
      degrees[to]! += 1;
      neighbors[from]!.push(to);
      neighbors[to]!.push(from);
    }
    const visited = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const current = queue.shift()!;
      for (const neighbor of neighbors[current]!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    expect(forward).toEqual(reverse);
    expect(forward.nodes).toHaveLength(24);
    expect(forward.connections).toHaveLength(50);
    expect(forward.connections.length).toBeGreaterThanOrEqual(45);
    expect(forward.connections.length).toBeLessThanOrEqual(55);
    expect(new Set(keys).size).toBe(keys.length);
    expect(forward.connections.every(({ from, to }) => from < to)).toBe(true);
    expect(degrees.every((degree) => degree >= 2)).toBe(true);
    expect(visited.size).toBe(forward.nodes.length);
    expect(new Set(forward.nodes.map((node) => node.athlete.slug)).size).toBe(24);
    for (const node of forward.nodes) {
      expect(Math.hypot(node.x, node.y, node.z)).toBeCloseTo(1, 8);
    }
  });

  it("projects depth into point size and resolves the front-most hit", () => {
    const model = createAthleteSphereModel(athletes);
    const projected = projectAthleteSphereNodes(model.nodes, -0.42, -0.14, 640, 510);
    const front = projected.slice().sort((left, right) => right.depth - left.depth)[0];

    expect(front).toBeDefined();
    expect(projected.every((node) => Number.isFinite(node.screenX) && Number.isFinite(node.screenY))).toBe(true);
    expect(Math.max(...projected.map((node) => node.radius)))
      .toBeGreaterThan(Math.min(...projected.map((node) => node.radius)));
    expect(findAthleteSphereNodeAtPoint(projected, front!.screenX, front!.screenY)?.index)
      .toBe(front!.index);
  });
});
