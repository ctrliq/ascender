package api

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
)

// The websocket (consumers.EventConsumer): /websocket/ and /api/websocket/
// carry the job status changes, job events, schedule and inventory changes
// a browser subscribes to. Both processes publish through Postgres NOTIFY
// on WebsocketChannel; every web process relays what it hears to its
// subscribers. Job events travel as references and are read back only
// when someone is subscribed to their job.

// WebsocketChannel is the NOTIFY channel of websocket messages.
const WebsocketChannel = "ascender_websocket"

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// wsMaxMessage bounds a client message.
const wsMaxMessage = 1 << 20

const (
	// wsMaxQueued bounds the bytes waiting to be written to one client;
	// one that falls this far behind is dropped.
	wsMaxQueued = 8 << 20
	// wsPingInterval is how often the server pings. Browsers answer on
	// their own, so a page left open keeps its socket while a client that
	// went away is noticed: nothing read for wsReadTimeout ends it.
	wsPingInterval = 30 * time.Second
	wsReadTimeout  = 2*wsPingInterval + 15*time.Second
	// wsMaxPerUser bounds the sockets one user holds open (a tab each).
	wsMaxPerUser = 64
)

// ---------------------------------------------------------------- RFC 6455

type wsConn struct {
	c         net.Conn
	br        *bufio.Reader
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
	// queued is the bytes in send, bounded by wsMaxQueued.
	queued atomic.Int64
	// recorded is the consumer's session['groups']: what the next
	// subscription is compared with.
	recorded map[string]bool
}

func headerHasToken(h http.Header, name, token string) bool {
	for _, v := range h.Values(name) {
		for _, p := range strings.Split(v, ",") {
			if strings.EqualFold(strings.TrimSpace(p), token) {
				return true
			}
		}
	}
	return false
}

func isWebsocketUpgrade(r *http.Request) bool {
	return r.Method == http.MethodGet && headerHasToken(r.Header, "Connection", "upgrade") && headerHasToken(r.Header, "Upgrade", "websocket")
}

// wsUpgrade completes the opening handshake and takes over the connection.
func wsUpgrade(w http.ResponseWriter, r *http.Request) (*wsConn, error) {
	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if r.Header.Get("Sec-WebSocket-Version") != "13" || key == "" {
		w.Header().Set("Sec-WebSocket-Version", "13")
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return nil, errors.New("unsupported websocket handshake")
	}
	sum := sha1.Sum([]byte(key + wsGUID))
	c, brw, err := http.NewResponseController(w).Hijack()
	if err != nil {
		return nil, err
	}
	// The server's ReadTimeout was set on the connection for the
	// handshake; from here readMessage sets its own (wsReadTimeout), which
	// every frame the client sends, the answers to the server's pings
	// among them, moves on.
	_ = c.SetReadDeadline(time.Now().Add(wsReadTimeout))
	resp := "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + base64.StdEncoding.EncodeToString(sum[:]) + "\r\n\r\n"
	if _, err := c.Write([]byte(resp)); err != nil {
		c.Close()
		return nil, err
	}
	conn := &wsConn{c: c, br: brw.Reader, send: make(chan []byte, 512), done: make(chan struct{}), recorded: map[string]bool{}}
	go conn.writer()
	return conn, nil
}

// frame encodes one unmasked server frame.
func wsFrame(op byte, payload []byte) []byte {
	n := len(payload)
	var hdr []byte
	switch {
	case n < 126:
		hdr = []byte{0x80 | op, byte(n)}
	case n <= math.MaxUint16:
		hdr = []byte{0x80 | op, 126, 0, 0}
		binary.BigEndian.PutUint16(hdr[2:], uint16(n))
	default:
		hdr = make([]byte, 10)
		hdr[0], hdr[1] = 0x80|op, 127
		binary.BigEndian.PutUint64(hdr[2:], uint64(n))
	}
	return append(hdr, payload...)
}

