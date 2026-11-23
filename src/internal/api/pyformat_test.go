package api

import "testing"

// str.format as Python 3 answered it (checked against the old image's
// Python), and str() of its exceptions.
func TestPyFormat(t *testing.T) {
	user := &pyObject{class: "User", str: "admin", attrs: map[string]any{"username": "admin", "id": int64(1)}}
	kw := map[string]any{"status_code": int64(404), "user_name": user, "url_path": "/api/v2/x/", "remote_addr": nil, "error": "Not Found"}
	for _, tc := range []struct{ format, out, err string }{
		{defaultAPIErrorFormat, "status 404 received by user admin attempting to access /api/v2/x/ from None", ""},
		{"{{literal}} {status_code}", "{literal} 404", ""},
		{"{status_code:>6}|{status_code:<5}|{status_code:^7}|{status_code:06}", "   404|404  |  404  |000404", ""},
		{"{status_code:+}|{status_code:x}|{status_code:#x}|{status_code:,}", "+404|194|0x194|404", ""},
		{"{error:>12}|{error:.3}|{error!r}|{url_path:*^14}", "   Not Found|Not|'Not Found'|**/api/v2/x/**", ""},
		{"{user_name.username} {user_name.id} {user_name!r}", "admin 1 <User: admin>", ""},
		{"{error[0]}", "N", ""},
		{"{nope}", "", "'nope'"},
		{"{}", "", "Replacement index 0 out of range for positional args tuple"},
		{"{0}", "", "Replacement index 0 out of range for positional args tuple"},
		{"oops }", "", "Single '}' encountered in format string"},
		{"oops {", "", "Single '{' encountered in format string"},
		{"{status_code", "", "expected '}' before end of string"},
		{"{status_code!z}", "", "Unknown conversion specifier z"},
		{"{error:d}", "", "Unknown format code 'd' for object of type 'str'"},
		{"{status_code:s}", "", "Unknown format code 's' for object of type 'int'"},
		{"{remote_addr:>5}", "", "unsupported format string passed to NoneType.__format__"},
		{"{user_name:>5}", "", "unsupported format string passed to User.__format__"},
		{"{user_name.email}", "", "'User' object has no attribute 'email'"},
		{"{error.upper2}", "", "'str' object has no attribute 'upper2'"},
		{"{status_code:.2}", "", "Precision not allowed in integer format specifier"},
		{"{status_code:{error}}", "", "Invalid format specifier 'Not Found' for object of type 'int'"},
	} {
		out, err := pyFormat(tc.format, kw)
		if out != tc.out || err != tc.err {
			t.Errorf("%q: got %q / %q, want %q / %q", tc.format, out, err, tc.out, tc.err)
		}
	}
}
