package api

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/ctrliq/ascender/internal/pyre"
)

// The authentication settings' structured fields (sso/fields.py and the
// DRF fields under them): LDAP searches, DNs, group types, the
// organization, team and user flag maps of LDAP, the social backends, OIDC
// and SAML, and trigger rules. Each returns what the old field's
// to_representation gave back for storing.

type ssoKind int

const (
	ssoUnvalidated ssoKind = iota
	ssoChar
	ssoBool
	ssoEmail
	ssoURL
	ssoCert
	ssoLDAPDN
	ssoLDAPDNWithUser
	ssoDict
	ssoHybrid
	ssoList
	ssoForbidden
	ssoStringList
	ssoStringListBool
	ssoLDAPDNList
	ssoSocialMap
	ssoSocialRegex
	ssoTrigger
	ssoOIDCUsernames
)

type ssoField struct {
	kind       ssoKind
	required   bool
	allowNull  bool
	allowBlank bool
	child      *ssoField
	fields     []ssoNamed
	// post runs after the field's own conversion (the subclasses'
	// to_internal_value additions).
	post func(c *ssoCtx, v any) (any, fieldError)
}

type ssoNamed struct {
	name string
	f    *ssoField
}

// settingRequest is what the settings fields see of the request: whether
// it is a PATCH (missing nested keys are skipped then, as DRF's partial
// root did) and its data (DependsOnMixin reads the other key from it).
type settingRequest struct {
	partial bool
	body    *OMap
}

type settingRequestKey struct{}

func withSettingRequest(ctx context.Context, partial bool, body *OMap) context.Context {
	return context.WithValue(ctx, settingRequestKey{}, &settingRequest{partial: partial, body: body})
}

type ssoCtx struct {
	s   *Server
	ctx context.Context
	req *settingRequest
	key string
}

func opt(f *ssoField) *ssoField { f.required = false; return f }
func null(f *ssoField) *ssoField {
	f.allowNull = true
	return f
}

func charF() *ssoField { return &ssoField{kind: ssoChar, required: true} }
func boolF() *ssoField { return &ssoField{kind: ssoBool, required: true} }
func unvalidated() *ssoField {
	return &ssoField{kind: ssoUnvalidated, allowNull: true, allowBlank: true}
}
func forbidden() *ssoField { return &ssoField{kind: ssoForbidden} }
func triggerF() *ssoField  { return &ssoField{kind: ssoTrigger, required: true, child: unvalidated()} }
func socialMapF() *ssoField {
	return &ssoField{kind: ssoSocialMap, required: true, child: &ssoField{kind: ssoSocialRegex, required: true}}
}
func ldapDNMapF() *ssoField {
	return &ssoField{kind: ssoStringListBool, required: true, child: &ssoField{kind: ssoLDAPDN, required: true}}
}
func stringListF() *ssoField { return &ssoField{kind: ssoStringList, required: true, child: charF()} }
func oidcUsernames() *ssoField {
	return &ssoField{kind: ssoOIDCUsernames, required: true, child: charF()}
}
func dictOf(child *ssoField) *ssoField {
	return &ssoField{kind: ssoDict, required: true, child: child}
}
func hybrid(child *ssoField, fields ...ssoNamed) *ssoField {
	return &ssoField{kind: ssoHybrid, required: true, child: child, fields: fields}
}
func nf(name string, f *ssoField) ssoNamed { return ssoNamed{name, f} }

func socialSingleOrgMap(oidc bool) *ssoField {
	fs := []ssoNamed{nf("admins", null(opt(socialMapF()))), nf("users", null(opt(socialMapF()))), nf("remove_admins", opt(boolF())), nf("remove_users", opt(boolF())), nf("organization_alias", null(opt(socialMapF())))}
	if oidc {
		fs = append(fs, nf("triggers_admins", null(opt(triggerF()))), nf("triggers_users", null(opt(triggerF()))))
	}
	return hybrid(forbidden(), fs...)
}

func socialSingleTeamMap(oidc bool) *ssoField {
	fs := []ssoNamed{nf("organization", charF()), nf("users", null(opt(socialMapF()))), nf("remove", opt(boolF()))}
	if oidc {
		fs = append(fs, nf("triggers", null(opt(triggerF()))))
	}
	return hybrid(forbidden(), fs...)
}

