import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DependencyGraph } from '../src/graph.js';

function build(edges) {
  const g = new DependencyGraph();
  const by = {};
  for (const [node, dep] of edges) (by[node] ??= []).push(dep);
  for (const [node, deps] of Object.entries(by)) g.setDependencies(node, deps);
  return g;
}

test('stores and returns dependencies and dependents', () => {
  const g = build([['C', 'A'], ['C', 'B'], ['D', 'C']]);
  assert.deepEqual(g.getDependencies('C').sort(), ['A', 'B']);
  assert.deepEqual(g.getDependents('A'), ['C']);
  assert.deepEqual(g.getDependents('C'), ['D']);
  assert.deepEqual(g.getDependents('D'), []);
  assert.deepEqual(g.getDependencies('A'), []);
});

test('setDependencies replaces previous edges and keeps both directions consistent', () => {
  const g = build([['C', 'A'], ['C', 'B']]);
  g.setDependencies('C', ['B', 'X']);
  assert.deepEqual(g.getDependents('A'), []);
  assert.deepEqual(g.getDependents('B'), ['C']);
  assert.deepEqual(g.getDependents('X'), ['C']);
  g.setDependencies('C', []);
  assert.deepEqual(g.getDependents('B'), []);
  assert.deepEqual(g.getDependencies('C'), []);
});

test('removeDependencies on an unknown node is a no-op', () => {
  const g = new DependencyGraph();
  assert.doesNotThrow(() => g.removeDependencies('nope'));
});

test('affected returns the seeds plus all transitive dependents', () => {
  const g = build([['B', 'A'], ['C', 'B'], ['D', 'C'], ['E', 'X']]);
  assert.deepEqual([...g.affected(['A'])].sort(), ['A', 'B', 'C', 'D']);
  assert.deepEqual([...g.affected(['X'])].sort(), ['E', 'X']);
  assert.deepEqual([...g.affected(['D'])], ['D']);
  assert.deepEqual([...g.affected(['A', 'X'])].sort(), ['A', 'B', 'C', 'D', 'E', 'X']);
});

test('affected terminates on cycles', () => {
  const g = build([['A', 'B'], ['B', 'A']]);
  assert.deepEqual([...g.affected(['A'])].sort(), ['A', 'B']);
});

test('topologicalOrder puts dependencies before dependents', () => {
  const g = build([['D', 'B'], ['D', 'C'], ['B', 'A'], ['C', 'A']]);
  const { order, cyclic } = g.topologicalOrder(['A', 'B', 'C', 'D']);
  assert.equal(cyclic.size, 0);
  assert.deepEqual(order, ['A', 'B', 'C', 'D']);
  for (const [node, deps] of [['D', ['B', 'C']], ['B', ['A']], ['C', ['A']]]) {
    for (const dep of deps) assert.ok(order.indexOf(dep) < order.indexOf(node));
  }
});

test('topologicalOrder ignores dependencies outside the subset', () => {
  const g = build([['B', 'A'], ['C', 'B']]);
  assert.deepEqual(g.topologicalOrder(['B', 'C']).order, ['B', 'C']);
});

test('topologicalOrder reports cycles and everything stuck behind them', () => {
  const g = build([['A', 'B'], ['B', 'A'], ['C', 'B'], ['D', 'X']]);
  const { order, cyclic } = g.topologicalOrder(['A', 'B', 'C', 'D', 'X']);
  assert.deepEqual([...cyclic].sort(), ['A', 'B', 'C']);
  assert.deepEqual(order.sort(), ['D', 'X']);
});

test('a self reference is a cycle', () => {
  const g = build([['A', 'A']]);
  assert.deepEqual([...g.topologicalOrder(['A']).cyclic], ['A']);
  assert.deepEqual(g.findCycle('A'), ['A', 'A']);
});

test('findCycle returns the path of a cycle through the start node', () => {
  const g = build([['A', 'B'], ['B', 'C'], ['C', 'A']]);
  const cycle = g.findCycle('A');
  assert.deepEqual(cycle, ['A', 'B', 'C', 'A']);
  assert.equal(g.hasCycle('B'), true);
});

test('findCycle returns null for acyclic graphs and for nodes that only feed into a cycle', () => {
  const dag = build([['B', 'A'], ['C', 'B'], ['C', 'A']]);
  assert.equal(dag.findCycle('C'), null);
  assert.equal(dag.hasCycle('A'), false);
  const g = build([['X', 'A'], ['A', 'B'], ['B', 'A']]);
  assert.equal(g.findCycle('X'), null);
  assert.ok(g.findCycle('A'));
});

test('findCycle handles diamonds without false positives and deep chains without recursion limits', () => {
  const diamond = build([['D', 'B'], ['D', 'C'], ['B', 'A'], ['C', 'A']]);
  assert.equal(diamond.findCycle('D'), null);
  const g = new DependencyGraph();
  for (let i = 1; i < 50000; i++) g.setDependencies(`n${i}`, [`n${i - 1}`]);
  assert.equal(g.findCycle('n49999'), null);
  g.setDependencies('n0', ['n49999']);
  assert.equal(g.findCycle('n0').length, 50001);
  const { order, cyclic } = g.topologicalOrder([...g.affected(['n0'])]);
  assert.equal(order.length, 0);
  assert.equal(cyclic.size, 50000);
});

test('deterministic order with a custom comparator', () => {
  const g = new DependencyGraph();
  const { order } = g.topologicalOrder(['c', 'a', 'b']);
  assert.deepEqual(order, ['a', 'b', 'c']);
  const reverse = g.topologicalOrder(['c', 'a', 'b'], (x, y) => (x < y ? 1 : -1)).order;
  assert.deepEqual(reverse, ['c', 'b', 'a']);
});
