package models

import (
	"time"
)

// FormatTime renders a timestamp the way DRF did: ISO 8601 in UTC with a
// "Z" suffix, microseconds only when non-zero.
func FormatTime(t time.Time) string {
	t = t.UTC()
	if t.Nanosecond() == 0 {
		return t.Format("2006-01-02T15:04:05Z")
	}
	return t.Format("2006-01-02T15:04:05.000000Z")
}

// FormatTimePtr renders a nullable timestamp.
func FormatTimePtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return FormatTime(*t)
}

// NullableID renders an optional foreign key for JSON.
func NullableID(v *int64) any {
	if v == nil {
		return nil
	}
	return *v
}

// UserSummary is the {id, username, first_name, last_name} block.
type UserSummary struct {
	ID        int64
	Username  string
	FirstName string
	LastName  string
}

// NameSummary is the {id, name, description} block.
type NameSummary struct {
	ID          int64
	Name        string
	Description string
}