// ssoFieldFor builds the field a setting's class names, or nil for the
// classes validated elsewhere.
func ssoFieldFor(sp *settingSpec) *ssoField {
	var f *ssoField
	switch sp.Class {
	case "LDAPDNField":
		f = &ssoField{kind: ssoLDAPDN}
	case "LDAPDNWithUserField":
		f = &ssoField{kind: ssoLDAPDNWithUser}
	case "LDAPConnectionOptionsField":
		f = dictOf(unvalidated())
		f.post = ldapConnectionOptions
	case "LDAPUserAttrMapField":
		f = dictOf(charF())
		f.post = ldapUserAttrs
	case "LDAPUserFlagsField":
		f = dictOf(&ssoField{kind: ssoLDAPDNList, required: true, child: charF()})
		f.post = ldapUserFlags
	case "LDAPGroupTypeParamsField":
		f = dictOf(unvalidated())
		f.post = ldapGroupTypeParams
	case "LDAPOrganizationMapField":
		f = dictOf(hybrid(forbidden(),
			nf("admins", null(opt(ldapDNMapF()))), nf("users", null(opt(ldapDNMapF()))), nf("auditors", null(opt(ldapDNMapF()))),
			nf("remove_admins", opt(boolF())), nf("remove_users", opt(boolF())), nf("remove_auditors", opt(boolF())),
			nf("triggers_admins", null(opt(triggerF()))), nf("triggers_users", null(opt(triggerF()))), nf("triggers_auditors", null(opt(triggerF())))))
	case "LDAPTeamMapField":
		f = dictOf(hybrid(forbidden(), nf("organization", charF()), nf("users", null(opt(ldapDNMapF()))), nf("remove", opt(boolF())), nf("triggers", null(opt(triggerF())))))
	case "SocialOrganizationMapField":
		f = dictOf(socialSingleOrgMap(false))
	case "SocialTeamMapField":
		f = dictOf(socialSingleTeamMap(false))
	case "OIDCOrganizationMapField":
		f = dictOf(socialSingleOrgMap(true))
	case "OIDCTeamMapField":
		f = dictOf(socialSingleTeamMap(true))
	case "OIDCUserFlagsField":
		f = hybrid(forbidden(), nf("triggers_superuser", null(opt(triggerF()))), nf("triggers_system_auditor", null(opt(triggerF()))),
			nf("is_superuser", null(opt(oidcUsernames()))), nf("is_system_auditor", null(opt(oidcUsernames()))),
			nf("remove_superusers", opt(boolF())), nf("remove_system_auditors", opt(boolF())))
	case "TriggerRuleField":
		f = triggerF()
	case "DictField":
		f = dictOf(unvalidated())
	case "SAMLOrgInfoField":
		f = dictOf(hybrid(unvalidated(), nf("name", charF()), nf("displayname", charF()), nf("url", &ssoField{kind: ssoURL, required: true})))
		f.post = samlOrgInfoLangs
	case "SAMLContactField":
		f = hybrid(unvalidated(), nf("givenName", charF()), nf("emailAddress", &ssoField{kind: ssoEmail, required: true}))
	case "SAMLEnabledIdPsField":
		f = dictOf(hybrid(unvalidated(), nf("entity_id", charF()), nf("url", &ssoField{kind: ssoURL, required: true}), nf("x509cert", &ssoField{kind: ssoCert, required: true}),
			nf("attr_user_permanent_id", opt(charF())), nf("attr_first_name", opt(charF())), nf("attr_last_name", opt(charF())),
			nf("attr_username", opt(charF())), nf("attr_email", opt(charF())), nf("label", opt(charF()))))
	case "SAMLSecurityField":
		var fs []ssoNamed
		for _, k := range []string{"nameIdEncrypted", "authnRequestsSigned", "logoutRequestSigned", "logoutResponseSigned", "signMetadata", "wantMessagesSigned",
			"wantAssertionsSigned", "wantAssertionsEncrypted", "wantNameId", "wantNameIdEncrypted", "wantAttributeStatement"} {
			fs = append(fs, nf(k, opt(boolF())))
		}
		fs = append(fs, nf("requestedAuthnContext", opt(&ssoField{kind: ssoStringListBool, required: true, child: charF()})),
			nf("requestedAuthnContextComparison", opt(charF())))
		for _, k := range []string{"metadataValidUntil", "metadataCacheDuration", "signatureAlgorithm", "digestAlgorithm"} {
			fs = append(fs, nf(k, null(opt(charF()))))
		}
		f = hybrid(unvalidated(), fs...)
	case "SAMLOrgAttrField":
		f = hybrid(forbidden(), nf("remove", opt(boolF())), nf("saml_attr", null(opt(charF()))), nf("remove_admins", opt(boolF())),
			nf("saml_admin_attr", null(opt(charF()))), nf("remove_auditors", opt(boolF())), nf("saml_auditor_attr", null(opt(charF()))))
	case "SAMLTeamAttrField":
		teamOrg := hybrid(forbidden(), nf("team", charF()), nf("team_alias", null(opt(charF()))), nf("organization", charF()))
		f = hybrid(forbidden(), nf("team_org_map", null(opt(&ssoField{kind: ssoList, required: true, child: teamOrg}))), nf("remove", opt(boolF())), nf("saml_attr", null(opt(charF()))))
	case "SAMLUserFlagsAttrField":
		f = hybrid(forbidden(), nf("is_superuser_attr", null(opt(charF()))), nf("is_superuser_value", null(opt(stringListF()))), nf("is_superuser_role", null(opt(stringListF()))),
			nf("remove_superusers", null(opt(boolF()))), nf("is_system_auditor_attr", null(opt(charF()))), nf("is_system_auditor_value", null(opt(stringListF()))),
			nf("is_system_auditor_role", null(opt(stringListF()))), nf("remove_system_auditors", null(opt(boolF()))))
	default:
		return nil
	}
	f.allowNull = sp.AllowNull
	f.allowBlank = sp.AllowBlank
	return f
}

// validateSSOSetting runs a structured authentication field on a sent
// value, or reports that the class is not one of them.
func (s *Server) validateSSOSetting(ctx context.Context, key string, sp *settingSpec, raw any) (any, fieldError, bool) {
	c := &ssoCtx{s: s, ctx: ctx, key: key}
	if r, ok := ctx.Value(settingRequestKey{}).(*settingRequest); ok {
		c.req = r
	} else {
		c.req = &settingRequest{}
	}
	switch sp.Class {
	case "LDAPSearchField":
		v, err := c.ldapSearch(raw, false)
		return v, err, true
	case "LDAPSearchWithUserField":
		v, err := c.ldapSearch(raw, true)
		return v, err, true
	case "LDAPSearchUnionField":
		v, err := c.ldapSearchUnion(raw)
		return v, err, true
	case "LDAPGroupTypeField":
		v, err := c.ldapGroupType(sp, raw)
		return v, err, true
	}
	f := ssoFieldFor(sp)
	if f == nil {
		return nil, nil, false
	}
	v, _, err := c.run(f, raw, true)
	return v, err, true
}

func isCharKind(k ssoKind) bool {
	switch k {
	case ssoChar, ssoEmail, ssoURL, ssoCert, ssoLDAPDN, ssoLDAPDNWithUser, ssoSocialRegex:
		return true
	}
	return false
}

