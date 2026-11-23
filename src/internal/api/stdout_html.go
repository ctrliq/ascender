package api

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The stdout views' HTML (UnifiedJobStdout with api/stdout.html): the
// output's ANSI colours as spans, the whole page for format=html and the
// content-only fragment the browsable API shows.

var stdoutPathRe = regexp.MustCompile(`^/api/v2/(jobs|project_updates|inventory_updates|ad_hoc_commands|system_jobs)/[^/]+/stdout/$`)

// stdoutFormats are the stdout view's renderers, in order, by format and
// media type.
var stdoutFormats = []string{"api", "html", "txt", "ansi", "json", "txt_download", "ansi_download"}
var stdoutMediaTypes = []string{"text/html", "text/html", "text/plain", "text/plain", "application/json", "text/plain", "text/plain"}

// stdoutViewNames are get_view_name of each stdout view.
var stdoutViewNames = map[string]string{
	"main_jobevent": "Job Stdout", "main_projectupdateevent": "Project Update Stdout",
	"main_inventoryupdateevent": "Inventory Update Stdout", "main_adhoccommandevent": "Ad Hoc Command Stdout",
	"main_systemjobevent": "System Job Stdout",
}

var (
	ansiColorRe    = regexp.MustCompile(`\x1b\[(\d+(?:;\d+)*)m`)
	ansiCursorUpRe = regexp.MustCompile(`^\[(\d*)A`)
	eventDataSeqRe = regexp.MustCompile(`\x1b\[K(?:[A-Za-z0-9+/=]+\x1b\[\d+D)+\x1b\[K`)
	ansiFgRe       = regexp.MustCompile(`^ansi(3[0-7]|9[0-7])$`)
	ansiBgRe       = regexp.MustCompile(`^ansi(4[0-7]|10[0-7])$`)
)

var ansiKnownCodes = func() map[string]bool {
	m := map[string]bool{"1": true, "4": true}
	for _, r := range [][2]int{{30, 37}, {90, 97}, {40, 47}, {100, 107}} {
		for i := r[0]; i <= r[1]; i++ {
			m[strconv.Itoa(i)] = true
		}
	}
	return m
}()

// pyHTMLEscape is html.escape(s, quote=True).
func pyHTMLEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#x27;").Replace(s)
}

// ansiToHTML is ansi_to_html: cursor-up sequences drop the previous lines,
// then colour codes become spans of ansi<code> classes.
func ansiToHTML(text string) string {
	blocks := strings.Split(text, "\x1b")
	var processed []string
	for i, block := range blocks {
		if m := ansiCursorUpRe.FindStringSubmatchIndex(block); m != nil {
			n := 1
			if m[3] > m[2] {
				n, _ = strconv.Atoi(block[m[2]:m[3]])
			}
			for k := 0; k < n; k++ {
				if len(processed) == 0 {
					break
				}
				for len(processed) > 0 && !strings.Contains(processed[len(processed)-1], "\n") {
					processed = processed[:len(processed)-1]
				}
				if len(processed) > 0 {
					processed = processed[:len(processed)-1]
				}
			}
			processed = append(processed, block[m[1]:])
			continue
		}
		if i == 0 {
			processed = append(processed, block)
		} else if block != "" {
			processed = append(processed, "\x1b"+block)
		}
	}
	text = strings.Join(processed, "")

	var b strings.Builder
	last := 0
	classes := map[string]bool{}
	open := false
	for _, m := range ansiColorRe.FindAllStringSubmatchIndex(text, -1) {
		b.WriteString(text[last:m[0]])
		for _, code := range strings.Split(text[m[2]:m[3]], ";") {
			switch {
			case code == "0" || code == "":
				if open {
					b.WriteString("</span>")
					open = false
				}
				classes = map[string]bool{}
			case ansiKnownCodes[code]:
				n, _ := strconv.Atoi(code)
				switch {
				case code == "1" || code == "4":
					classes["ansi"+code] = true
				case (n >= 30 && n <= 37) || (n >= 90 && n <= 97):
					for c := range classes {
						if ansiFgRe.MatchString(c) {
							delete(classes, c)
						}
					}
					classes["ansi"+code] = true
				default:
					for c := range classes {
						if ansiBgRe.MatchString(c) {
							delete(classes, c)
						}
					}
					classes["ansi"+code] = true
				}
			}
		}
		if open {
			b.WriteString("</span>")
			open = false
		}
		if len(classes) > 0 {
			list := make([]string, 0, len(classes))
			for c := range classes {
				list = append(list, c)
			}
			sort.Strings(list)
			b.WriteString(`<span class="` + strings.Join(list, " ") + `">`)
			open = true
		}
		last = m[1]
	}
	b.WriteString(text[last:])
	if open {
		b.WriteString("</span>")
	}
	return b.String()
}

const stdoutStyle = `<style type="text/css">
.ansi_fore { color: #000000; }
.ansi_back { background-color: #F5F5F5; }
.ansi_fore.ansi_dark { color: #AAAAAA; }
.ansi_back.ansi_dark { background-color: #000000; }
.ansi1 { font-weight: bold; }
.ansi3 { font-weight: italic; }
.ansi4 { text-decoration: underline; }
.ansi9 { text-decoration: line-through; }
.ansi30 { color: #161b1f; }
.ansi31 { color: #d9534f; }
.ansi32 { color: #5cb85c; }
.ansi33 { color: #f0ad4e; }
.ansi34 { color: #337ab7; }
.ansi35 { color: #e1539e; }
.ansi36 { color: #2dbaba; }
.ansi37 { color: #ffffff; }
.ansi40 { background-color: #161b1f; }
.ansi41 { background-color: #d9534f; }
.ansi42 { background-color: #5cb85c; }
.ansi43 { background-color: #f0ad4e; }
.ansi44 { background-color: #337ab7; }
.ansi45 { background-color: #e1539e; }
.ansi46 { background-color: #2dbaba; }
.ansi47 { background-color: #ffffff; }
body.ansi_back pre {
  font-family: Monaco, Menlo, Consolas, "Courier New", monospace;
  font-size: 12px;
}
div.ansi_back.ansi_dark {
  padding: 0 8px;
  -webkit-border-radius: 3px;
  -moz-border-radius: 3px;
  border-radius: 3px;
}
</style>`

// stdoutHTML renders api/stdout.html: the content-only fragment for the
// browsable API, or the whole page.
func stdoutHTML(content, title string, dark, contentOnly bool) string {
	body := ansiToHTML(pyHTMLEscape(eventDataSeqRe.ReplaceAllString(content, "")))
	darkClass := ""
	if dark {
		darkClass = " ansi_dark"
	}
	var out string
	if contentOnly {
		out = `<div class="nocode ansi_fore ansi_back` + darkClass + `">` + stdoutStyle + body + "\n</div>\n"
	} else {
		out = "\n<!DOCTYPE HTML>\n<html lang=\"en\">\n  <head>\n    <meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\">\n    <title>" + djangoEscape(title) + "</title>\n" +
			stdoutStyle + "\n  </head>\n  <body class=\"ansi_fore ansi_back" + darkClass + "\">\n    <pre>" + body + "</pre>\n  </body>\n</html>\n"
	}
	return strings.TrimSpace(out)
}
