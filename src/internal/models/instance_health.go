package models

import (
	"bufio"
	"context"
	"math"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/db"
)

// The health side of the Instance model (main/models/ha.py): capacity from
// CPU and memory, health data from a check, and lost nodes.

// Heartbeat settings (CLUSTER_NODE_HEARTBEAT_PERIOD and friends).
const (
	ClusterNodeHeartbeatPeriod          = 60
	ClusterNodeMissedHeartbeatTolerance = 2
	ReceptorServiceAdvertisementPeriod  = 60
	ExecutionNodeRemediationChecks      = 60 * 30
)

// InstanceHealth is the part of an instance its health checks change.
type InstanceHealth struct {
	ID                 int64
	Hostname           string
	NodeType           string
	NodeState          string
	Enabled            bool
	UUID               *string
	Version            string
	CPU                float64
	Memory             int64
	CapacityAdjustment float64
	CPUCapacity        int64
	MemCapacity        int64
	Capacity           int64
	Errors             string
	LastSeen           *time.Time
	LastHealthCheck    *time.Time
}

const instanceHealthColumns = `id, hostname, node_type, node_state, enabled, uuid, version, cpu::float8, memory, capacity_adjustment::float8, cpu_capacity, mem_capacity, capacity, errors, last_seen, last_health_check`

func scanInstanceHealth(row interface{ Scan(...any) error }) (*InstanceHealth, error) {
	i := &InstanceHealth{}
	err := row.Scan(&i.ID, &i.Hostname, &i.NodeType, &i.NodeState, &i.Enabled, &i.UUID, &i.Version, &i.CPU, &i.Memory, &i.CapacityAdjustment,
		&i.CPUCapacity, &i.MemCapacity, &i.Capacity, &i.Errors, &i.LastSeen, &i.LastHealthCheck)
	return i, err
}

// InstanceHealthByHostname loads one instance.
func InstanceHealthByHostname(ctx context.Context, q db.Querier, hostname string) (*InstanceHealth, error) {
	return scanInstanceHealth(q.QueryRow(ctx, `SELECT `+instanceHealthColumns+` FROM main_instance WHERE hostname = $1`, hostname))
}