// run is Field.run_validation: the empty and null checks, then the
// field's conversion and validators.
func (c *ssoCtx) run(f *ssoField, v any, present bool) (any, bool, fieldError) {
	if f.kind == ssoForbidden {
		return nil, false, []string{"Invalid field."}
	}
	if !present {
		if c.req.partial {
			return nil, true, nil
		}
		if f.required {
			return nil, false, []string{"This field is required."}
		}
		return nil, true, nil
	}
	if f.kind == ssoUnvalidated {
		return toPlain(v), false, nil
	}
	if isCharKind(f.kind) {
		if s, ok := v.(string); ok && strings.TrimSpace(s) == "" {
			if !f.allowBlank {
				return nil, false, []string{"This field may not be blank."}
			}
			if f.kind == ssoLDAPDN || f.kind == ssoLDAPDNWithUser {
				return nil, false, nil
			}
			return "", false, nil
		}
	}
	if f.kind == ssoLDAPDNList {
		if _, ok := v.([]any); !ok {
			v = []any{v}
		}
	}
	if v == nil {
		if !f.allowNull {
			return nil, false, []string{"This field may not be null."}
		}
		return nil, false, nil
	}
	out, err := c.internal(f, v)
	if err != nil {
		return nil, false, err
	}
	if f.post != nil {
		out, err = f.post(c, out)
		if err != nil {
			return nil, false, err
		}
	}
	return out, false, nil
}

// charValue is CharField.to_internal_value.
func charValue(v any) (string, fieldError) {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t), nil
	case json.Number:
		return pyNumberStr(t), nil
	}
	return "", []string{"Not a valid string."}
}

// pyNumberStr is str() of a JSON number as Python read it.
func pyNumberStr(n json.Number) string {
	if _, err := n.Int64(); err == nil {
		return n.String()
	}
	f, err := n.Float64()
	if err != nil {
		return n.String()
	}
	return pyFloatRepr(f)
}

func pyFloatRepr(f float64) string {
	s := fmt.Sprintf("%v", f)
	if !strings.ContainsAny(s, ".eE") && !strings.Contains(s, "Inf") && !strings.Contains(s, "NaN") {
		s += ".0"
	}
	return s
}

func (c *ssoCtx) internal(f *ssoField, v any) (any, fieldError) {
	switch f.kind {
	case ssoChar, ssoEmail, ssoURL, ssoCert, ssoLDAPDN, ssoLDAPDNWithUser:
		s, err := charValue(v)
		if err != nil {
			return nil, err
		}
		var msg string
		switch f.kind {
		case ssoEmail:
			if !emailRe.MatchString(s) {
				msg = "Enter a valid email address."
			}
		case ssoURL:
			if !validURL(s, []string{"http", "https", "ftp", "ftps"}) {
				msg = "Enter a valid URL"
			}
		case ssoCert:
			msg = validateCertificateSetting(s)
		case ssoLDAPDN:
			msg = validateLDAPDN(s, false)
		case ssoLDAPDNWithUser:
			msg = validateLDAPDN(s, true)
		}
		if msg != "" {
			return nil, []string{msg}
		}
		return s, nil
	case ssoSocialRegex:
		s, err := charValue(v)
		if err != nil {
			return nil, err
		}
		return socialMapRegex(s)
	case ssoBool:
		b, isNull, ok := pyBool(v, true)
		if !ok || (isNull && !f.allowNull) {
			return nil, []string{"Must be a valid boolean."}
		}
		if isNull {
			return nil, nil
		}
		return b, nil
	case ssoDict, ssoTrigger:
		m, ok := v.(*OMap)
		if !ok {
			return nil, []string{fmt.Sprintf("Expected a dictionary of items but got type \"%s\".", pyTypeName(v))}
		}
		out := NewOMap()
		errs := NewOMap()
		for _, k := range m.Keys() {
			x, _ := m.Get(k)
			r, skip, err := c.run(f.child, x, true)
			if err != nil {
				errs.Set(k, err)
				continue
			}
			if !skip {
				out.Set(k, r)
			}
		}
		if errs.Len() > 0 {
			return nil, errs
		}
		if f.kind == ssoTrigger {
			if msgs := validateTriggerRule(m); len(msgs) > 0 {
				return nil, msgs
			}
		}
		return out, nil
	case ssoHybrid:
		m, ok := v.(*OMap)
		if !ok {
			return nil, []string{fmt.Sprintf("Expected a dictionary of items but got type \"%s\".", pyTypeName(v))}
		}
		out := NewOMap()
		if m.Len() == 0 && f.allowBlank {
			return out, nil
		}
		errs := NewOMap()
		declared := map[string]*ssoField{}
		var keys []string
		for _, d := range f.fields {
			declared[d.name] = d.f
			keys = append(keys, d.name)
		}
		for _, k := range m.Keys() {
			if declared[k] == nil {
				keys = append(keys, k)
			}
		}
		for _, k := range keys {
			field := declared[k]
			if field == nil {
				field = f.child
			}
			x, present := m.Get(k)
			r, skip, err := c.run(field, x, present)
			if err != nil {
				errs.Set(k, err)
				continue
			}
			if !skip {
				out.Set(k, r)
			}
		}
		if errs.Len() > 0 {
			return nil, errs
		}
		return out, nil
	case ssoList, ssoStringList, ssoLDAPDNList:
		items, err := listItems(v)
		if err != nil {
			return nil, err
		}
		out, cerr := c.runChildren(f.child, items)
		if cerr != nil {
			return nil, cerr
		}
		if f.kind == ssoLDAPDNList {
			for _, x := range out {
				if s, ok := x.(string); ok {
					if msg := validateLDAPDN(s, false); msg != "" {
						return nil, []string{msg}
					}
				}
			}
		}
		return out, nil
	case ssoOIDCUsernames:
		if items, ok := v.([]any); ok {
			for _, it := range items {
				if _, isStr := it.(string); !isStr {
					return nil, []string{"Each username must be a string."}
				}
			}
		}
		items, err := listItems(v)
		if err != nil {
			return nil, err
		}
		out, cerr := c.runChildren(f.child, items)
		if cerr != nil {
			return nil, cerr
		}
		seen := map[string]bool{}
		dedup := []any{}
		for _, x := range out {
			s, _ := x.(string)
			if !seen[s] {
				seen[s] = true
				dedup = append(dedup, s)
			}
		}
		return dedup, nil
	case ssoStringListBool:
		// StringListBooleanField: strings are lowercased first.
		if s, ok := v.(string); ok {
			v = strings.ToLower(s)
		}
		if items, ok := v.([]any); ok {
			out, cerr := c.runChildren(f.child, items)
			if cerr != nil {
				return nil, cerr
			}
			return out, nil
		}
		if b, isNull, ok := pyBool(v, false); ok {
			if isNull {
				return nil, nil
			}
			return b, nil
		}
		if s, ok := v.(string); ok {
			r, _, err := c.run(f.child, s, true)
			return r, err
		}
		return nil, []string{fmt.Sprintf("Expected None, True, False, a string or list of strings but got %s instead.", pyClassRepr(v))}
	case ssoSocialMap:
		if items, ok := v.([]any); ok {
			out, cerr := c.runChildren(f.child, items)
			if cerr != nil {
				return nil, cerr
			}
			return out, nil
		}
		if b, isNull, ok := pyBool(v, false); ok {
			if isNull {
				return nil, nil
			}
			return b, nil
		}
		if s, ok := v.(string); ok {
			r, _, err := c.run(f.child, s, true)
			return r, err
		}
		return nil, []string{fmt.Sprintf("Expected None, True, False, a string or list of strings but got %s instead.", pyClassRepr(v))}
	}
	return toPlain(v), nil
}

