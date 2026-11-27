# ADR-002 — Fractional ranks for ordering

Status: accepted (2026-11-27)

## Decision

Sibling order uses lexicographic fractional keys from `fractional-indexing` 4.0.0 (CC0, by
rocicorp), wrapped in `packages/domain/src/rank.ts`. Ties are broken by entity id, so ordering is
always deterministic. No floating-point positions.

When a newly allocated rank exceeds 24 characters, the planner re-ranks all active siblings evenly
inside the same command (atomic rebalance). Tested in `planner.test.ts` (rebalance) and
`rank.test.ts` (front-insertion and midpoint sweeps).

## Alternatives

Own base-62 midpoint implementation — rejected: the library is small, dependency-free, widely used
and has an integer part that keeps append-heavy keys short.
