/**
 * Dependency graph between cells.
 * An edge "A -> B" in `dependencies` means A's formula reads B, so B must be computed before A.
 */
export class DependencyGraph {
  constructor() {
    this.dependencies = new Map(); // node -> Set of nodes it reads
    this.dependents = new Map(); // node -> Set of nodes that read it
  }

  /** Replaces the dependencies of `node`. */
  setDependencies(node, deps) {
    this.removeDependencies(node);
    const set = new Set(deps);
    if (set.size === 0) return;
    this.dependencies.set(node, set);
    for (const dep of set) {
      if (!this.dependents.has(dep)) this.dependents.set(dep, new Set());
      this.dependents.get(dep).add(node);
    }
  }

  removeDependencies(node) {
    const old = this.dependencies.get(node);
    if (!old) return;
    for (const dep of old) {
      const set = this.dependents.get(dep);
      if (set) {
        set.delete(node);
        if (set.size === 0) this.dependents.delete(dep);
      }
    }
    this.dependencies.delete(node);
  }

  getDependencies(node) {
    return [...(this.dependencies.get(node) ?? [])];
  }

  getDependents(node) {
    return [...(this.dependents.get(node) ?? [])];
  }

  /** `nodes` plus everything that transitively depends on them (breadth first). */
  affected(nodes) {
    const seen = new Set(nodes);
    const queue = [...seen];
    for (let i = 0; i < queue.length; i++) {
      for (const dependent of this.dependents.get(queue[i]) ?? []) {
        if (!seen.has(dependent)) { seen.add(dependent); queue.push(dependent); }
      }
    }
    return seen;
  }

  /**
   * Kahn's algorithm restricted to `subset`. Returns { order, cyclic }:
   * `order` can be evaluated front to back; `cyclic` holds nodes that sit on a cycle or depend
   * on one (they can never be ordered). Ties are broken with `compare` for deterministic output.
   */
  topologicalOrder(subset, compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    const nodes = new Set(subset);
    const indegree = new Map();
    for (const node of nodes) {
      let count = 0;
      for (const dep of this.dependencies.get(node) ?? []) if (nodes.has(dep)) count += 1;
      indegree.set(node, count);
    }
    const ready = [...nodes].filter((n) => indegree.get(n) === 0).sort(compare);
    const order = [];
    while (ready.length) {
      const node = ready.shift();
      order.push(node);
      const released = [];
      for (const dependent of this.dependents.get(node) ?? []) {
        if (!nodes.has(dependent)) continue;
        const left = indegree.get(dependent) - 1;
        indegree.set(dependent, left);
        if (left === 0) released.push(dependent);
      }
      ready.push(...released.sort(compare));
    }
    const cyclic = new Set([...nodes].filter((n) => indegree.get(n) > 0));
    return { order, cyclic };
  }

  /** Returns a cycle through `start` as [start, ..., start], or null. Iterative DFS. */
  findCycle(start) {
    const stack = [[start, [...(this.dependencies.get(start) ?? [])]]];
    const path = [start];
    const onPath = new Set([start]);
    const dead = new Set();
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const next = frame[1].shift();
      if (next === undefined) {
        stack.pop();
        const done = path.pop();
        onPath.delete(done);
        dead.add(done);
        continue;
      }
      if (next === start) return [...path, start];
      if (onPath.has(next) || dead.has(next)) continue;
      path.push(next);
      onPath.add(next);
      stack.push([next, [...(this.dependencies.get(next) ?? [])]]);
    }
    return null;
  }

  hasCycle(start) {
    return this.findCycle(start) !== null;
  }
}