// listItems is ListField's list check.
func listItems(v any) ([]any, fieldError) {
	items, ok := v.([]any)
	if !ok {
		return nil, []string{fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(v))}
	}
	return items, nil
}

// runChildren is ListField.run_child_validation: errors by index.
func (c *ssoCtx) runChildren(child *ssoField, items []any) ([]any, fieldError) {
	out := make([]any, 0, len(items))
	errs := NewOMap()
	for i, it := range items {
		r, _, err := c.run(child, it, true)
		if err != nil {
			errs.Set(fmt.Sprint(i), err)
			continue
		}
		out = append(out, r)
	}
	if errs.Len() > 0 {
		return nil, errs
	}
	return out, nil
}

// pyBool is membership in BooleanField's TRUE_VALUES, FALSE_VALUES and
// NULL_VALUES; lower lowercases strings first, as BooleanField itself does
// (the list and map fields compare as given).
func pyBool(v any, lower bool) (val, isNull, ok bool) {
	switch t := v.(type) {
	case bool:
		return t, false, true
	case json.Number:
		f, err := t.Float64()
		if err == nil && f == 1 {
			return true, false, true
		}
		if err == nil && f == 0 {
			return false, false, true
		}
	case string:
		s := t
		if lower {
			s = strings.ToLower(s)
		}
		switch s {
		case "t", "y", "yes", "true", "on", "1":
			return true, false, true
		case "f", "n", "no", "false", "off", "0":
			return false, false, true
		case "null", "":
			return false, true, true
		}
	case nil:
		return false, true, true
	}
	return false, false, false
}

var socialRegexRe = regexp.MustCompile(`^/(.*)/([im]+)?$`)

// socialMapRegex is SocialMapStringRegexField: "/pattern/flags" is a
// regular expression, kept as "/pattern/" plus its i and m flags.
func socialMapRegex(s string) (any, fieldError) {
	m := socialRegexRe.FindStringSubmatch(s)
	if m == nil {
		return s, nil
	}
	flags := ""
	if strings.Contains(m[2], "i") {
		flags += "i"
	}
	if strings.Contains(m[2], "m") {
		flags += "m"
	}
	if msg := pyRegexError(m[1], flags); msg != "" {
		return nil, []string{msg + ": " + s}
	}
	return "/" + m[1] + "/" + flags, nil
}

// pyRegexError is the message re.compile(pattern, flags) raised for a bad
// pattern, or "".
func pyRegexError(pattern, flags string) string {
	if err := pyre.Check(pattern, pyre.FlagsFrom(flags)); err != nil {
		return err.Error()
	}
	return ""
}

// The trigger definition (dab TRIGGER_DEFINITION).
type triggerDef struct {
	typ      string // dict, list, str
	keys     map[string]*triggerDef
	order    []string
	choices  []string
	contents bool // list items must be strings
}

var triggerDefinition = func() *triggerDef {
	str := &triggerDef{typ: "str"}
	strList := &triggerDef{typ: "list", contents: true}
	empty := &triggerDef{typ: "dict", keys: map[string]*triggerDef{}}
	cond := &triggerDef{typ: "dict", keys: map[string]*triggerDef{"contains": str, "matches": str, "ends_with": str, "equals": str, "in": strList},
		order: []string{"contains", "matches", "ends_with", "equals", "in"}}
	return &triggerDef{typ: "dict", order: []string{"always", "never", "groups", "attributes"}, keys: map[string]*triggerDef{
		"always": empty, "never": {typ: "dict", keys: map[string]*triggerDef{}},
		"groups": {typ: "dict", order: []string{"has_or", "has_and", "has_not"}, keys: map[string]*triggerDef{"has_or": strList, "has_and": strList, "has_not": strList}},
		"attributes": {typ: "dict", order: []string{"join_condition", "*"}, keys: map[string]*triggerDef{
			"join_condition": {typ: "str", choices: []string{"or", "and"}}, "*": cond}},
	}}
}()

// pyStrValue is str() of a decoded JSON value.
func pyStrValue(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case json.Number:
		return pyNumberStr(t)
	case bool:
		if t {
			return "True"
		}
		return "False"
	case nil:
		return "None"
	}
	return pyRepr(toPlain(v))
}

