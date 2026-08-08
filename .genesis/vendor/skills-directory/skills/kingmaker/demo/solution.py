#!/usr/bin/env python3
"""
solution.py

Fix: do not count endorsements. Spread authority through the network.

Each agent starts with equal standing. Every round, each agent hands a
share of its current standing to the agents it endorses, split evenly
across its endorsements. We repeat until the standings stop moving.

The result: an endorsement from a high-standing agent is worth more than
one from a nobody. A clique that only endorses itself cannot pump its
standing past the genuinely trusted agent, because almost no standing
flows into the clique from the outside world. It only recycles the tiny
baseline it started with. The genuine inner circle, fed by many honest
voters, recirculates a large inflow and pulls ahead.

A small uniform leak is mixed in every round so dead ends and isolated
rings stay well-behaved and the standings always settle.
"""


def build_endorsements():
    # edge (a, b) means "a endorses b" - identical graph to the buggy demo
    edges = []

    for i in range(1, 9):
        edges.append(("a%d" % i, "HUB_A" if i % 2 == 0 else "HUB_B"))

    edges.append(("HUB_A", "TRUST"))
    edges.append(("HUB_B", "TRUST"))
    edges.append(("TRUST", "HUB_A"))
    edges.append(("TRUST", "HUB_B"))

    edges.append(("C1", "C2"))
    edges.append(("C2", "C3"))
    edges.append(("C3", "C1"))

    for i in range(1, 7):
        edges.append(("m%d" % i, "C1"))

    return edges


def nodes_and_out_edges(edges):
    nodes = set()
    out = {}
    for a, b in edges:
        nodes.add(a)
        nodes.add(b)
        out.setdefault(a, []).append(b)
    return nodes, out


def spread_authority(edges, leak=0.15, tol=1e-12, max_rounds=5000):
    nodes, out = nodes_and_out_edges(edges)
    n = len(nodes)
    # equal starting standing
    standing = {node: 1.0 / n for node in nodes}

    rounds = 0
    history = []
    while rounds < max_rounds:
        rounds += 1
        # the uniform leak: every node gets a flat baseline share
        new = {node: leak / n for node in nodes}

        # standing sitting on dead-end nodes (no endorsements out) is
        # redistributed uniformly so nothing gets lost or stuck
        dangling = sum(standing[node] for node in nodes if not out.get(node))

        for node in nodes:
            targets = out.get(node)
            if not targets:
                continue
            share = (1.0 - leak) * standing[node] / len(targets)
            for t in targets:
                new[t] += share

        for node in nodes:
            new[node] += (1.0 - leak) * dangling / n

        delta = sum(abs(new[node] - standing[node]) for node in nodes)
        standing = new
        history.append((rounds, dict(standing)))
        if delta < tol:
            break

    return standing, rounds, history


def main():
    edges = build_endorsements()
    standing, rounds, history = spread_authority(edges)

    ranking = sorted(standing.items(), key=lambda kv: (-kv[1], kv[0]))

    print("Authority spread converged in {} rounds.".format(rounds))
    print()
    print("Watch a few key agents settle, round by round:")
    watch = ["TRUST", "C1", "HUB_A"]
    shown = [1, 2, 3, 5, 10, 20]
    print("  round  " + "  ".join("{:>8s}".format(w) for w in watch))
    for r, snap in history:
        if r in shown or r == rounds:
            row = "  ".join("{:8.5f}".format(snap[w]) for w in watch)
            print("  {:5d}  {}".format(r, row))
    print()

    print("Final authority ranking (flow-based), top 6:")
    for name, val in ranking[:6]:
        print("  {:6s} {:.5f}".format(name, val))
    print()

    names_in_order = [name for name, _ in ranking]
    leader = names_in_order[0]
    c1_rank = names_in_order.index("C1") + 1
    trust_rank = names_in_order.index("TRUST") + 1

    print("Leader: {}".format(leader))
    print("TRUST rank: {}   C1 rank: {}".format(trust_rank, c1_rank))
    print()

    # proof: the genuinely trusted agent now leads, the gamed clique sinks
    assert leader == "TRUST", "expected TRUST to lead, got " + leader
    assert standing["TRUST"] > standing["C1"], "TRUST must outrank C1"
    assert trust_rank == 1, "TRUST should be first"
    assert c1_rank > trust_rank, "C1 must fall below TRUST"

    print("PASS: flow-based authority crowns the genuinely trusted agent.")
    print("PASS: the self-endorsing clique could not inflate C1 past TRUST.")


if __name__ == "__main__":
    main()
