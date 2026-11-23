package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rbac"
)

// SerCtx carries per-request serialization state: who is asking, whether
// this is a detail view (which adds named_url), which summary fields were
// requested, and caches of related rows loaded in batches for a page.
type SerCtx struct {
	S      *Server
	R      *http.Request
	User   *auth.User
	Detail bool
	// IsDetailView is true when the URL names an object (detail views and
	// sub-lists of one), which is when the old serializers added extra
	// summary fields such as resolved_environment.
	IsDetailView bool
	// NoCaps suppresses user_capabilities (the tree view omitted them).
	NoCaps bool

	summaryNone   bool
	summaryFilter map[string]bool

	// held caches the roles the user holds, loaded on the first
	// capability check (see heldRoles).
	held       *rbac.Held
	heldLoaded bool

	userExtras map[int64]*userExtras

	// tx, when set, is the transaction the loaders read through (InTx).
	tx db.Querier

	users map[int64]models.UserSummary
	orgs  map[int64]models.NameSummary
	ees   map[int64]models.EESummary
	jobs  map[int64]models.JobSummary
	creds map[int64]models.CredentialSummary
}

// NewSerCtx prepares a context for a request.
func (s *Server) NewSerCtx(r *http.Request, detail bool) *SerCtx {
	c := &SerCtx{S: s, R: r, User: auth.UserFrom(r.Context()), Detail: detail, IsDetailView: detail || r.PathValue("id") != ""}
	if raw, ok := r.URL.Query()["summary_fields"]; ok && len(raw) > 0 {
		v := strings.TrimSpace(raw[0])
		switch strings.ToLower(v) {
		case "none", "false", "0", "":
			c.summaryNone = true
		default:
			c.summaryFilter = map[string]bool{}
			for _, n := range strings.Split(v, ",") {
				if n = strings.TrimSpace(n); n != "" {
					c.summaryFilter[n] = true
				}
			}
		}
	}
	return c
}

// Ctx returns the request context.
func (c *SerCtx) Ctx() context.Context { return c.R.Context() }

// Q is what the lazy loaders read through: the pool, or the transaction
// given to InTx.
func (c *SerCtx) Q() db.Querier {
	if c.tx != nil {
		return c.tx
	}
	return c.S.Q()
}

// InTx returns a copy of c that loads through q. Rendering inside a
// writer's transaction must not take a second pool connection: with every
// connection held by such a writer, the pool deadlocks.
func (c *SerCtx) InTx(q db.Querier) *SerCtx {
	cp := *c
	cp.tx = q
	return &cp
}

// WantSummary reports whether a summary key should be produced.
func (c *SerCtx) WantSummary(key string) bool {
	if c.summaryNone {
		return false
	}
	if key == "user_capabilities" && c.NoCaps {
		return false
	}
	if c.summaryFilter == nil {
		return true
	}
	return c.summaryFilter[key]
}

// putSummary sets summary[key] to the block load renders for id, when the
// key is wanted and the block loads.
func (c *SerCtx) putSummary(summary *OMap, key string, load func(*int64) *OMap, id *int64) {
	if c.WantSummary(key) {
		if v := load(id); v != nil {
			summary.Set(key, v)
		}
	}
}

// setURL sets related[key] to id's detail URL in coll, when id is set.
func setURL(related *OMap, key, coll string, id *int64) {
	if id != nil {
		related.Set(key, URLFor(coll, *id))
	}
}

// SummaryOff reports whether summary_fields was asked to be empty.
func (c *SerCtx) SummaryOff() bool { return c.summaryNone }

func uniqueIDs(ptrs ...*int64) []int64 {
	seen := map[int64]bool{}
	var out []int64
	for _, p := range ptrs {
		if p != nil && !seen[*p] {
			seen[*p] = true
			out = append(out, *p)
		}
	}
	return out
}

// PreloadUsers batch-loads user summaries.
func (c *SerCtx) PreloadUsers(ids []int64) error {
	m, err := models.LoadUserSummaries(c.Ctx(), c.Q(), ids)
	if err != nil {
		return err
	}
	if c.users == nil {
		c.users = m
	} else {
		for k, v := range m {
			c.users[k] = v
		}
	}
	return nil
}

// PreloadOrgs batch-loads organization summaries.
func (c *SerCtx) PreloadOrgs(ids []int64) error {
	m, err := models.LoadOrganizationSummaries(c.Ctx(), c.Q(), ids)
	if err != nil {
		return err
	}
	if c.orgs == nil {
		c.orgs = m
	} else {
		for k, v := range m {
			c.orgs[k] = v
		}
	}
	return nil
}