// validateTriggerData is validate_trigger_data.
func validateTriggerData(m *OMap, def *triggerDef, prefix string, errs map[string]string) {
	for _, k := range m.Keys() {
		v, _ := m.Get(k)
		d := def.keys[k]
		if d == nil {
			d = def.keys["*"]
		}
		if d == nil {
			errs[prefix+"."+k] = "Invalid, can only be one of: " + strings.Join(def.order, ", ")
			continue
		}
		if pyTypeName(v) != d.typ {
			errs[prefix+"."+k] = fmt.Sprintf("Expected %s but got %s", d.typ, pyTypeName(v))
			continue
		}
		switch t := v.(type) {
		case *OMap:
			validateTriggerData(t, d, prefix+"."+k, errs)
		case string:
			if len(d.choices) > 0 {
				ok := false
				for _, c := range d.choices {
					if c == t {
						ok = true
					}
				}
				if !ok {
					errs[prefix+"."+k] = "Invalid, choices can only be one of: " + strings.Join(d.choices, ", ")
				}
			}
		case []any:
			if d.contents {
				for _, it := range t {
					if _, ok := it.(string); !ok {
						errs[prefix+"."+k+"."+pyStrValue(it)] = fmt.Sprintf("Invalid, must be of type str, got <class '%s'>", pyTypeName(it))
					}
				}
			}
		}
	}
}

var triggerAttributeOperators = []string{"equals", "matches", "contains", "ends_with", "in"}

// validateTriggerRule is validate_trigger_rule: its errors as
// "key: error", sorted by key.
func validateTriggerRule(m *OMap) []string {
	errs := map[string]string{}
	validateTriggerData(m, triggerDefinition, "triggers", errs)
	if m.Len() > 1 {
		keys := append([]string(nil), m.Keys()...)
		sort.Strings(keys)
		errs["triggers"] = "Only one of " + strings.Join(keys, ", ") + " may be given."
	}
	if g, ok := m.Get("groups"); ok {
		if gm, ok := g.(*OMap); ok {
			if gm.Len() > 1 {
				keys := append([]string(nil), gm.Keys()...)
				sort.Strings(keys)
				errs["triggers.groups"] = "Only one of " + strings.Join(keys, ", ") + " may be given."
			} else if gm.Len() == 0 {
				errs["triggers.groups"] = "One of has_or, has_and or has_not is required."
			}
			for _, op := range gm.Keys() {
				x, _ := gm.Get(op)
				if l, ok := x.([]any); ok && len(l) == 0 {
					errs["triggers.groups."+op] = "At least one group is required."
				}
			}
		}
	}
	if a, ok := m.Get("attributes"); ok {
		if am, ok := a.(*OMap); ok {
			hasAttr := false
			for _, k := range am.Keys() {
				if k != "join_condition" {
					hasAttr = true
				}
			}
			if !hasAttr {
				errs["triggers.attributes"] = "At least one attribute is required."
			}
			for _, attr := range am.Keys() {
				x, _ := am.Get(attr)
				cond, ok := x.(*OMap)
				if attr == "join_condition" || !ok {
					continue
				}
				var ops []string
				for _, op := range triggerAttributeOperators {
					if _, has := cond.Get(op); has {
						ops = append(ops, op)
					}
				}
				if len(ops) > 1 {
					sorted := append([]string(nil), ops...)
					sort.Strings(sorted)
					errs["triggers.attributes."+attr] = "Only one of " + strings.Join(sorted, ", ") + " may be given."
				}
				for _, op := range ops {
					operand, _ := cond.Get(op)
					key := "triggers.attributes." + attr + "." + op
					switch t := operand.(type) {
					case string:
						if t == "" {
							errs[key] = "An empty value matches either everyone or no one, so it cannot be used as a condition."
						} else if op == "matches" {
							if msg := pyRegexError(t, ""); msg != "" {
								errs[key] = "Invalid regular expression: " + msg + "."
							}
						}
					case []any:
						if len(t) == 0 {
							errs[key] = "An empty value matches either everyone or no one, so it cannot be used as a condition."
						}
					}
				}
			}
		}
	}
	keys := make([]string, 0, len(errs))
	for k := range errs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, k+": "+errs[k])
	}
	return out
}

// quotedList is json.dumps(sorted(list)) without its brackets.
func quotedList(items []string) string {
	sort.Strings(items)
	b, _ := json.Marshal(items)
	s := string(b)
	s = strings.TrimPrefix(strings.TrimSuffix(s, "]"), "[")
	return strings.ReplaceAll(s, `","`, `", "`)
}

// ldapOptionNames are python-ldap's OPT_NAMES_DICT values.
var ldapOptionNames = map[string]bool{}