// InstancesForHeartbeat are the instances in a state the heartbeat
// looks at.
func InstancesForHeartbeat(ctx context.Context, q db.Querier) ([]*InstanceHealth, error) {
	rows, err := q.Query(ctx, `SELECT `+instanceHealthColumns+` FROM main_instance WHERE node_state IN ('ready', 'unavailable', 'installed') ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*InstanceHealth
	for rows.Next() {
		i, err := scanInstanceHealth(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// IsLost is Instance.is_lost.
func (i *InstanceHealth) IsLost(ref time.Time) bool { return InstanceLost(i.LastSeen, i.NodeType, ref) }

// InstanceLost is Instance.is_lost for a node of the type last seen then:
// no check-in for two heartbeats, and for an execution or hop node one
// receptor advertisement period more.
func InstanceLost(lastSeen *time.Time, nodeType string, ref time.Time) bool {
	if lastSeen == nil {
		return true
	}
	grace := ClusterNodeHeartbeatPeriod * ClusterNodeMissedHeartbeatTolerance
	if nodeType == "execution" || nodeType == "hop" {
		grace += ReceptorServiceAdvertisementPeriod
	}
	return lastSeen.Before(ref.Add(-time.Duration(grace) * time.Second))
}

// LostAndUnavailable reports whether an instance may be deprovisioned
// whatever its type and the platform: the heartbeat marked it
// unavailable, and it still has not checked in.
func LostAndUnavailable(nodeState string, lastSeen *time.Time, nodeType string, ref time.Time) bool {
	return nodeState == "unavailable" && InstanceLost(lastSeen, nodeType, ref)
}

func isControlType(t string) bool { return t == "control" || t == "hybrid" }

// convertCPUStr is convert_cpu_str_to_decimal_cpu: "1500m" or "1.5",
// rounded to a tenth and at least 0.1 (1 when unreadable).
func convertCPUStr(s string) float64 {
	cpu, milli := s, false
	if strings.HasSuffix(s, "m") {
		cpu, milli = strings.TrimSuffix(s, "m"), true
	}
	n, err := strconv.ParseFloat(strings.TrimSpace(cpu), 64)
	if err != nil {
		n, milli = 1, false
	}
	if milli {
		n /= 1000
	}
	n = math.Round(n*10) / 10
	if n < 0.1 {
		return 0.1
	}
	return n
}

// convertMemStr is convert_mem_str_to_bytes.
func convertMemStr(s string) int64 {
	s = strings.TrimSpace(s)
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	for _, u := range []struct {
		suffix string
		mult   float64
	}{{"Ei", math.Pow(2, 60)}, {"E", 1e18}, {"Pi", math.Pow(2, 50)}, {"P", 1e15}, {"Ti", math.Pow(2, 40)}, {"T", 1e12},
		{"Gi", math.Pow(2, 30)}, {"G", 1e9}, {"Mi", math.Pow(2, 20)}, {"M", 1e6}, {"Ki", 1024}, {"K", 1e3}} {
		if strings.HasSuffix(s, u.suffix) {
			if n, err := strconv.ParseFloat(strings.TrimSuffix(s, u.suffix), 64); err == nil {
				return int64(n * u.mult)
			}
		}
	}
	return 0
}

// CorrectedCPU is get_corrected_cpu (SYSTEM_TASK_ABS_CPU).
func CorrectedCPU(cpu float64) float64 {
	if v, ok := os.LookupEnv("SYSTEM_TASK_ABS_CPU"); ok {
		return convertCPUStr(v)
	}
	return cpu
}

// CorrectedMemory is get_corrected_memory (SYSTEM_TASK_ABS_MEM).
func CorrectedMemory(mem int64) int64 {
	if v, ok := os.LookupEnv("SYSTEM_TASK_ABS_MEM"); ok {
		return convertMemStr(v)
	}
	return mem
}

func envInt(name string, def int64) int64 {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return def
}

// CPUEffectiveCapacity is get_cpu_effective_capacity.
func CPUEffectiveCapacity(cpu float64, control bool) int64 {
	if control {
		cpu = CorrectedCPU(cpu)
	}
	n := int64(cpu * float64(envInt("SYSTEM_TASK_FORKS_CPU", 4)))
	if n < 1 {
		return 1
	}
	return n
}

// MemEffectiveCapacity is get_mem_effective_capacity: forks of
// SYSTEM_TASK_FORKS_MEM megabytes after 2GiB for the services (none on
// Kubernetes, where they have their own containers).
func MemEffectiveCapacity(mem int64, control, isK8s bool) int64 {
	if control {
		mem = CorrectedMemory(mem)
	}
	penalty := int64(2147483648)
	if isK8s {
		penalty = 0
	}
	memMB := floorDiv(mem-penalty, 1<<20)
	forks := floorDiv(memMB, envInt("SYSTEM_TASK_FORKS_MEM", 100))
	if forks < 1 {
		return 1
	}
	return forks
}

func floorDiv(a, b int64) int64 {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// refreshCapacity is refresh_capacity_fields with set_capacity_value.
func (i *InstanceHealth) refreshCapacity(isK8s bool) {
	if i.NodeType == "hop" {
		i.CPUCapacity, i.MemCapacity = 0, 0
	} else {
		i.CPUCapacity = CPUEffectiveCapacity(i.CPU, isControlType(i.NodeType))
		i.MemCapacity = MemEffectiveCapacity(i.Memory, isControlType(i.NodeType), isK8s)
	}
	i.setCapacityValue()
}

// setCapacityValue is set_capacity_value: between the lower and higher of
// the two capacities by capacity_adjustment.
func (i *InstanceHealth) setCapacityValue() {
	if i.Enabled && i.NodeType != "hop" {
		lower, higher := i.MemCapacity, i.CPUCapacity
		if lower > higher {
			lower, higher = higher, lower
		}
		// The Decimal result was truncated to the integer field.
		i.Capacity = int64(math.Floor(float64(lower) + float64(higher-lower)*i.CapacityAdjustment + 1e-9))
	} else {
		i.Capacity = 0
	}
}

// HealthData is what a check found.
type HealthData struct {
	Version        *string
	CPU            float64
	Memory         int64
	UUID           *string
	UpdateLastSeen bool
	Errors         string
}

// SaveHealthData is save_health_data.
func (i *InstanceHealth) SaveHealthData(ctx context.Context, q db.Querier, h HealthData, isK8s bool) error {
	now := time.Now()
	if i.NodeType != "hop" {
		i.LastHealthCheck = &now
	}
	if h.UpdateLastSeen {
		i.LastSeen = i.LastHealthCheck
		if i.LastSeen == nil {
			i.LastSeen = &now
		}
	}
	if h.UUID != nil && (i.UUID == nil || *i.UUID != *h.UUID) {
		i.UUID = h.UUID
	}
	if h.Version != nil {
		i.Version = *h.Version
	}
	if i.NodeType == "execution" {
		i.CPU, i.Memory = h.CPU, h.Memory
	} else {
		i.CPU, i.Memory = CorrectedCPU(h.CPU), CorrectedMemory(h.Memory)
	}
	if h.Errors == "" {
		i.refreshCapacity(isK8s)
		i.Errors = ""
		if i.NodeState == "unavailable" || i.NodeState == "installed" {
			i.NodeState = "ready"
		}
	} else {
		i.markOffline(false, h.Errors)
	}
	_, err := q.Exec(ctx, `UPDATE main_instance SET errors = $2, last_health_check = $3, last_seen = $4, uuid = $5, version = $6, cpu = $7, memory = $8,
		node_state = $9, cpu_capacity = $10, mem_capacity = $11, capacity = $12 WHERE id = $1`,
		i.ID, i.Errors, i.LastHealthCheck, i.LastSeen, i.UUID, i.Version, i.CPU, i.Memory, i.NodeState, i.CPUCapacity, i.MemCapacity, i.Capacity)
	return err
}

// markOffline is mark_offline without the save; it reports whether
// anything changed.
func (i *InstanceHealth) markOffline(updateLastSeen bool, errors string) bool {
	if i.NodeState != "ready" && i.NodeState != "unavailable" && i.NodeState != "installed" {
		return false
	}
	if i.NodeState == "unavailable" && i.Errors == errors && !updateLastSeen {
		return false
	}
	i.NodeState = "unavailable"
	i.CPUCapacity, i.MemCapacity, i.Capacity = 0, 0, 0
	i.Errors = errors
	if updateLastSeen {
		now := time.Now()
		i.LastSeen = &now
	}
	return true
}

// MarkOffline is mark_offline.
func (i *InstanceHealth) MarkOffline(ctx context.Context, q db.Querier, updateLastSeen bool, errors string) error {
	if !i.markOffline(updateLastSeen, errors) {
		return nil
	}
	_, err := q.Exec(ctx, `UPDATE main_instance SET node_state = $2, capacity = 0, cpu_capacity = 0, mem_capacity = 0, errors = $3, last_seen = $4 WHERE id = $1`,
		i.ID, i.NodeState, i.Errors, i.LastSeen)
	return err
}

// SetLastSeen records a mesh advertisement's time.
func (i *InstanceHealth) SetLastSeen(ctx context.Context, q db.Querier, t time.Time) error {
	i.LastSeen = &t
	_, err := q.Exec(ctx, `UPDATE main_instance SET last_seen = $2 WHERE id = $1`, i.ID, t)
	return err
}

// LocalCPUCount is ansible-runner's get_cpu_count for this host.
func LocalCPUCount() float64 { return float64(runtime.NumCPU()) }

// LocalMemBytes is get_mem_in_bytes: the host's total memory.
func LocalMemBytes() int64 {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) >= 2 && fields[0] == "MemTotal:" {
			n, _ := strconv.ParseInt(fields[1], 10, 64)
			return n * 1024
		}
	}
	return 0
}