// PreloadEEs batch-loads execution environment summaries.
func (c *SerCtx) PreloadEEs(ids []int64) error {
	m, err := models.LoadEESummaries(c.Ctx(), c.Q(), ids)
	if err != nil {
		return err
	}
	if c.ees == nil {
		c.ees = m
	} else {
		for k, v := range m {
			c.ees[k] = v
		}
	}
	return nil
}

// PreloadJobs batch-loads unified job summaries.
func (c *SerCtx) PreloadJobs(ids []int64) error {
	m, err := models.LoadJobSummaries(c.Ctx(), c.Q(), c.S.CT, ids)
	if err != nil {
		return err
	}
	if c.jobs == nil {
		c.jobs = m
	} else {
		for k, v := range m {
			c.jobs[k] = v
		}
	}
	return nil
}

// PreloadCredentials batch-loads credential summaries.
func (c *SerCtx) PreloadCredentials(ids []int64) error {
	m, err := models.LoadCredentialSummaries(c.Ctx(), c.Q(), ids)
	if err != nil {
		return err
	}
	if c.creds == nil {
		c.creds = m
	} else {
		for k, v := range m {
			c.creds[k] = v
		}
	}
	return nil
}

// logLoad logs an on-demand summary load that failed: the summary
// helpers have no error to return, and the block is left out.
func (c *SerCtx) logLoad(err error) {
	if err != nil {
		c.S.Log.ErrorContext(c.Ctx(), "loading a summary", "path", c.R.URL.Path, "err", err)
	}
}

// UserSummary renders a user block, loading on demand.
func (c *SerCtx) UserSummary(id *int64) *OMap {
	if id == nil {
		return nil
	}
	if _, ok := c.users[*id]; !ok {
		c.logLoad(c.PreloadUsers([]int64{*id}))
	}
	u, ok := c.users[*id]
	if !ok {
		return nil
	}
	return NewOMap().Set("id", u.ID).Set("username", u.Username).Set("first_name", u.FirstName).Set("last_name", u.LastName)
}

// OrgSummary renders an organization block.
func (c *SerCtx) OrgSummary(id *int64) *OMap {
	if id == nil {
		return nil
	}
	if _, ok := c.orgs[*id]; !ok {
		c.logLoad(c.PreloadOrgs([]int64{*id}))
	}
	o, ok := c.orgs[*id]
	if !ok {
		return nil
	}
	return NewOMap().Set("id", o.ID).Set("name", o.Name).Set("description", o.Description)
}

// EESummary renders an execution environment block.
func (c *SerCtx) EESummary(id *int64) *OMap {
	if id == nil {
		return nil
	}
	if _, ok := c.ees[*id]; !ok {
		c.logLoad(c.PreloadEEs([]int64{*id}))
	}
	e, ok := c.ees[*id]
	if !ok {
		return nil
	}
	return NewOMap().Set("id", e.ID).Set("name", e.Name).Set("description", e.Description).Set("image", e.Image)
}

// CredentialSummary renders a credential block.
func (c *SerCtx) CredentialSummary(id *int64) *OMap {
	if id == nil {
		return nil
	}
	if _, ok := c.creds[*id]; !ok {
		c.logLoad(c.PreloadCredentials([]int64{*id}))
	}
	cr, ok := c.creds[*id]
	if !ok {
		return nil
	}
	return NewOMap().Set("id", cr.ID).Set("name", cr.Name).Set("description", cr.Description).Set("kind", cr.Kind).Set("cloud", cr.Cloud).Set("kubernetes", cr.Kubernetes).Set("credential_type_id", cr.CredentialTypeID)
}

// Job returns a cached job summary.
func (c *SerCtx) Job(id *int64) (models.JobSummary, bool) {
	if id == nil {
		return models.JobSummary{}, false
	}
	if _, ok := c.jobs[*id]; !ok {
		c.logLoad(c.PreloadJobs([]int64{*id}))
	}
	j, ok := c.jobs[*id]
	return j, ok
}