func init() {
	for _, n := range strings.Fields(`OPT_API_FEATURE_INFO OPT_CLIENT_CONTROLS OPT_CONNECT_ASYNC OPT_DEBUG_LEVEL OPT_DEFBASE OPT_ERROR_NUMBER OPT_ERROR_STRING
		OPT_HOST_NAME OPT_MATCHED_DN OPT_NETWORK_TIMEOUT OPT_PROTOCOL_VERSION OPT_REFERRALS OPT_REFHOPLIMIT OPT_RESTART OPT_SERVER_CONTROLS OPT_SUCCESS
		OPT_TCP_USER_TIMEOUT OPT_TIMEOUT OPT_URI OPT_X_KEEPALIVE_IDLE OPT_X_KEEPALIVE_INTERVAL OPT_X_KEEPALIVE_PROBES OPT_X_SASL_AUTHCID OPT_X_SASL_AUTHZID
		OPT_X_SASL_MECH OPT_X_SASL_NOCANON OPT_X_SASL_REALM OPT_X_SASL_SECPROPS OPT_X_SASL_SSF OPT_X_SASL_SSF_EXTERNAL OPT_X_SASL_SSF_MAX OPT_X_SASL_SSF_MIN
		OPT_X_SASL_USERNAME OPT_X_TLS OPT_X_TLS_ALLOW OPT_X_TLS_CACERTDIR OPT_X_TLS_CACERTFILE OPT_X_TLS_CERTFILE OPT_X_TLS_CIPHER OPT_X_TLS_CIPHER_SUITE
		OPT_X_TLS_CRLCHECK OPT_X_TLS_CRLFILE OPT_X_TLS_CRL_ALL OPT_X_TLS_CRL_PEER OPT_X_TLS_CTX OPT_X_TLS_DHFILE OPT_X_TLS_ECNAME OPT_X_TLS_KEYFILE
		OPT_X_TLS_NEWCTX OPT_X_TLS_PACKAGE OPT_X_TLS_PEERCERT OPT_X_TLS_PROTOCOL_MAX OPT_X_TLS_PROTOCOL_MIN OPT_X_TLS_PROTOCOL_SSL3 OPT_X_TLS_PROTOCOL_TLS1_0
		OPT_X_TLS_PROTOCOL_TLS1_1 OPT_X_TLS_PROTOCOL_TLS1_2 OPT_X_TLS_PROTOCOL_TLS1_3 OPT_X_TLS_RANDOM_FILE OPT_X_TLS_REQUIRE_CERT OPT_X_TLS_REQUIRE_SAN
		OPT_X_TLS_TRY OPT_X_TLS_VERSION`) {
		ldapOptionNames[n] = true
	}
}

func ldapConnectionOptions(c *ssoCtx, v any) (any, fieldError) {
	m := v.(*OMap)
	var bad []string
	for _, k := range m.Keys() {
		if !ldapOptionNames[k] {
			bad = append(bad, k)
		}
	}
	if len(bad) > 0 {
		return nil, []string{fmt.Sprintf("Invalid connection option(s): %s.", quotedList(bad))}
	}
	return m, nil
}

func ldapUserAttrs(c *ssoCtx, v any) (any, fieldError) {
	m := v.(*OMap)
	var bad []string
	for _, k := range m.Keys() {
		if k != "first_name" && k != "last_name" && k != "email" {
			bad = append(bad, k)
		}
	}
	if len(bad) > 0 {
		return nil, []string{fmt.Sprintf("Invalid user attribute(s): %s.", quotedList(bad))}
	}
	return m, nil
}

func ldapUserFlags(c *ssoCtx, v any) (any, fieldError) {
	m := v.(*OMap)
	for _, k := range m.Keys() {
		if k != "is_superuser" && k != "is_system_auditor" {
			return nil, []string{fmt.Sprintf("Invalid user flag: \"%s\".", k)}
		}
	}
	return m, nil
}

var samlLangRe = regexp.MustCompile(`(?i)^[a-z]{2}(?:-[a-z]{2})?$`)

func samlOrgInfoLangs(c *ssoCtx, v any) (any, fieldError) {
	m := v.(*OMap)
	var bad []string
	for _, k := range m.Keys() {
		if !samlLangRe.MatchString(k) {
			bad = append(bad, k)
		}
	}
	if len(bad) > 0 {
		return nil, []string{fmt.Sprintf("Invalid language code(s) for org info: %s.", quotedList(bad))}
	}
	return m, nil
}

// ldapGroupTypeArgs are the group types' __init__ arguments; the first
// count are required.
var ldapGroupTypeArgs = map[string]struct {
	args     []string
	required int
}{
	"PosixGroupType":                    {[]string{"name_attr"}, 0},
	"GroupOfNamesType":                  {[]string{"name_attr"}, 0},
	"GroupOfUniqueNamesType":            {[]string{"name_attr"}, 0},
	"ActiveDirectoryGroupType":          {[]string{"name_attr"}, 0},
	"OrganizationalRoleGroupType":       {[]string{"name_attr"}, 0},
	"MemberDNGroupType":                 {[]string{"member_attr", "name_attr"}, 1},
	"NestedGroupOfNamesType":            {[]string{"name_attr"}, 0},
	"NestedGroupOfUniqueNamesType":      {[]string{"name_attr"}, 0},
	"NestedActiveDirectoryGroupType":    {[]string{"name_attr"}, 0},
	"NestedOrganizationalRoleGroupType": {[]string{"name_attr"}, 0},
	"NestedMemberDNGroupType":           {[]string{"member_attr", "name_attr"}, 1},
	"PosixUIDGroupType":                 {[]string{"name_attr", "ldap_group_user_attr"}, 0},
}

// dependsOn is DependsOnMixin.get_depends_on: the other key from the
// request when it is set there, else the stored value.
func (c *ssoCtx) dependsOn(key string) any {
	if c.req.body != nil {
		if v, ok := c.req.body.Get(key); ok && pyTruthy(v) {
			return v
		}
	}
	v, _ := c.s.Settings.Get(c.ctx, key)
	return v
}

// ldapSuffix is the "_1".."_5" of an LDAP server's settings.
func ldapSibling(key, name string) string {
	rest := strings.TrimPrefix(key, "AUTH_LDAP_")
	if len(rest) > 2 && rest[0] >= '1' && rest[0] <= '9' && rest[1] == '_' {
		return "AUTH_LDAP_" + rest[:2] + name
	}
	return "AUTH_LDAP_" + name
}

