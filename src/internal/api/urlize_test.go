package api

import "testing"

// Expected values are Django's urlize(text, nofollow=True, autoescape=True)
// under the old app's Django.
func TestDjangoUrlize(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"    \"scm_url\": \"https://github.com/ctrliq/ascender-playbooks.git\",", "    &quot;scm_url&quot;: &quot;<a href=\"https://github.com/ctrliq/ascender-playbooks.git\" rel=\"nofollow\">https://github.com/ctrliq/ascender-playbooks.git</a>&quot;,"},
		{"    \"email\": \"admin@example.com\",", "    &quot;email&quot;: &quot;<a href=\"mailto:admin@example.com\">admin@example.com</a>&quot;,"},
		{"    \"host\": \"example.com/path\",", "    &quot;host&quot;: &quot;<a href=\"http://example.com/path\" rel=\"nofollow\">example.com/path</a>&quot;,"},
		{"see www.example.org.", "see <a href=\"http://www.example.org\" rel=\"nofollow\">www.example.org</a>."},
		{"(https://x.y/z)", "(<a href=\"https://x.y/z\" rel=\"nofollow\">https://x.y/z</a>)"},
		{"\"a&b\" <script>alert(1)</script>", "&quot;a&amp;b&quot; &lt;script&gt;alert(1)&lt;/script&gt;"},
		{"http://[::1]:80/x", "http://[::1]:80/x"},
		{"foo.bar baz.qux.net", "foo.bar <a href=\"http://baz.qux.net\" rel=\"nofollow\">baz.qux.net</a>"},
		{"user@localhost", "user@localhost"},
		{"\"ASCENDER_URL_BASE\": \"https://ascender.example.com:3001\",", "&quot;ASCENDER_URL_BASE&quot;: &quot;<a href=\"https://ascender.example.com:3001\" rel=\"nofollow\">https://ascender.example.com:3001</a>&quot;,"},
		{"\"uri\": \"ldap://ldap.example.com:389\"", "&quot;uri&quot;: &quot;ldap://ldap.example.com:389&quot;"},
		{"\"x\": \"https://example.com/?a=1&b=2&c=%20d\"", "&quot;x&quot;: &quot;<a href=\"https://example.com/?a=1&amp;b=2&amp;c=+d\" rel=\"nofollow\">https://example.com/?a=1&amp;b=2&amp;c=%20d</a>&quot;"},
		{"https://example.com/a(b)c) and [https://example.com/x]", "<a href=\"https://example.com/a(b)c\" rel=\"nofollow\">https://example.com/a(b)c</a>) and [<a href=\"https://example.com/x\" rel=\"nofollow\">https://example.com/x</a>]"},
		{"mailto me at first.last+tag@sub.example.co.uk!", "mailto me at <a href=\"mailto:first.last%2Btag@sub.example.co.uk\">first.last+tag@sub.example.co.uk</a>!"},
		{"\"time\": \"2026-11-14T08:34:18.123Z\",", "&quot;time&quot;: &quot;2026-11-14T08:34:18.123Z&quot;,"},
		{"it's https://example.com/it's", "it&#x27;s <a href=\"https://example.com/it\" rel=\"nofollow\">https://example.com/it</a>&#x27;s"},
		{"https://example.com/path;param&amp;x=1;", "<a href=\"https://example.com/path;param&amp;x=1\" rel=\"nofollow\">https://example.com/path;param&amp;amp;x=1</a>;"},
		{"HTTP://EXAMPLE.COM/UPPER", "<a href=\"http://EXAMPLE.COM/UPPER\" rel=\"nofollow\">HTTP://EXAMPLE.COM/UPPER</a>"},
		{"ex-ample.com., -bad.com, caf\u00e9.com", "<a href=\"http://ex-ample.com\" rel=\"nofollow\">ex-ample.com</a>., -bad.com, <a href=\"http://caf%C3%A9.com\" rel=\"nofollow\">caf\u00e9.com</a>"},
		{"{\n    \"a\": \"b\"\n}", "{\n    &quot;a&quot;: &quot;b&quot;\n}"},
	} {
		if got := djangoUrlize(c.in); got != c.want {
			t.Errorf("%q:\n got  %s\n want %s", c.in, got, c.want)
		}
	}
}