// LastJobSummary renders the last_job block: id,name,description,finished,status,failed.
func (c *SerCtx) LastJobSummary(id *int64) *OMap {
	j, ok := c.Job(id)
	if !ok {
		return nil
	}
	o := NewOMap().Set("id", j.ID).Set("name", j.Name).Set("description", j.Description).Set("finished", models.FormatTimePtr(j.Finished)).Set("status", j.Status).Set("failed", j.Failed)
	if j.CanceledOn != nil {
		o.Set("canceled_on", models.FormatTime(*j.CanceledOn))
	}
	return o
}

// UpdateSummary renders last_update/current_update/current_job: id,name,description,status,failed.
func (c *SerCtx) UpdateSummary(id *int64) *OMap {
	j, ok := c.Job(id)
	if !ok {
		return nil
	}
	return NewOMap().Set("id", j.ID).Set("name", j.Name).Set("description", j.Description).Set("status", j.Status).Set("failed", j.Failed)
}

// Base writes the common leading fields in the order every serializer used.
func Base(o *OMap, id int64, typ, url string, related, summary *OMap, created, modified time.Time, name, description string) *OMap {
	if related == nil {
		related = NewOMap()
	}
	if summary == nil {
		summary = NewOMap()
	}
	o.Set("id", id).Set("type", typ).Set("url", url).Set("related", related).Set("summary_fields", summary)
	o.Set("created", models.FormatTime(created)).Set("modified", models.FormatTime(modified))
	o.Set("name", name).Set("description", description)
	return o
}

// RolesSummary renders summary_fields.object_roles for an object: each role
// field to {description, name, id}, in the model's declaration order.
func (c *SerCtx) RolesSummary(modelVerbose string, fields []string, roleID func(string) *int64) *OMap {
	out := NewOMap()
	for _, f := range fields {
		id := roleID(f)
		if id == nil {
			continue
		}
		out.Set(f, NewOMap().Set("description", rbacRoleDescription(c.Loc(), f, modelVerbose)).Set("name", rbacRoleName(c.Loc(), f)).Set("id", *id))
	}
	return out
}

// HasRole reports whether the request user holds the role, superusers
// always do.
func (c *SerCtx) HasRole(roleID *int64) bool {
	if c.User == nil {
		return false
	}
	if c.User.IsSuperuser {
		return true
	}
	if roleID == nil {
		return false
	}
	if h := c.heldRoles(); h != nil {
		return h.Has(*roleID)
	}
	ok, err := rbac.UserHasRole(c.Ctx(), c.Q(), c.User.ID, *roleID)
	return err == nil && ok
}

// heldRoles loads, once per read-only request, every role the user holds,
// so that the capability checks a page makes for each of its rows are map
// lookups rather than one query apiece. It returns nil, and the checks
// fall back to querying, for a request that writes, when the load fails,
// or when the set is too large to be worth holding (a system auditor holds
// every read role).
func (c *SerCtx) heldRoles() *rbac.Held {
	if !c.heldLoaded {
		c.heldLoaded = true
		// Only read-only requests: a handler that checks, writes (perhaps
		// granting a role) and then serializes must see the write.
		if hasReadMemo(c.Ctx()) {
			c.held = c.S.heldRoles(c.Ctx(), c.User.ID)
		}
	}
	return c.held
}

// heldRoles is the user's held roles, loaded once per read-only request
// (see SerCtx.heldRoles), or nil.
func (s *Server) heldRoles(ctx context.Context, userID int64) *rbac.Held {
	return memoized(ctx, "held/"+itoa(userID), func() *rbac.Held {
		h, err := rbac.LoadHeld(ctx, s.Q(), userID, heldRolesLimit)
		if err != nil {
			return nil
		}
		return h
	})
}

// heldRolesLimit bounds the roles heldRoles keeps in memory.
const heldRolesLimit = 100000

// HasRoleOn reports whether the user holds roleField on an object.
func (c *SerCtx) HasRoleOn(ctKey string, objectID int64, roleField string) bool {
	if c.User == nil {
		return false
	}
	if c.User.IsSuperuser {
		return true
	}
	if h := c.heldRoles(); h != nil {
		return h.HasOn(c.S.CT.ID(ctKey), objectID, roleField)
	}
	ok, err := rbac.UserHasRoleOn(c.Ctx(), c.Q(), c.User.ID, c.S.CT.ID(ctKey), objectID, roleField)
	return err == nil && ok
}

// Caps renders a user_capabilities block from an ordered list of pairs.
func Caps(pairs ...any) *OMap {
	o := NewOMap()
	for i := 0; i+1 < len(pairs); i += 2 {
		o.Set(pairs[i].(string), pairs[i+1])
	}
	return o
}