func (c *ssoCtx) ldapGroupType(sp *settingSpec, raw any) (any, fieldError) {
	var str string
	switch t := raw.(type) {
	case string:
		str = t
	case json.Number:
		str = t.String()
	case bool:
		str = map[bool]string{true: "True", false: "False"}[t]
	default:
		str = pyStrValue(raw)
	}
	spec, ok := ldapGroupTypeArgs[str]
	if !ok {
		return nil, []string{fmt.Sprintf("\"%s\" is not a valid choice.", str)}
	}
	dep := ldapSibling(c.key, "GROUP_TYPE_PARAMS")
	params := c.dependsOn(dep)
	var pm map[string]bool
	switch t := params.(type) {
	case nil:
		pm = map[string]bool{}
	case *OMap:
		pm = map[string]bool{}
		for _, k := range t.Keys() {
			pm[k] = true
		}
	case map[string]any:
		pm = map[string]bool{}
		for k := range t {
			pm[k] = true
		}
	default:
		if !pyTruthy(params) {
			pm = map[string]bool{}
		} else {
			return nil, []string{fmt.Sprintf("Invalid group_type parameters. Expected instance of dict but got <class '%s'> instead.", pyTypeName(params))}
		}
	}
	for _, a := range spec.args[:spec.required] {
		if !pm[a] {
			return nil, []string{fmt.Sprintf("Missing required parameters in %s.", dep)}
		}
	}
	return str, nil
}

func ldapGroupTypeParams(c *ssoCtx, v any) (any, fieldError) {
	m := v.(*OMap)
	if m.Len() == 0 {
		return m, nil
	}
	gt, _ := c.dependsOn(ldapSibling(c.key, "GROUP_TYPE")).(string)
	spec, ok := ldapGroupTypeArgs[gt]
	if !ok {
		return NewOMap(), nil
	}
	allowed := map[string]bool{}
	for _, a := range spec.args {
		allowed[a] = true
	}
	var bad []string
	for _, k := range m.Keys() {
		if !allowed[k] {
			bad = append(bad, k)
		}
	}
	if len(bad) > 0 {
		return nil, []string{fmt.Sprintf("Invalid key(s): %s.", quotedList(bad))}
	}
	return m, nil
}

var ldapScopes = map[string]bool{"SCOPE_BASE": true, "SCOPE_ONELEVEL": true, "SCOPE_SUBTREE": true}

// ldapSearch is LDAPSearchField: [base DN, scope, filter], or [] for none.
func (c *ssoCtx) ldapSearch(raw any, withUser bool) (any, fieldError) {
	items, err := listItems(raw)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return []any{}, nil
	}
	if len(items) != 3 {
		return nil, []string{fmt.Sprintf("Expected a list of three items but got %d instead.", len(items))}
	}
	dn, _, ferr := c.run(&ssoField{kind: ssoLDAPDN, required: true}, items[0], true)
	if ferr != nil {
		return nil, ferr
	}
	var scope string
	switch t := items[1].(type) {
	case string:
		scope = t
	default:
		scope = pyStrValue(t)
	}
	if items[1] == nil {
		return nil, []string{"This field may not be null."}
	}
	if !ldapScopes[scope] {
		return nil, []string{fmt.Sprintf("\"%s\" is not a valid choice.", scope)}
	}
	filter, _, ferr := c.run(&ssoField{kind: ssoChar, required: true}, items[2], true)
	if ferr != nil {
		return nil, ferr
	}
	if msg := validateLDAPFilter(filter.(string), withUser); msg != "" {
		return nil, []string{msg}
	}
	return []any{dn, scope, filter}, nil
}

// ldapSearchUnion is LDAPSearchUnionField: one search, or a list of them.
func (c *ssoCtx) ldapSearchUnion(raw any) (any, fieldError) {
	items, err := listItems(raw)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return []any{}, nil
	}
	if _, isStr := items[0].(string); len(items) == 3 && isStr {
		return c.ldapSearch(items, true)
	}
	out := make([]any, 0, len(items))
	for i, it := range items {
		l, ok := it.([]any)
		if !ok {
			return nil, []string{fmt.Sprintf("In order to ultilize LDAP Union, input element No. %d should be a search query array.", i+1)}
		}
		v, ferr := c.ldapSearch(l, true)
		if ferr != nil {
			if msgs, ok := ferr.([]string); ok {
				return nil, append([]string{fmt.Sprintf("Error parsing LDAP Union element No. %d:", i+1)}, msgs...)
			}
			return nil, ferr
		}
		out = append(out, v)
	}
	return out, nil
}

// validateLDAPDN is validate_ldap_dn (python-ldap's str2dn).
func validateLDAPDN(value string, withUser bool) string {
	dn := value
	if withUser {
		if !strings.Contains(value, "%(user)s") {
			return fmt.Sprintf("DN must include \"%%(user)s\" placeholder for username: %s", value)
		}
		dn = strings.ReplaceAll(value, "%(user)s", "USER")
	}
	if !parseLDAPDN(dn) {
		return "Invalid DN: " + value
	}
	return ""
}

var (
	ldapFilterSimpleRe   = regexp.MustCompile(`^\([A-Za-z0-9-]+?=[^()]+?\)$`)
	ldapFilterCompoundRe = regexp.MustCompile(`^\([&|!]\(.*?\)\)$`)
)

// validateLDAPFilter is validate_ldap_filter.
func validateLDAPFilter(value string, withUser bool) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	f := value
	if withUser {
		if !strings.Contains(value, "%(user)s") {
			return fmt.Sprintf("DN must include \"%%(user)s\" placeholder for username: %s", value)
		}
		f = strings.ReplaceAll(value, "%(user)s", "USER")
	}
	if ldapFilterSimpleRe.MatchString(f) || ldapFilterCompoundRe.MatchString(f) {
		return ""
	}
	return "Invalid filter: " + value
}