func (c *wsConn) writer() {
	ping := time.NewTicker(wsPingInterval)
	defer ping.Stop()
	for {
		select {
		case b := <-c.send:
			c.queued.Add(-int64(len(b)))
			_ = c.c.SetWriteDeadline(time.Now().Add(30 * time.Second))
			if _, err := c.c.Write(b); err != nil {
				// Closing the connection also ends the reader, which would
				// otherwise wait on a peer that stopped reading.
				c.close()
				c.c.Close()
				return
			}
		case <-ping.C:
			_ = c.c.SetWriteDeadline(time.Now().Add(30 * time.Second))
			if _, err := c.c.Write(wsFrame(0x9, nil)); err != nil {
				c.close()
				c.c.Close()
				return
			}
		case <-c.done:
			// Flush what was queued before the close.
			for {
				select {
				case b := <-c.send:
					_ = c.c.SetWriteDeadline(time.Now().Add(5 * time.Second))
					if _, err := c.c.Write(b); err != nil {
						c.c.Close()
						return
					}
				default:
					c.c.Close()
					return
				}
			}
		}
	}
}

// enqueue queues a frame; a client too slow to keep up is dropped.
func (c *wsConn) enqueue(b []byte) bool {
	select {
	case <-c.done:
		return false
	default:
	}
	if c.queued.Add(int64(len(b))) > wsMaxQueued {
		c.queued.Add(-int64(len(b)))
		c.close()
		return false
	}
	select {
	case c.send <- b:
		return true
	default:
		c.queued.Add(-int64(len(b)))
		c.close()
		return false
	}
}

func (c *wsConn) sendText(text []byte) bool { return c.enqueue(wsFrame(0x1, text)) }

// sendJSON is send_json: json.dumps of the content.
func (c *wsConn) sendJSON(v any) bool { return c.sendText(pyJSONDumps(v, true)) }

// closeWith sends a close frame and ends the connection.
func (c *wsConn) closeWith(code uint16) {
	p := make([]byte, 2)
	binary.BigEndian.PutUint16(p, code)
	c.enqueue(wsFrame(0x8, p))
	c.close()
}

func (c *wsConn) close() { c.closeOnce.Do(func() { close(c.done) }) }

// readMessage returns the next text or binary message, answering pings
// and reassembling fragments.
func (c *wsConn) readMessage() (byte, []byte, error) {
	var msg []byte
	var msgOp byte
	for {
		_ = c.c.SetReadDeadline(time.Now().Add(wsReadTimeout))
		h := make([]byte, 2)
		if _, err := io.ReadFull(c.br, h); err != nil {
			return 0, nil, err
		}
		fin, op := h[0]&0x80 != 0, h[0]&0x0f
		if h[1]&0x80 == 0 {
			return 0, nil, errors.New("unmasked client frame")
		}
		n := uint64(h[1] & 0x7f)
		switch n {
		case 126:
			b := make([]byte, 2)
			if _, err := io.ReadFull(c.br, b); err != nil {
				return 0, nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b))
		case 127:
			b := make([]byte, 8)
			if _, err := io.ReadFull(c.br, b); err != nil {
				return 0, nil, err
			}
			n = binary.BigEndian.Uint64(b)
		}
		if n > wsMaxMessage || uint64(len(msg))+n > wsMaxMessage {
			c.closeWith(1009)
			return 0, nil, errors.New("message too big")
		}
		// RFC 6455 5.5: control frames carry at most 125 bytes and are
		// never fragmented. A 1 MiB ping echoed back would queue a
		// megabyte per frame.
		if op >= 0x8 && (n > 125 || !fin) {
			c.closeWith(1002)
			return 0, nil, errors.New("invalid control frame")
		}
		mask := make([]byte, 4)
		if _, err := io.ReadFull(c.br, mask); err != nil {
			return 0, nil, err
		}
		payload := make([]byte, n)
		if _, err := io.ReadFull(c.br, payload); err != nil {
			return 0, nil, err
		}
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
		switch op {
		case 0x8: // close
			c.enqueue(wsFrame(0x8, payload[:min(len(payload), 2)]))
			c.close()
			return 0, nil, io.EOF
		case 0x9: // ping
			c.enqueue(wsFrame(0xA, payload))
			continue
		case 0xA: // pong
			continue
		case 0x0: // continuation
			if msg == nil {
				return 0, nil, errors.New("unexpected continuation")
			}
			msg = append(msg, payload...)
		case 0x1, 0x2:
			msgOp, msg = op, append([]byte{}, payload...)
		default:
			c.closeWith(1002)
			return 0, nil, errors.New("unknown opcode")
		}
		if fin {
			return msgOp, msg, nil
		}
	}
}

