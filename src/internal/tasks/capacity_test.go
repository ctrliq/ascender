package tasks

import (
	"testing"

	"github.com/ctrliq/ascender/internal/config"
)

// The task manager's fitting rules on hand-built state.
func TestCapacityFitting(t *testing.T) {
	d := &Dispatcher{Cfg: &config.Config{ClusterHostID: "node1"}}
	node := &tmInstance{hostname: "node1", nodeType: "hybrid", capacity: 10, reachable: true}
	other := &tmInstance{hostname: "node2", nodeType: "execution", capacity: 100}
	g := &tmGroup{name: "default", instances: []*tmInstance{node, other}}

	// Room for the impact plus a hybrid node's own control cost.
	if d.fit(g, 9, "execution", true) != node {
		t.Error("9 + control should fit 10")
	}
	if d.fit(g, 10, "execution", true) != nil {
		t.Error("10 + control should not fit 10")
	}
	if d.fit(g, 10, "execution", false) != node {
		t.Error("10 alone fits 10")
	}
	// Only the nodes this process reaches are fitted to.
	g2 := &tmGroup{instances: []*tmInstance{other}}
	if d.fit(g2, 1, "execution", false) != nil {
		t.Error("another node was chosen")
	}
	// An execution node over the mesh: the most room left wins.
	other.reachable = true
	if d.fit(g, 5, "execution", true) != other {
		t.Error("the mesh execution node has more room")
	}
	if d.largestIdle(g, "execution") != other {
		t.Error("the larger idle node was not chosen")
	}
	if d.fit(g, 1, "control", false) != node {
		t.Error("control work went to an execution node")
	}
	other.reachable = false
	// An idle node takes a task bigger than its capacity; a busy one not.
	if d.largestIdle(g, "execution") != node {
		t.Error("idle node not chosen")
	}
	node.consumed, node.jobs = 3, 1
	if d.largestIdle(g, "execution") != nil {
		t.Error("busy node chosen as idle")
	}
	if node.remaining() != 7 {
		t.Errorf("remaining %d", node.remaining())
	}
	node.consumed = 50
	if node.remaining() != 0 {
		t.Error("remaining below zero")
	}
	// Control plane: a control node, not an execution one.
	ex := &tmInstance{hostname: "node1", nodeType: "execution", capacity: 10, reachable: true}
	if d.fit(&tmGroup{instances: []*tmInstance{ex}}, 1, "control", false) != nil {
		t.Error("execution node took control work")
	}

	// Group limits: jobs and forks, from the instances or the container group.
	lim := &tmGroup{maxJobs: 2, instances: []*tmInstance{{hostname: "node1", nodeType: "hybrid", capacity: 10, jobs: 1, consumed: 4}}}
	if !lim.hasRemainingCapacity(1, 1) {
		t.Error("second job should fit max 2")
	}
	lim.instances[0].jobs = 2
	if lim.hasRemainingCapacity(1, 1) {
		t.Error("third job fitted max 2")
	}
	if !lim.hasRemainingCapacity(1, 0) {
		t.Error("control work counts no job")
	}
	forks := &tmGroup{containerGroup: true, maxForks: 10, cgForks: 6}
	if !forks.hasRemainingCapacity(4, 1) || forks.hasRemainingCapacity(5, 1) {
		t.Error("container group forks")
	}
	mesh := &tmGroup{containerGroup: true, meshNode: true}
	if mesh.hasRemainingCapacity(1, 1) {
		t.Error("mesh node down but group took work")
	}
}
