package tasks

import "testing"

// Expected values are update_scm_url's (main/utils/common.py) under the
// old app's Python.
func TestUpdateSCMURL(t *testing.T) {
	for _, c := range []struct {
		scmType, url     string
		user, pass       scmCred
		special, scp, ok bool
		want             string
	}{
		{"git", "https://github.com/ctrliq/ascender.git", keepCred, keepCred, false, false, true, "https://github.com/ctrliq/ascender.git"},
		{"git", "git@github.com:ctrliq/ascender.git", keepCred, keepCred, false, true, true, "git@github.com:ctrliq/ascender.git"},
		{"git", "git@github.com:ctrliq/ascender.git", keepCred, keepCred, true, true, true, "git@github.com:ctrliq/ascender.git"},
		{"git", "git@github.com:ctrliq/ascender.git", setCred("git"), setCred(""), true, true, true, "git@github.com:ctrliq/ascender.git"},
		{"git", "ssh://git@example.com:2222/org/repo.git", keepCred, keepCred, true, true, true, "ssh://git@example.com:2222/org/repo.git"},
		{"git", "https://user:p%40ss@example.com/repo.git", keepCred, keepCred, false, false, true, "https://user:p%2540ss@example.com/repo.git"},
		{"git", "https://example.com/repo.git", setCred("bob"), setCred("s3cr:t/@"), true, true, true, "https://bob:s3cr%3At%2F%40@example.com/repo.git"},
		{"git", "/srv/repos/foo", keepCred, keepCred, true, true, true, "file:///srv/repos/foo"},
		{"git", "srv/repos/foo", keepCred, keepCred, true, true, true, "file:///srv/repos/foo"},
		{"git", "file:///srv/repos/foo", keepCred, keepCred, true, true, true, "file:///srv/repos/foo"},
		{"git", "[fd00::11]:example/foo.git", keepCred, keepCred, true, true, true, "[fd00::11]:example/foo.git"},
		{"git", "https://[fd00::11]:8443/foo.git", setCred("u"), setCred("p"), true, true, true, "https://u:p@[fd00::11]:8443/foo.git"},
		{"git", "host:a:b", keepCred, keepCred, true, true, false, "Invalid git URL"},
		{"git", "git+ssh://git@github.com/x/y.git", keepCred, keepCred, true, false, false, "Unsupported git URL"},
		{"git", "git@bitbucket.org:x/y.git", setCred("bob"), setCred(""), true, true, false, "Username must be \"git\" for SSH access to bitbucket.org."},
		{"git", "git@github.com:x/y.git", setCred("bob"), setCred(""), true, true, false, "Username must be \"git\" or \"x-access-token\" (for github app) for SSH access to github.com."},
		{"git", "https://EXAMPLE.com:99999/x", keepCred, keepCred, true, true, false, "Invalid git URL"},
		{"git", "", keepCred, keepCred, true, true, true, ""},
		{"svn", "https://svn.example.com/repo/trunk", setCred("bob"), setCred(""), true, true, true, "https://bob@svn.example.com/repo/trunk"},
		{"svn", "svn+ssh://svn.example.com/repo", setCred("bob"), setCred(""), true, true, true, "svn+ssh://bob@svn.example.com/repo"},
		{"svn", "svn.example.com/repo", keepCred, keepCred, true, true, false, "Invalid svn URL"},
		{"archive", "https://example.com/a.tar.gz", setCred("bob"), setCred("pw"), true, true, true, "https://example.com/a.tar.gz"},
		{"archive", "ftp://example.com/a.tar.gz", keepCred, keepCred, true, true, false, "Unsupported archive URL"},
		{"hg", "https://x", keepCred, keepCred, true, true, false, "Unsupported SCM type \"hg\""},
		{"git", "https://example.com/repo.git?x=1#frag", keepCred, keepCred, true, true, true, "https://example.com/repo.git?x=1#frag"},
		{"git", "git@github.com:x/y.git", setCred("x-access-token"), setCred("tok"), true, true, true, "x-access-token@github.com:x/y.git"},
		{"git", "https:///nohost", keepCred, keepCred, true, true, false, "Host is required for https URL"},
	} {
		got, err := updateSCMURL(c.scmType, c.url, c.user, c.pass, c.special, c.scp)
		if c.ok && (err != nil || got != c.want) {
			t.Errorf("%s %q: got %q %v, want %q", c.scmType, c.url, got, err, c.want)
		}
		if !c.ok && (err == nil || err.Error() != c.want) {
			t.Errorf("%s %q: got %q %v, want error %q", c.scmType, c.url, got, err, c.want)
		}
	}
}
