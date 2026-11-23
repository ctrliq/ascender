package api

import (
	"context"
	"crypto/subtle"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The provisioning callback (JobTemplateCallback): a host that has just
// been provisioned asks for the template to run against it, naming the
// template's host config key instead of authenticating. The host is
// recognized by the address the request came from.

// callbackRemoteHosts are the names and addresses a request came from:
// the REMOTE_HOST_HEADERS values (custom headers only from the
// PROXY_IP_ALLOWED_LIST proxies, when that is set), their reverse DNS
// names, and no .arpa names.
func (s *Server) callbackRemoteHosts(r *http.Request) map[string]bool {
	ctx := r.Context()
	remoteAddr := r.RemoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		remoteAddr = h
	}
	meta := func(name string) string {
		switch name {
		case "REMOTE_ADDR":
			return remoteAddr
		case "REMOTE_HOST":
			return ""
		}
		if strings.HasPrefix(name, "HTTP_") {
			return r.Header.Get(strings.ReplaceAll(strings.TrimPrefix(name, "HTTP_"), "_", "-"))
		}
		return ""
	}
	var headers []string
	if v, ok := s.Settings.Get(ctx, "REMOTE_HOST_HEADERS"); ok {
		for _, h := range toAnyList(v) {
			headers = append(headers, fmt.Sprint(h))
		}
	}
	if len(headers) == 0 {
		headers = []string{"REMOTE_ADDR", "REMOTE_HOST"}
	}
	var allowed []string
	if v, ok := s.Settings.Get(ctx, "PROXY_IP_ALLOWED_LIST"); ok {
		for _, h := range toAnyList(v) {
			allowed = append(allowed, fmt.Sprint(h))
		}
	}
	trustCustom := len(allowed) == 0
	for _, a := range allowed {
		if a == remoteAddr {
			trustCustom = true
		}
	}
	hosts := map[string]bool{}
	for _, h := range headers {
		if strings.HasPrefix(h, "HTTP_") && !trustCustom {
			continue
		}
		for _, v := range strings.Split(meta(h), ",") {
			if v = strings.TrimSpace(v); v != "" {
				hosts[v] = true
			}
		}
	}
	lctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	for h := range copyKeys(hosts) {
		if net.ParseIP(h) == nil {
			continue
		}
		names, err := callbackDNS.Addr(lctx, h)
		if err != nil {
			continue
		}
		for _, n := range names {
			hosts[strings.TrimSuffix(n, ".")] = true
		}
	}
	for h := range hosts {
		if strings.HasSuffix(h, ".arpa") {
			delete(hosts, h)
		}
	}
	return hosts
}

func copyKeys(m map[string]bool) map[string]bool {
	out := make(map[string]bool, len(m))
	for k := range m {
		out[k] = true
	}
	return out
}

func toAnyList(v any) []any {
	l, _ := v.([]any)
	return l
}

type callbackHost struct {
	ID   int64
	Name string
}

