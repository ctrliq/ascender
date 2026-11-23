package api

import (
	"context"
	"strings"
	"testing"
)

// The 128 maximum counts characters, as the old serializer's len did, so a
// password of non-ASCII characters is not refused for its UTF-8 length.
func TestPasswordMaxLengthCountsCharacters(t *testing.T) {
	d := newDBServer(t, "zz-password-length")
	ctx := context.Background()
	for _, c := range []struct {
		password string
		tooLong  bool
	}{
		{strings.Repeat("é", 100), false},
		{strings.Repeat("密", 128), false},
		{strings.Repeat("a", 129), true},
		{strings.Repeat("é", 129), true},
	} {
		got := d.passwordProblem(ctx, c.password)
		if (got == "Password max length is 128") != c.tooLong {
			t.Errorf("%d characters, %d bytes: %q", len([]rune(c.password)), len(c.password), got)
		}
	}
}
