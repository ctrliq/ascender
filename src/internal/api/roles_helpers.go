package api

import (
	"sync"

	"github.com/ctrliq/ascender/internal/i18n"
	"github.com/ctrliq/ascender/internal/rbac"
)

// rbacRoleName is a role's name in l's language: role_names held
// gettext_lazy messages.
func rbacRoleName(l *i18n.Locale, field string) string { return l.Gettext(rbac.RoleNames[field]) }

// rbacRoleDescription is a role's description in l's language: the
// translated role_descriptions message with the model's name put in.
func rbacRoleDescription(l *i18n.Locale, field, model string) string {
	en := rbac.RoleDescription(field, model)
	if l.English() {
		return en
	}
	key := l.Lang + "\x00" + en
	if t, ok := roleDescriptionCache.Load(key); ok {
		return t.(string)
	}
	t := TranslateMessage(l, en)
	roleDescriptionCache.Store(key, t)
	return t
}

// roleDescriptionCache holds translated role descriptions, a small set
// every serialized object repeats.
var roleDescriptionCache sync.Map