var (
	ldapBindDomainUserRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9._-]*?\\[A-Za-z0-9 ._-]+?$`)
	ldapBindUPNRe        = regexp.MustCompile(`^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$`)
	entraHostRe          = regexp.MustCompile(`(?i)^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$`)
	entraGUIDRe          = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

// settingValidator runs a CharField setting's named validator.
func settingValidator(name, value string) string {
	switch name {
	case "validate_ldap_bind_dn":
		v := strings.TrimSpace(value)
		if ldapBindDomainUserRe.MatchString(v) || ldapBindUPNRe.MatchString(v) {
			return ""
		}
		return validateLDAPDN(value, false)
	case "validate_entra_host":
		if value != "" && (len(value) > 253 || !entraHostRe.MatchString(value)) {
			return "Expected a host name only, without https:// or a path."
		}
	case "validate_entra_tenant_id":
		if value == "" {
			return ""
		}
		switch strings.ToLower(value) {
		case "common", "organizations", "consumers":
			return value + " lets in users from any directory. Give your own tenant ID or domain."
		}
		if !entraGUIDRe.MatchString(value) && (len(value) > 253 || !entraHostRe.MatchString(value)) {
			return "Expected a tenant ID such as 00000000-0000-0000-0000-000000000000 or a domain such as contoso.onmicrosoft.com."
		}
	case "validate_certificate":
		return validateCertificateSetting(value)
	case "validate_ca_certificate":
		return validateCACertificates(value)
	case "validate_private_key":
		return validatePEMCounts(value, 1, 1, 0, 0)
	}
	return ""
}

// validateCertificateSetting is validate_certificate: BEGIN/END lines are
// added when missing.
func validateCertificateSetting(data string) string {
	if !strings.Contains(data, "BEGIN ") {
		data = "-----BEGIN CERTIFICATE-----\n" + data
	}
	if !strings.Contains(data, "END ") {
		data = data + "\n-----END CERTIFICATE-----\n"
	}
	return validatePEMCounts(data, 0, 0, 1, -1)
}

// validateCACertificates checks a bundle of trusted certificates
// (AUTH_LDAP_CA_CERT): PEM certificates only, each one readable, and at
// least one.
func validateCACertificates(data string) string {
	rest := []byte(data)
	n := 0
	for {
		var b *pem.Block
		b, rest = pem.Decode(rest)
		if b == nil {
			break
		}
		if b.Type != "CERTIFICATE" {
			return fmt.Sprintf("Only certificates are allowed, found %s.", b.Type)
		}
		if _, err := x509.ParseCertificate(b.Bytes); err != nil {
			return fmt.Sprintf("Certificate %d could not be read: %v", n+1, err)
		}
		n++
	}
	if n == 0 {
		return "At least one PEM certificate (-----BEGIN CERTIFICATE-----) is required."
	}
	if strings.TrimSpace(string(rest)) != "" {
		return "Unexpected text after the last certificate."
	}
	return ""
}

// validatePEMCounts is validate_pem with its certificate limits (a
// negative maximum is none).
func validatePEMCounts(data string, minKeys, maxKeys, minCerts, maxCerts int) string {
	objs, err := validatePEM(data, minKeys, maxKeys)
	if err != nil {
		return err.Error()
	}
	certs := 0
	for _, o := range objs {
		if o.typ == "CERTIFICATE" {
			certs++
		}
	}
	if certs < minCerts {
		if minCerts == 1 {
			if maxCerts == minCerts {
				return "Exactly one certificate is required."
			}
			return "At least one certificate is required."
		}
		return fmt.Sprintf("At least %d certificates are required, only %d provided.", minCerts, certs)
	}
	if maxCerts >= 0 && certs > maxCerts {
		if maxCerts == 1 {
			return fmt.Sprintf("Only one certificate is allowed, %d provided.", certs)
		}
		return fmt.Sprintf("No more than %d certificates are allowed, %d provided.", maxCerts, certs)
	}
	return ""
}

// parseLDAPDN reports whether s parses as a DN the way OpenLDAP's
// ldap_str2dn does in its default (LDAPv3) mode: RDNs separated by "," or
// ";", attribute value assertions joined by "+", descriptor or numeric OID
// types, and string, quoted or "#hex" values.
func parseLDAPDN(s string) bool {
	if strings.TrimSpace(s) == "" {
		return s == ""
	}
	i, n := 0, len(s)
	skip := func() {
		for i < n && s[i] == ' ' {
			i++
		}
	}
	isHex := func(c byte) bool {
		return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
	}
	for {
		skip()
		// Attribute type.
		start := i
		switch {
		case i < n && ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z')):
			for i < n && ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9') || s[i] == '-') {
				i++
			}
		case i < n && s[i] >= '0' && s[i] <= '9':
			for i < n && ((s[i] >= '0' && s[i] <= '9') || s[i] == '.') {
				i++
			}
			if strings.HasSuffix(s[start:i], ".") || strings.Contains(s[start:i], "..") {
				return false
			}
		default:
			return false
		}
		skip()
		if i >= n || s[i] != '=' {
			return false
		}
		i++
		skip()
		// Value.
		if i < n && s[i] == '#' {
			i++
			hs := i
			for i < n && isHex(s[i]) {
				i++
			}
			if i == hs || (i-hs)%2 != 0 {
				return false
			}
		} else if i < n && s[i] == '"' {
			i++
			closed := false
			for i < n {
				if s[i] == '\\' {
					if i+1 >= n {
						return false
					}
					i += 2
					continue
				}
				if s[i] == '"' {
					closed = true
					i++
					break
				}
				i++
			}
			if !closed {
				return false
			}
		} else {
			for i < n {
				c := s[i]
				if c == ',' || c == ';' || c == '+' {
					break
				}
				if c == '\\' {
					if i+1 >= n {
						return false
					}
					nx := s[i+1]
					if strings.IndexByte(" \"#+,;<=>\\", nx) >= 0 {
						i += 2
						continue
					}
					if i+2 < n && isHex(nx) && isHex(s[i+2]) {
						i += 3
						continue
					}
					return false
				}
				if c == '"' || c == '<' || c == '>' {
					return false
				}
				i++
			}
		}
		skip()
		if i >= n {
			return true
		}
		switch s[i] {
		case ',', ';', '+':
			i++
			if i >= n {
				return false
			}
		default:
			return false
		}
	}
}
