package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/models"
)

// preStartVerboseNames are the model verbose names pre_start titled in its
// credential message.
var preStartVerboseNames = map[string]string{
	"main.job": "Job", "main.projectupdate": "Project Update", "main.inventoryupdate": "Inventory Update",
	"main.systemjob": "System Job", "main.adhoccommand": "Ad Hoc Command",
}

// preStartCheck is UnifiedJob.pre_start as the task manager ran it when it
// moved a job to waiting: every credential must provide its type's
// required inputs (or take them from an input source), and the passwords
// the job's credentials prompt for must be in its start arguments. It
// returns the explanation when the job cannot start.
func (d *Dispatcher) preStartCheck(ctx context.Context, id, ctype int64) (string, error) {
	model := ""
	for m := range preStartVerboseNames {
		if d.CT.ID(m) == ctype {
			model = m
		}
	}
	creds, err := models.JobCredentials(ctx, d.DB.Pool, []int64{id})
	if err != nil {
		return "", err
	}
	list := creds[id]
	// self.credentials.all() came back in Credential's default order, by name.
	sort.SliceStable(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	for _, c := range list {
		missing, err := d.missingCredentialInputs(ctx, c)
		if err != nil {
			return "", err
		}
		if len(missing) > 0 {
			sort.Strings(missing)
			return fmt.Sprintf("%s cannot start because Credential %s does not provide one or more required fields (%s).", preStartVerboseNames[model], c.Name, strings.Join(missing, ", ")), nil
		}
	}

	// get_passwords_needed_to_start: a job's credentials, an ad hoc
	// command's machine credential; nothing for the other types.
	var needed []string
	switch model {
	case "main.job":
		for _, c := range list {
			needed = append(needed, c.PasswordsNeeded()...)
		}
	case "main.adhoccommand":
		var credID *int64
		if err := d.DB.Pool.QueryRow(ctx, `SELECT credential_id FROM main_adhoccommand WHERE unifiedjob_ptr_id = $1`, id).Scan(&credID); err != nil && err != pgx.ErrNoRows {
			return "", err
		}
		if credID != nil {
			bs, err := models.LoadCredentialBriefs(ctx, d.DB.Pool, []int64{*credID})
			if err != nil {
				return "", err
			}
			for _, b := range bs {
				needed = append(needed, b.PasswordsNeeded()...)
			}
		}
	}
	if len(needed) == 0 {
		return "", nil
	}
	var startArgs string
	if err := d.DB.Pool.QueryRow(ctx, `SELECT start_args FROM main_unifiedjob WHERE id = $1`, id).Scan(&startArgs); err != nil {
		return "", err
	}
	given := map[string]any{}
	if startArgs != "" {
		pk := id
		if dec, err := crypto.DecryptField(d.Cfg.SecretKey, "start_args", &pk, startArgs); err == nil {
			_ = json.Unmarshal([]byte(dec), &given)
		}
	}
	var missing []string
	for _, f := range needed {
		if v, _ := given[f].(string); v == "" {
			missing = append(missing, f)
		}
	}
	if len(missing) > 0 {
		return fmt.Sprintf("Missing needed fields: %s.", strings.Join(missing, ", ")), nil
	}
	return "", nil
}

// missingCredentialInputs lists the type's required fields the credential
// leaves empty (has_input: an input source counts as provided).
func (d *Dispatcher) missingCredentialInputs(ctx context.Context, c models.CredentialBrief) ([]string, error) {
	var typeInputs []byte
	if err := d.DB.Pool.QueryRow(ctx, `SELECT inputs FROM main_credentialtype WHERE id = $1`, c.CredentialTypeID).Scan(&typeInputs); err != nil {
		return nil, err
	}
	var spec struct {
		Fields   []map[string]any `json:"fields"`
		Required []string         `json:"required"`
	}
	_ = json.Unmarshal(typeInputs, &spec)
	if len(spec.Required) == 0 {
		return nil, nil
	}
	defined := map[string]bool{}
	for _, f := range spec.Fields {
		if s, ok := f["id"].(string); ok {
			defined[s] = true
		}
	}
	dynamic := map[string]bool{}
	rows, err := d.DB.Pool.Query(ctx, `SELECT input_field_name FROM main_credentialinputsource WHERE target_credential_id = $1`, c.ID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var f string
		if err := rows.Scan(&f); err != nil {
			rows.Close()
			return nil, err
		}
		dynamic[f] = true
	}
	rows.Close()
	inputs := map[string]any{}
	_ = json.Unmarshal(c.Inputs, &inputs)
	var missing []string
	for _, r := range spec.Required {
		if !defined[r] || dynamic[r] {
			continue
		}
		v, ok := inputs[r]
		if !ok || v == nil || v == "" {
			missing = append(missing, r)
		}
	}
	return missing, nil
}

// failPreStart fails a job that did not pass its pre-start check, with the
// task manager's explanation, updates its template and sends its failure
// notifications (handle_failure_notifications; no status goes to a
// webhook's forge, as the task manager emitted none).
func (d *Dispatcher) failPreStart(ctx context.Context, id int64, explanation string) error {
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		var ujt *int64
		if err := tx.QueryRow(ctx, `UPDATE main_unifiedjob SET status = 'failed', failed = true, finished = now(), job_explanation = $2, modified = now()
			WHERE id = $1 RETURNING unified_job_template_id`, id, explanation+" Task failed pre-start check.").Scan(&ujt); err != nil {
			return err
		}
		if ujt != nil {
			return d.templateFinished(ctx, tx, *ujt, "failed", id, true, time.Now())
		}
		return nil
	})
	if err != nil {
		return err
	}
	if d.API != nil {
		d.background(func(ctx context.Context) { d.API.SendJobNotifications(ctx, id, "failed") })
	}
	return nil
}
