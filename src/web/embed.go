// Package webassets embeds the user interface templates and static files so
// the web binary is self-contained. During development the same files can
// be served from disk instead (ASCENDER_STATIC_DIR / ASCENDER_TEMPLATE_DIR).
package webassets

import (
	"embed"
	"io/fs"
)

//go:embed all:static
var staticFS embed.FS

//go:embed all:templates
var templatesFS embed.FS

// Static is the static asset tree rooted at "static/".
func Static() fs.FS {
	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(err)
	}
	return sub
}

// Templates is the template tree rooted at "templates/".
func Templates() fs.FS {
	sub, err := fs.Sub(templatesFS, "templates")
	if err != nil {
		panic(err)
	}
	return sub
}