// ---------------------------------------------------------------- hub

type wsHub struct {
	mu     sync.Mutex
	groups map[string]map[*wsConn]struct{}
	// perUser counts each user's open sockets (wsMaxPerUser).
	perUser map[int64]int
}

// openFor counts a socket of the user, false when they hold the most
// allowed; each true is matched by a closedFor.
func (h *wsHub) openFor(userID int64) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.perUser == nil {
		h.perUser = map[int64]int{}
	}
	if h.perUser[userID] >= wsMaxPerUser {
		return false
	}
	h.perUser[userID]++
	return true
}

func (h *wsHub) closedFor(userID int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.perUser[userID]--; h.perUser[userID] <= 0 {
		delete(h.perUser, userID)
	}
}

var (
	wsHubOnce sync.Once
	wsHubInst *wsHub
)

func hub() *wsHub {
	wsHubOnce.Do(func() { wsHubInst = &wsHub{groups: map[string]map[*wsConn]struct{}{}} })
	return wsHubInst
}

func (h *wsHub) add(c *wsConn, group string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.groups[group] == nil {
		h.groups[group] = map[*wsConn]struct{}{}
	}
	h.groups[group][c] = struct{}{}
}

func (h *wsHub) discard(c *wsConn, group string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.groups[group], c)
	if len(h.groups[group]) == 0 {
		delete(h.groups, group)
	}
}

func (h *wsHub) removeAll(c *wsConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for g, m := range h.groups {
		delete(m, c)
		if len(m) == 0 {
			delete(h.groups, g)
		}
	}
}

func (h *wsHub) members(group string) []*wsConn {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]*wsConn, 0, len(h.groups[group]))
	for c := range h.groups[group] {
		out = append(out, c)
	}
	return out
}

// ---------------------------------------------------------------- consumer

// websocketView is EventConsumer.
func (s *Server) websocketView(w http.ResponseWriter, r *http.Request) {
	if !isWebsocketUpgrade(r) {
		WriteError(w, ErrNotFound)
		return
	}
	conn, err := wsUpgrade(w, r)
	if err != nil {
		return
	}
	u := auth.UserFrom(r.Context())
	// A page on another site may open the socket, and the browser sends
	// the session cookie with it: such a connection gets no user, and
	// reads no job events.
	if u != nil && u.AuthMethod == "session" && !auth.SameOriginOK(r) {
		u = nil
	}
	if u == nil {
		// Accepted, told to close, then closed (never a bare close).
		conn.sendJSON(NewOMap().Set("close", true))
		conn.closeWith(1000)
		return
	}
	if !hub().openFor(u.ID) {
		conn.sendJSON(NewOMap().Set("close", true))
		conn.closeWith(1008)
		return
	}
	defer hub().closedFor(u.ID)
	conn.sendJSON(NewOMap().Set("accept", true).Set("user", u.ID))
	// The CSRF cookie at connect time is what xrftoken must match.
	xrf := ""
	if c, err := r.Cookie(auth.CSRFCookieName); err == nil {
		xrf = c.Value
	}
	defer func() {
		hub().removeAll(conn)
		conn.close()
	}()
	for {
		op, data, err := conn.readMessage()
		if err != nil {
			return
		}
		if op != 0x1 {
			continue
		}
		if !s.wsReceive(r, u, conn, xrf, data) {
			// An exception in receive_json closed the socket.
			conn.closeWith(1011)
			return
		}
	}
}

