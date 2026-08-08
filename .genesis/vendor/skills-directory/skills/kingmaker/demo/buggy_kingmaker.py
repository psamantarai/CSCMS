#!/usr/bin/env python3
"""
buggy_kingmaker.py

Failure mode: rank agents by raw endorsement COUNT.
One vote is one vote. That is gameable.

A clique of low-quality agents (C1, C2, C3) endorse each other in a
closed ring, and a pack of throwaway sock puppets (m1..m6) all pile
their endorsements onto C1 to inflate its count. None of them is
trusted by anyone of substance - they only endorse inside the clique.

Meanwhile a genuinely trusted agent (TRUST) sits in a real inner circle
with two heavyweights (HUB_A, HUB_B). The hubs are endorsed by many
honest voters, the hubs endorse TRUST, and TRUST endorses them back.

Counting endorsements crowns C1. That is the wrong leader.
"""


def build_endorsements():
    # edge (a, b) means "a endorses b"
    edges = []

    # 8 honest voters back two heavyweights (4 each)
    for i in range(1, 9):
        edges.append(("a%d" % i, "HUB_A" if i % 2 == 0 else "HUB_B"))

    # the trusted inner circle: hubs endorse TRUST, TRUST endorses back
    edges.append(("HUB_A", "TRUST"))
    edges.append(("HUB_B", "TRUST"))
    edges.append(("TRUST", "HUB_A"))
    edges.append(("TRUST", "HUB_B"))

    # the gamed clique: a closed ring of nobodies
    edges.append(("C1", "C2"))
    edges.append(("C2", "C3"))
    edges.append(("C3", "C1"))

    # 6 sock puppets pile endorsements onto C1 to inflate its raw count
    for i in range(1, 7):
        edges.append(("m%d" % i, "C1"))

    return edges


def count_endorsements(edges):
    counts = {}
    for _, target in edges:
        counts[target] = counts.get(target, 0) + 1
    return counts


def main():
    edges = build_endorsements()
    counts = count_endorsements(edges)

    ranking = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))

    print("Naive ranking by endorsement count:")
    for name, c in ranking[:6]:
        print("  {:6s} {} endorsements".format(name, c))

    leader = ranking[0][0]
    print()
    print("Naive winner: {}".format(leader))
    print("TRUST endorsement count: {}".format(counts.get("TRUST", 0)))
    print()
    if leader != "TRUST":
        print("WRONG: a self-endorsing clique inflated {} above the".format(leader))
        print("genuinely trusted agent TRUST. Raw counting got gamed.")


if __name__ == "__main__":
    main()
