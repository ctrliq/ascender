package docsite

import (
	"regexp"
	"strings"
)

// FormatTables lays out the Markdown tables in a page the one way the
// docs.ciq.com lint accepts throughout (markdownlint's "compact" table
// style): a pipe at each end of every row, and one space between each
// pipe and a cell's text. The delimiter row keeps its alignment colons and
// is written with three hyphens. Tables inside fenced code are left alone.
func FormatTables(src string) string {
	lines := strings.SplitAfter(src, "\n")
	fence := ""
	for i := 0; i < len(lines); i++ {
		body := strings.TrimRight(lines[i], "\r\n")
		if m := fenceRE.FindStringSubmatch(body); m != nil {
			switch mark := m[1]; {
			case fence == "":
				fence = mark
			case mark[0] == fence[0] && len(mark) >= len(fence) && strings.TrimSpace(body) == mark:
				fence = ""
			}
			continue
		}
		if fence != "" || i+1 >= len(lines) || !isTableRow(body) || !delimRE.MatchString(strings.TrimSpace(strings.TrimRight(lines[i+1], "\r\n"))) {
			continue
		}
		// A table: the header, the delimiter row and the rows after it,
		// up to the first line that is not a row.
		indent := body[:len(body)-len(strings.TrimLeft(body, " "))]
		start := i
		for j := start; j < len(lines); j++ {
			row := strings.TrimRight(lines[j], "\r\n")
			if !isTableRow(row) {
				break
			}
			cells := splitRow(strings.TrimSpace(row))
			if j == start+1 {
				for k, c := range cells {
					c = strings.ReplaceAll(c, " ", "")
					left, right := strings.HasPrefix(c, ":"), strings.HasSuffix(c, ":")
					c = "---"
					if left {
						c = ":" + c
					}
					if right {
						c += ":"
					}
					cells[k] = c
				}
			}
			// One space each side of a cell's text, and one space in all
			// in an empty cell.
			var b strings.Builder
			b.WriteString(indent + "|")
			for _, c := range cells {
				if c != "" {
					b.WriteString(" " + c)
				}
				b.WriteString(" |")
			}
			lines[j] = b.String() + lines[j][len(row):]
			i = j
		}
	}
	return strings.Join(lines, "")
}

var delimRE = regexp.MustCompile(`^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$`)

func isTableRow(line string) bool {
	t := strings.TrimSpace(line)
	return t != "" && strings.Contains(t, "|") && !strings.HasPrefix(t, ">")
}

// splitRow splits a row at the pipes that separate its cells: every pipe
// a backslash does not escape, inside a code span too, as GitHub's tables
// do.
func splitRow(row string) []string {
	row = strings.TrimPrefix(row, "|")
	if strings.HasSuffix(row, "|") && !strings.HasSuffix(row, `\|`) {
		row = row[:len(row)-1]
	}
	var cells []string
	var cur strings.Builder
	for i := 0; i < len(row); i++ {
		switch c := row[i]; {
		case c == '\\' && i+1 < len(row):
			cur.WriteByte(c)
			cur.WriteByte(row[i+1])
			i++
		case c == '|':
			cells = append(cells, strings.TrimSpace(cur.String()))
			cur.Reset()
		default:
			cur.WriteByte(c)
		}
	}
	return append(cells, strings.TrimSpace(cur.String()))
}