// findMatchingHosts is find_matching_hosts: the inventory's hosts whose
// effective name (ansible_host, else ansible_ssh_host, else the name) is
// one the request came from, or resolves to an address it came from.
func (s *Server) findMatchingHosts(r *http.Request, inventoryID int64) ([]callbackHost, error) {
	remote := s.callbackRemoteHosts(r)
	if len(remote) == 0 {
		return nil, nil
	}
	rows, err := s.Q().Query(r.Context(), `SELECT id, name, variables FROM main_host WHERE inventory_id = $1 ORDER BY id`, inventoryID)
	if err != nil {
		return nil, err
	}
	mappings := map[string][]callbackHost{}
	var order []string
	for rows.Next() {
		var h callbackHost
		var vars string
		if err := rows.Scan(&h.ID, &h.Name, &vars); err != nil {
			rows.Close()
			return nil, err
		}
		name := h.Name
		if v, err := ParseVars(vars); err == nil {
			for _, key := range []string{"ansible_ssh_host", "ansible_host"} {
				if sv, ok := v[key].(string); ok {
					name = sv
				}
			}
		}
		if _, seen := mappings[name]; !seen {
			order = append(order, name)
		}
		mappings[name] = append(mappings[name], h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	matches := map[int64]callbackHost{}
	for h := range remote {
		for _, m := range mappings[h] {
			matches[m.ID] = m
		}
	}
	if len(matches) != 1 {
		lctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		for _, name := range matchByDNS(lctx, callbackDNS, order, remote) {
			for _, m := range mappings[name] {
				matches[m.ID] = m
			}
		}
	}
	out := make([]callbackHost, 0, len(matches))
	for _, m := range matches {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func callbackMessage(w http.ResponseWriter, msg string) error {
	WriteJSON(w, http.StatusBadRequest, NewOMap().Set("msg", msg))
	return nil
}

// jobTemplateCallbackGet shows the host config key and the hosts the
// request matches, to a user who can see the template.
func (s *Server) jobTemplateCallbackGet(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("JobTemplate")
	}
	t, err := models.GetJobTemplate(r.Context(), s.Q(), id)
	if err != nil {
		if db.IsNoRows(err) {
			return NotFoundFor("JobTemplate")
		}
		return err
	}
	if !u.IsSuperuser && !u.IsSystemAuditor && !s.NewSerCtx(r, true).HasRole(t.ReadRoleID) {
		return ErrForbidden
	}
	names := []string{}
	if t.InventoryID != nil {
		hosts, err := s.findMatchingHosts(r, *t.InventoryID)
		if err != nil {
			return err
		}
		for _, h := range hosts {
			names = append(names, h.Name)
		}
	}
	WriteJSON(w, http.StatusOK, NewOMap().Set("host_config_key", t.HostConfigKey).Set("matching_hosts", names))
	return nil
}

// jobTemplateCallbackPost launches the template against the host the
// request came from. The host config key is the only permission check.
func (s *Server) jobTemplateCallbackPost(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	key := ""
	var extraVars any
	hasExtra := false
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		body, err := ReadBody(r)
		if err != nil {
			return err
		}
		if v, ok := body.Get("host_config_key"); ok && v != nil {
			key = fmt.Sprint(v)
		}
		if v, ok := body.Get("extra_vars"); ok && v != nil {
			extraVars, hasExtra = v, true
		}
	} else {
		if err := r.ParseForm(); err == nil {
			key = r.PostForm.Get("host_config_key")
		}
	}
	if key == "" {
		return ErrForbidden
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("JobTemplate")
	}
	t, err := models.GetJobTemplate(ctx, s.Q(), id)
	if err != nil {
		if db.IsNoRows(err) {
			return NotFoundFor("JobTemplate")
		}
		return err
	}
	if t.HostConfigKey == "" || subtle.ConstantTimeCompare([]byte(t.HostConfigKey), []byte(key)) != 1 {
		return ErrForbidden
	}
	if t.InventoryID == nil {
		return callbackMessage(w, "Cannot start automatically, an inventory is required.")
	}
	hosts, err := s.findMatchingHosts(r, *t.InventoryID)
	if err != nil {
		return err
	}
	// No single match: sync the inventory's update-on-launch sources that
	// are due, wait for them, and look again.
	var alreadyUpdated []int64
	if len(hosts) != 1 {
		rows, err := s.Q().Query(ctx, `SELECT `+models.InventorySourceColumns+` FROM `+models.InventorySourceFrom+` WHERE src.inventory_id = $1 AND src.update_on_launch = true ORDER BY ujt.id`, *t.InventoryID)
		if err != nil {
			return err
		}
		var srcs []*models.InventorySource
		for rows.Next() {
			src, err := models.ScanInventorySource(rows)
			if err != nil {
				rows.Close()
				return err
			}
			srcs = append(srcs, src)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		var updates []int64
		for _, src := range srcs {
			// needs_update_on_launch
			if src.Source == "" || (src.LastJobRun != nil && src.LastJobRun.Add(time.Duration(src.UpdateCacheTimeout)*time.Second).After(time.Now())) {
				continue
			}
			iu, err := s.CreateInventoryUpdate(ctx, src, nil, "callback", nil)
			if err != nil {
				return err
			}
			updates = append(updates, iu.ID)
		}
		for len(updates) > 0 {
			var active int
			if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM main_unifiedjob WHERE id = ANY($1) AND status IN ('pending', 'waiting', 'running')`, updates).Scan(&active); err != nil {
				return err
			}
			if active == 0 {
				break
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Second):
			}
		}
		if len(updates) > 0 {
			rows, err := s.Q().Query(ctx, `SELECT iu.inventory_source_id FROM main_inventoryupdate iu JOIN main_unifiedjob uj ON uj.id = iu.unifiedjob_ptr_id WHERE uj.id = ANY($1) AND uj.status = 'successful' ORDER BY uj.id`, updates)
			if err != nil {
				return err
			}
			for rows.Next() {
				var sid int64
				if err := rows.Scan(&sid); err != nil {
					rows.Close()
					return err
				}
				alreadyUpdated = append(alreadyUpdated, sid)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
		}
		if hosts, err = s.findMatchingHosts(r, *t.InventoryID); err != nil {
			return err
		}
	}
	switch {
	case len(hosts) == 0:
		return callbackMessage(w, "No matching host could be found!")
	case len(hosts) > 1:
		return callbackMessage(w, "Multiple hosts matched the request!")
	}
	host := hosts[0]
	// can_start_without_user_input
	tcreds, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return err
	}
	var vars map[string]any
	if hasExtra {
		switch v := extraVars.(type) {
		case string:
			vars, _ = ParseVars(v)
		case *OMap:
			vars = v.ToMap()
		case map[string]any:
			vars = v
		}
		if refusesCiphertext(auth.UserFrom(r.Context()), vars) {
			return BadRequest(encryptedValueMsg)
		}
	}
	variablesNeeded := false
	if hasExtra && pyTruthy(extraVars) {
		for _, name := range variablesNeededToStart(t) {
			if _, ok := vars[name]; !ok {
				variablesNeeded = true
				break
			}
		}
	} else if len(variablesNeededToStart(t)) > 0 {
		variablesNeeded = true
	}
	if (!hasExtra && templateAsks(t)) || len(passwordsNeeded(tcreds[t.ID])) > 0 || variablesNeeded {
		return callbackMessage(w, "Cannot start automatically, user input required!")
	}
	limit := host.Name
	var pending bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_job j JOIN main_unifiedjob uj ON uj.id = j.unifiedjob_ptr_id
		WHERE j.job_template_id = $1 AND j.limit = $2 AND uj.status IN ('pending', 'waiting', 'running'))`, t.ID, limit).Scan(&pending); err != nil {
		return err
	}
	if pending {
		return callbackMessage(w, "Host callback job already pending.")
	}
	acc := &acceptedPrompts{Ignored: NewOMap()}
	acc.Limit = &limit
	if hasExtra && t.AskVariablesOnLaunch {
		clean := map[string]any{}
		for k, v := range vars {
			if !strings.HasPrefix(k, "ansible_") {
				clean[k] = v
			}
		}
		acc.ExtraVars, acc.HasExtraVars = clean, true
	}
	if len(alreadyUpdated) > 0 {
		acc.StartArgs = map[string]any{"inventory_sources_already_updated": alreadyUpdated}
	}
	outcome, err := s.createJobFromTemplate(ctx, nil, t, acc, tcreds[t.ID], map[string]string{}, "callback", nil, spawnPrevent{slicing: true})
	if err != nil {
		return err
	}
	if outcome.Job == nil {
		return callbackMessage(w, "Error starting job!")
	}
	w.Header().Set("Location", URLFor("jobs", outcome.Job.ID))
	w.WriteHeader(http.StatusCreated)
	return nil
}
