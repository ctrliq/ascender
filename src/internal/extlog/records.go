package extlog

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Records the producers build: what the old LogRecords carried to the
// formatter.

// Logger names of the analytics loggers (ascender.analytics.<kind>).
const (
	ActivityStreamLogger     = AnalyticsPrefix + ".activity_stream"
	JobEventsLogger          = AnalyticsPrefix + ".job_events"
	SystemTrackingLogger     = AnalyticsPrefix + ".system_tracking"
	JobLifecycleLogger       = AnalyticsPrefix + ".job_lifecycle"
	BroadcastWebsocketLogger = AnalyticsPrefix + ".broadcast_websocket"
	PerformanceLogger        = AnalyticsPrefix + ".performance"
)

// ServiceRecord is a service logger's record: the LogRecord attributes the
// formatter kept (stack_info, taskName), the extra ones, and the guid the
// filter added.
func ServiceRecord(ctx context.Context, t time.Time, logger, level, msg string, extra []Field) Record {
	fields := make([]Field, 0, len(extra)+3)
	fields = append(fields, Field{"stack_info", nil}, Field{"taskName", nil})
	fields = append(fields, extra...)
	fields = append(fields, Field{"guid", GUID(ctx)})
	return Record{Time: t, Logger: logger, Level: level, Message: msg, Extra: fields}
}

// Lifecycle is one UnifiedJob.log_lifecycle call.
type Lifecycle struct {
	// Type is the model name: job, projectupdate, inventoryupdate,
	// adhoccommand, systemjob, workflowjob, workflowapproval.
	Type       string
	TaskID     int64
	State      string
	WorkUnitID *string
	TaskName   string
	// BlockedBy is "<model>-<id>" for the blocked state.
	BlockedBy      string
	ControllerNode string
	ExecutionNode  string
	OrganizationID *int64
}

// LifecycleRecord is the job_lifecycle record: "<type>-<id> <state> {json}"
// with the same dictionary as lifecycle_data.
func LifecycleRecord(ctx context.Context, l Lifecycle) Record {
	msg, data := lifecycleParts(l)
	js, _ := pyJSON(orderedJSON(data))
	var org any
	if l.OrganizationID != nil {
		org = *l.OrganizationID
	}
	extra := []Field{{"stack_info", nil}, {"taskName", nil}, {"lifecycle_data", orderedJSON(data)}, {"organization_id", org}, {"guid", GUID(ctx)}}
	return Record{Time: time.Now(), Logger: JobLifecycleLogger, Level: "INFO", Message: msg + " " + string(js), Extra: extra}
}

// lifecycleParts are a lifecycle record's message ("job-7 running") and
// its lifecycle_data fields.
func lifecycleParts(l Lifecycle) (string, []Field) {
	var wu any
	if l.WorkUnitID != nil && *l.WorkUnitID != "" {
		wu = *l.WorkUnitID
	}
	data := []Field{{"type", l.Type}, {"task_id", l.TaskID}, {"state", l.State}, {"work_unit_id", wu}}
	if l.TaskName != "" {
		data = append(data, Field{"task_name", l.TaskName})
	}
	var msg string
	if l.State == "blocked" && l.BlockedBy != "" {
		msg = fmt.Sprintf("%s-%d blocked by %s", l.Type, l.TaskID, l.BlockedBy)
		data = append(data, Field{"blocked_by", l.BlockedBy})
	} else {
		msg = fmt.Sprintf("%s-%d %s", l.Type, l.TaskID, strings.ReplaceAll(l.State, "_", " "))
	}
	switch l.State {
	case "controller_node_chosen":
		data = append(data, Field{"controller_node", orNotSet(l.ControllerNode)})
	case "execution_node_chosen":
		data = append(data, Field{"execution_node", orNotSet(l.ExecutionNode)})
	}
	return msg, data
}

func orNotSet(s string) string {
	if s == "" {
		return "NOT_SET"
	}
	return s
}

// LifecycleWanted reports whether a lifecycle record goes anywhere: to
// the console (the process output), or to an external logger.
func (s *Shipper) LifecycleWanted() bool {
	return ConsoleWants("INFO") || s.Wants(JobLifecycleLogger, "INFO")
}

// LogLifecycle writes a lifecycle record to the console and emits it to
// the external loggers that want it, as the old job_lifecycle logger's
// console and external_logger handlers did. s may be nil (no external
// logging).
func (s *Shipper) LogLifecycle(ctx context.Context, l Lifecycle) {
	if !s.LifecycleWanted() {
		return
	}
	writeLifecycleConsole(ctx, l)
	if s.Wants(JobLifecycleLogger, "INFO") {
		s.Emit(LifecycleRecord(ctx, l))
	}
}

// Ordered is an ordered JSON object for record data.
type Ordered = orderedJSON

// Time is a datetime as DjangoJSONEncoder wrote it.
type Time time.Time

// MarshalJSON writes the time as DjangoJSONEncoder did.
func (t Time) MarshalJSON() ([]byte, error) {
	return []byte(`"` + djangoTime(time.Time(t)) + `"`), nil
}