// wsEventAccess are the event groups consumer_access knew and the job
// model each one's ids must be.
var wsEventAccess = map[string]string{
	"job_events": "main.job", "workflow_events": "main.workflowjob", "ad_hoc_command_events": "main.adhoccommand",
	"project_update_events": "main.projectupdate", "inventory_update_events": "main.inventoryupdate", "system_job_events": "main.systemjob",
}

// wsReceive is receive_json; false when the old consumer would have
// raised.
func (s *Server) wsReceive(r *http.Request, u *auth.User, conn *wsConn, xrf string, data []byte) bool {
	body := NewOMap()
	if err := json.Unmarshal(data, body); err != nil {
		return false
	}
	tok, _ := body.Get("xrftoken")
	ts, _ := tok.(string)
	if !pyTruthy(tok) || xrf == "" || ts != xrf {
		s.Log.ErrorContext(r.Context(), "access denied to channel, XRF mismatch for "+u.Username)
		conn.sendJSON(NewOMap().Set("error", "access denied to channel"))
		return true
	}
	raw, ok := body.Get("groups")
	if !ok {
		return true
	}
	groups, ok := raw.(*OMap)
	if !ok {
		return false // groups.items() on something else
	}
	newGroups := []string{}
	seen := map[string]bool{}
	current := conn.recorded
	conn.recorded = map[string]bool{} // session['groups'] was popped
	for _, groupName := range groups.Keys() {
		v, _ := groups.Get(groupName)
		list, isList := v.([]any)
		if !isList {
			conn.sendJSON(NewOMap().Set("error", "access denied to channel"))
			s.Log.ErrorContext(r.Context(), fmt.Sprintf("groups must be a list, not %s", pyJSONDumps(groups, true)))
			return true
		}
		for _, oid := range list {
			name := groupName + "-" + pyStr(oid)
			if model, known := wsEventAccess[groupName]; known {
				id, ok := wsObjectID(oid)
				if !ok {
					return false // filter(pk=...) raised
				}
				if !s.wsCanSeeJob(r, u, model, id) {
					conn.sendJSON(NewOMap().Set("error", fmt.Sprintf("access denied to channel %s for resource id %s", groupName, pyStr(oid))))
					continue
				}
			} else if strings.HasSuffix(groupName, "_events") {
				s.Log.ErrorContext(r.Context(), fmt.Sprintf("access denied to channel %q, no access class registered, for %s", groupName, u.Username))
				conn.sendJSON(NewOMap().Set("error", fmt.Sprintf("access denied to channel %s for resource id %s", groupName, pyStr(oid))))
				continue
			}
			if !seen[name] {
				seen[name] = true
				newGroups = append(newGroups, name)
			}
		}
	}
	left, joined := []string{}, []string{}
	for g := range current {
		if !seen[g] {
			left = append(left, g)
			hub().discard(conn, g)
		}
	}
	for _, g := range newGroups {
		if !current[g] {
			joined = append(joined, g)
			hub().add(conn, g)
		}
	}
	for _, g := range newGroups {
		conn.recorded[g] = true
	}
	conn.sendJSON(NewOMap().Set("groups_current", newGroups).Set("groups_left", left).Set("groups_joined", joined))
	return true
}

// wsObjectID is the primary key Django would have looked the id up by.
func wsObjectID(v any) (int64, bool) {
	switch t := v.(type) {
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return i, true
		}
		if f, err := t.Float64(); err == nil && f == math.Trunc(f) {
			return int64(f), true
		}
	case string:
		if i, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64); err == nil {
			return i, true
		}
	case bool:
		if t {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}

