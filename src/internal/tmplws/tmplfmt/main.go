// Command tmplfmt lays out the UI templates' markup on indented lines (see
// package tmplws). The server collapses that layout again when it parses a
// template, so the rendered pages do not change; a file whose collapsed form
// would change is reported and left alone.
//
//	go run ./internal/tmplws/tmplfmt [-l | -w] path...
//
// With neither flag the laid-out source is printed. Paths are files or
// directories, searched for .html files. make fmt-templates runs it with -w,
// make fmt-check with -l.
package main

import (
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/ctrliq/ascender/internal/tmplws"
)

func main() {
	list := flag.Bool("l", false, "list files whose layout differs, and exit 1 if there are any")
	write := flag.Bool("w", false, "write the result to the file")
	flag.Parse()
	if flag.NArg() == 0 || *list && *write {
		fmt.Fprintln(os.Stderr, "usage: tmplfmt [-l | -w] path...")
		os.Exit(2)
	}
	failed, differ := false, false
	for _, root := range flag.Args() {
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".html") {
				return err
			}
			b, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			src := string(b)
			out := tmplws.Format(src)
			if tmplws.Collapse(out) != tmplws.Collapse(src) {
				fmt.Fprintf(os.Stderr, "%s: layout would change the rendered page; left alone\n", path)
				failed = true
				return nil
			}
			if tmplws.Format(out) != out {
				fmt.Fprintf(os.Stderr, "%s: layout is not stable; left alone\n", path)
				failed = true
				return nil
			}
			switch {
			case *list:
				if out != src {
					fmt.Println(path)
					differ = true
				}
			case *write:
				if out != src {
					return os.WriteFile(path, []byte(out), 0o644)
				}
			default:
				fmt.Print(out)
			}
			return nil
		})
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			failed = true
		}
	}
	if failed || differ {
		os.Exit(1)
	}
}