// wsCanSeeJob is user_access.get_queryset().filter(pk=oid).exists() for
// the group's job model.
func (s *Server) wsCanSeeJob(r *http.Request, u *auth.User, model string, id int64) bool {
	var ct int64
	if err := s.Q().QueryRow(r.Context(), `SELECT polymorphic_ctype_id FROM main_unifiedjob WHERE id = $1`, id).Scan(&ct); err != nil || s.CT.Model(ct) != model {
		return false
	}
	return s.canReadUnifiedJob(r, u, id)
}

// ---------------------------------------------------------------- publishing

type wsNotice struct {
	Group string      `json:"g"`
	Text  string      `json:"t,omitempty"`
	Event *wsEventRef `json:"e,omitempty"`
}

type wsEventRef struct {
	Table      string    `json:"table"`
	ID         int64     `json:"id"`
	JobCreated time.Time `json:"job_created"`
}

// emitChannel is emit_channel_notification: the payload, dumped as
// json.dumps did, goes to every subscriber of group on every web process.
func (s *Server) emitChannel(ctx context.Context, group string, payload *OMap) {
	s.publishNotice(ctx, wsNotice{Group: group, Text: string(pyJSONDumps(payload, true))})
}

func (s *Server) publishNotice(ctx context.Context, n wsNotice) {
	b, _ := json.Marshal(n)
	if len(b) > 7900 {
		s.Log.WarnContext(ctx, fmt.Sprintf("websocket message for group %s too large for NOTIFY (%d bytes)", n.Group, len(b)), extlog.LoggerAttr, extlog.BroadcastWebsocketLogger)
		return
	}
	if _, err := s.Q().Exec(ctx, `SELECT pg_notify($1, $2)`, WebsocketChannel, string(b)); err != nil {
		s.Log.WarnContext(ctx, "websocket notify: "+err.Error(), extlog.LoggerAttr, extlog.BroadcastWebsocketLogger)
	}
}

// ListenWebsocket relays the NOTIFY messages to this process's
// subscribers until ctx ends.
func (s *Server) ListenWebsocket(ctx context.Context) {
	for ctx.Err() == nil {
		conn, err := s.DB.Pool.Acquire(ctx)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}
		if _, err := conn.Exec(ctx, "LISTEN "+WebsocketChannel); err != nil {
			conn.Release()
			time.Sleep(5 * time.Second)
			continue
		}
		for ctx.Err() == nil {
			n, err := conn.Conn().WaitForNotification(ctx)
			if err != nil {
				break
			}
			var msg wsNotice
			if json.Unmarshal([]byte(n.Payload), &msg) != nil {
				continue
			}
			// The metrics group goes to no client: it carries a task
			// process's subsystem metrics to the web processes.
			if msg.Group == "metrics" {
				storeSubsystemMetrics(msg.Text)
				continue
			}
			members := hub().members(msg.Group)
			if len(members) == 0 {
				continue
			}
			text := msg.Text
			if msg.Event != nil {
				p, err := s.eventPayload(ctx, msg.Event)
				if err != nil {
					continue
				}
				text = string(pyJSONDumps(p, true))
			}
			frame := wsFrame(0x1, []byte(text))
			for _, c := range members {
				c.enqueue(frame)
			}
		}
		conn.Release()
	}
}

// eventRelations are emit_event_detail's relation per event table.
var eventRelations = map[string]string{
	"main_jobevent": "job_id", "main_adhoccommandevent": "ad_hoc_command_id", "main_projectupdateevent": "project_update_id",
	"main_inventoryupdateevent": "inventory_update_id", "main_systemjobevent": "system_job_id",
}

var eventGroups = map[string]string{
	"main_jobevent": "job_events", "main_adhoccommandevent": "ad_hoc_command_events", "main_projectupdateevent": "project_update_events",
	"main_inventoryupdateevent": "inventory_update_events", "main_systemjobevent": "system_job_events",
}

// EmitEventDetail is emit_event_detail for a stored event: with live
// updates off only the events the UI needs to draw a summary go out.
func (s *Server) EmitEventDetail(ctx context.Context, table string, eventID, jobID int64, jobCreated time.Time, event string) {
	group, ok := eventGroups[table]
	if !ok {
		return
	}
	if !s.Settings.Bool(ctx, "UI_LIVE_UPDATES_ENABLED") {
		switch event {
		case "playbook_on_play_start", "playbook_on_task_start", "playbook_on_stats", "EOF":
		default:
			return
		}
	}
	s.publishNotice(ctx, wsNotice{Group: fmt.Sprintf("%s-%d", group, jobID), Event: &wsEventRef{Table: table, ID: eventID, JobCreated: jobCreated}})
}

// eventPayload reads an event back into emit_event_detail's message.
func (s *Server) eventPayload(ctx context.Context, ref *wsEventRef) (*OMap, error) {
	rel, ok := eventRelations[ref.Table]
	if !ok {
		return nil, fmt.Errorf("unknown event table %s", ref.Table)
	}
	playbook := ref.Table == "main_jobevent" || ref.Table == "main_projectupdateevent"
	cols := "id, " + rel + ", created, stdout, counter, uuid, start_line, end_line, event_data"
	switch {
	case ref.Table == "main_jobevent":
		cols += ", event, failed, changed, parent_uuid, play, role, task"
	case playbook:
		cols += ", event, failed, changed, '', play, role, task"
	case ref.Table == "main_adhoccommandevent":
		cols += ", event, failed, changed"
	}
	row := s.Q().QueryRow(ctx, `SELECT `+cols+` FROM `+ref.Table+` WHERE id = $1 AND job_created = $2`, ref.ID, ref.JobCreated)
	var (
		id, jobID, counter, start, end int64
		created                        time.Time
		stdout, uuid                   string
		data                           []byte
		event                          = "verbose"
		failed, changed                bool
		parent, play, role, task       string
	)
	dest := []any{&id, &jobID, &created, &stdout, &counter, &uuid, &start, &end, &data}
	switch {
	case playbook:
		dest = append(dest, &event, &failed, &changed, &parent, &play, &role, &task)
	case ref.Table == "main_adhoccommandevent":
		dest = append(dest, &event, &failed, &changed)
	}
	if err := row.Scan(dest...); err != nil {
		return nil, err
	}
	group := eventGroups[ref.Table]
	url := ""
	switch ref.Table {
	case "main_jobevent":
		url = fmt.Sprintf("/api/v2/job_events/%d", id)
	case "main_adhoccommandevent":
		url = fmt.Sprintf("/api/v2/ad_hoc_command_events/%d", id)
	}
	var eventData any = NewOMap()
	if len(data) > 0 {
		ed := NewOMap()
		if json.Unmarshal(data, ed) == nil {
			eventData = ed
		}
	}
	// BasePlaybookEvent.event_level; command events have none.
	var levelV any = ""
	if playbook {
		lvl := 0
		if t, ok := eventTypes[event]; ok {
			lvl = t.Level
		}
		levelV = lvl
	}
	ts := pyISO(&created)
	o := NewOMap().Set("id", id).Set(strings.TrimSuffix(rel, "_id"), jobID).Set("created", ts).Set("modified", ts).Set("group_name", group).Set("url", url).
		Set("stdout", stdout).Set("counter", counter).Set("uuid", uuid).Set("parent_uuid", parent).Set("start_line", start).Set("end_line", end).
		Set("event", event).Set("event_data", eventData).Set("failed", failed).Set("changed", changed).Set("event_level", levelV).
		Set("play", play).Set("role", role).Set("task", task)
	return o, nil
}

// unifiedJobTypeNames are job_type_name by model.
var unifiedJobTypeNames = map[string]string{
	"main.job": "job", "main.projectupdate": "project_update", "main.inventoryupdate": "inventory_update", "main.adhoccommand": "ad_hoc_command",
	"main.systemjob": "system_job", "main.workflowjob": "workflow_job", "main.workflowapproval": "workflow_approval",
}

// EmitJobStatus is _websocket_emit_status: the new status on jobs-
// status_changed and, for a job a workflow spawned, on its workflow's
// events.
func (s *Server) EmitJobStatus(ctx context.Context, id int64, status string) {
	var (
		ct              int64
		ujt, igID       *int64
		finished        *time.Time
		launchType      string
		igName          *string
		nodeID, wfJobID *int64
	)
	if err := s.Q().QueryRow(ctx, `SELECT uj.polymorphic_ctype_id, uj.unified_job_template_id, uj.instance_group_id, uj.finished, uj.launch_type, ig.name
		FROM main_unifiedjob uj LEFT JOIN main_instancegroup ig ON ig.id = uj.instance_group_id WHERE uj.id = $1`, id).Scan(&ct, &ujt, &igID, &finished, &launchType, &igName); err != nil {
		return
	}
	o := NewOMap().Set("unified_job_id", id).Set("status", status)
	if status == "running" {
		if igName != nil {
			o.Set("instance_group_name", *igName)
		} else {
			o.Set("instance_group_name", nil)
		}
	} else if (status == "successful" || status == "failed" || status == "canceled") && finished != nil {
		o.Set("finished", finished.UTC().Format("2006-01-02T15:04:05.000000Z"))
	}
	model := s.CT.Model(ct)
	o.Set("type", unifiedJobTypeNames[model])
	spawned := launchType == "workflow"
	if spawned {
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT id, workflow_job_id FROM main_workflowjobnode WHERE job_id = $1`, id).Scan(&nodeID, &wfJobID)
		o.Set("workflow_job_id", wfJobID).Set("workflow_node_id", nodeID)
	}
	// The subclasses' websocket_emit_data: a project update names its
	// project, an inventory update its source and the source's inventory.
	switch model {
	case "main.projectupdate":
		var project *int64
		if err := db.Tolerant(s.Q()).QueryRow(ctx, `SELECT project_id FROM main_projectupdate WHERE unifiedjob_ptr_id = $1`, id).Scan(&project); err == nil && project != nil {
			o.Set("project_id", *project)
		}
	case "main.inventoryupdate":
		var source, inventory *int64
		if err := db.Tolerant(s.Q()).QueryRow(ctx, `SELECT iu.inventory_source_id, src.inventory_id FROM main_inventoryupdate iu
			JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = iu.inventory_source_id WHERE iu.unifiedjob_ptr_id = $1`, id).Scan(&source, &inventory); err == nil {
			if source != nil {
				o.Set("inventory_source_id", *source)
			}
			if inventory != nil {
				o.Set("inventory_id", *inventory)
			}
		}
	}
	o.Set("group_name", "jobs")
	if ujt != nil {
		o.Set("unified_job_template_id", *ujt)
	}
	s.emitChannel(ctx, "jobs-status_changed", o)
	if spawned && wfJobID != nil {
		// workflow_job_template_id: the spawned job's own template.
		o.Set("group_name", "workflow_events")
		o.Set("workflow_job_template_id", ujt)
		s.emitChannel(ctx, fmt.Sprintf("workflow_events-%d", *wfJobID), o)
	}
}

// EmitJobSummary is the callback receiver's jobs-summary once a job's
// final event is saved.
func (s *Server) EmitJobSummary(ctx context.Context, id, finalCounter int64) {
	s.emitChannel(ctx, "jobs-summary", NewOMap().Set("group_name", "jobs").Set("unified_job_id", id).Set("final_counter", finalCounter))
}

// EmitScheduleChanged is Schedule.save's schedules-changed.
func (s *Server) EmitScheduleChanged(ctx context.Context, id int64) {
	s.emitChannel(ctx, "schedules-changed", NewOMap().Set("id", id).Set("group_name", "schedules"))
}

// EmitInventoryStatus is inventories-status_changed.
func (s *Server) EmitInventoryStatus(ctx context.Context, id int64, status string) {
	s.emitChannel(ctx, "inventories-status_changed", NewOMap().Set("group_name", "inventories").Set("inventory_id", id).Set("status", status))
}
