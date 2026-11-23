package models

import (
	"bufio"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"unicode/utf8"
)

// maxInventoryListing is Project.inventories' cap: the walk stops once
// more than this many files were found, so at most 51 are listed.
const maxInventoryListing = 50

// InventoryFiles is Project.inventories: the files of a project checkout
// that could be inventories (could_be_inventory), in the directories
// skip_directory lets through, found by a top-down os.walk that does not
// follow links to directories, sorted case-insensitively. Directories are
// never listed.
func InventoryFiles(root string) []string {
	out := []string{}
	if root == "" {
		return out
	}
	walkProject(root, false, func(dir string, files []string) bool {
		if skipInventoryDirectory(dir) {
			return true
		}
		for _, name := range files {
			if rel, ok := couldBeInventory(root, dir, name); ok {
				out = append(out, rel)
				if len(out) > maxInventoryListing {
					return false
				}
			}
		}
		return true
	})
	sortCaseInsensitive(out)
	return out
}

// sortCaseInsensitive is sorted(results, key=lambda x: x.lower()): a
// stable sort on the lower-cased names.
func sortCaseInsensitive(out []string) {
	sort.SliceStable(out, func(i, j int) bool { return strings.ToLower(out[i]) < strings.ToLower(out[j]) })
}

// walkProject is os.walk(root, followlinks=followLinks), top down: visit
// is given each directory, as os.walk yields it (the root joined with the
// names on the way), and the names of the entries in it that are not
// directories, in directory order, as os.scandir gives them; it returns
// false to stop the walk. A directory that cannot be read is skipped whole
// (os.walk's onerror=None). A link to a directory is a directory
// (DirEntry.is_dir() follows it) and is walked into only with
// followLinks; a broken link is a file. With followLinks a link loop ends
// where the kernel refuses the path (ELOOP), as os.walk's did.
func walkProject(root string, followLinks bool, visit func(dir string, files []string) bool) {
	var walk func(dir string) bool
	walk = func(dir string) bool {
		f, err := os.Open(dir)
		if err != nil {
			return true
		}
		entries, err := f.ReadDir(-1)
		f.Close()
		if err != nil {
			return true
		}
		var dirs, files []string
		for _, e := range entries {
			isDir := e.IsDir()
			if e.Type()&os.ModeSymlink != 0 {
				st, err := os.Stat(filepath.Join(dir, e.Name()))
				isDir = err == nil && st.IsDir()
			}
			if isDir {
				dirs = append(dirs, e.Name())
			} else {
				files = append(files, e.Name())
			}
		}
		if !visit(dir, files) {
			return false
		}
		for _, name := range dirs {
			sub := filepath.Join(dir, name)
			if !followLinks {
				if st, err := os.Lstat(sub); err != nil || st.Mode()&os.ModeSymlink != 0 {
					continue
				}
			}
			if !walk(sub) {
				return false
			}
		}
		return true
	}
	walk(root)
}

// skipInventoryDirectory is skip_directory, given the directory os.walk
// yields: the project path joined with the directory, as the old walk
// passed it.
func skipInventoryDirectory(dirPath string) bool {
	elements := strings.Split(dirPath, string(filepath.Separator))
	for _, e := range elements {
		if e == "roles" || e == "tasks" {
			return true
		}
	}
	for _, e := range elements {
		if strings.HasPrefix(e, ".") {
			return true
		}
	}
	for _, e := range elements {
		if e == "group_vars" || e == "host_vars" {
			return true
		}
	}
	return false
}

// pySplitextExt is the extension os.path.splitext gives a file name: from
// the last dot, unless the dots all lead the name (".bashrc" has none).
func pySplitextExt(name string) string {
	dot := strings.LastIndexByte(name, '.')
	if dot <= 0 {
		return ""
	}
	if strings.Trim(name[:dot], ".") == "" {
		return ""
	}
	return name[dot:]
}

// couldBeInventory is could_be_inventory: files named inventory or hosts,
// .ini files and executables are inventories by their name; other files
// with an extension are not; a file without one is when one of its first
// eleven lines starts with a character of ^[a-zA-Z0-9_.=\[\]] (read as
// UTF-8, dropping what does not decode).
func couldBeInventory(root, dir, name string) (string, bool) {
	path := filepath.Join(dir, name)
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return "", false
	}
	rel = filepath.ToSlash(rel)
	ext := pySplitextExt(name)
	if name == "inventory" || name == "hosts" {
		return rel, true
	}
	if ext == ".ini" || syscall.Access(path, 1 /* X_OK */) == nil {
		return rel, true
	}
	if strings.Contains(ext, ".") {
		return "", false
	}
	if !inventoryLinesMatch(root, path) {
		return "", false
	}
	return rel, true
}

// validInventoryStart is valid_inventory_re, ^[a-zA-Z0-9_.=\[\]].
func validInventoryStart(r rune) bool {
	return r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("_.=[]", r)
}

// inventoryLinesMatch reads the file as Python's text mode did (UTF-8 with
// errors='ignore', universal newlines) and reports whether one of lines 0
// to 10 starts like an inventory line. Only a regular file inside the
// checkout is read (see ReadProjectFile): the old open() followed any link
// and would wait forever on a FIFO or /dev/zero; such a file counts as
// unreadable, which was could_be_inventory's IOError.
func inventoryLinesMatch(root, path string) bool {
	f, _, err := openProjectFile(root, path)
	if err != nil {
		return false
	}
	defer f.Close()
	t := newPyTextReader(f)
	line, start := 0, true
	for {
		r, ok := t.next()
		if !ok {
			return false
		}
		if start && validInventoryStart(r) {
			return true
		}
		start = false
		if r != '\n' {
			continue
		}
		line++
		if line > 10 {
			return false
		}
		start = true
	}
}

// pyTextReader gives the characters of a file opened as
// open(path, encoding='utf-8', errors='ignore') read them: bytes that do
// not decode are dropped, and "\r\n" and "\r" come as "\n" (universal
// newlines).
type pyTextReader struct {
	br *bufio.Reader
}

func newPyTextReader(r io.Reader) *pyTextReader { return &pyTextReader{br: bufio.NewReader(r)} }

// decoded is the next decoded character, before newline translation.
func (t *pyTextReader) decoded() (rune, bool) {
	for {
		r, size, err := t.br.ReadRune()
		if err != nil {
			return 0, false
		}
		if r == utf8.RuneError && size == 1 {
			continue
		}
		return r, true
	}
}

func (t *pyTextReader) next() (rune, bool) {
	r, ok := t.decoded()
	if !ok || r != '\r' {
		return r, ok
	}
	// The undecodable bytes after "\r" were dropped before the decoder
	// saw a "\n", so they do not part the two.
	for {
		b, err := t.br.Peek(1)
		if err != nil {
			return '\n', true
		}
		if b[0] == '\n' {
			_, _ = t.br.ReadByte()
			return '\n', true
		}
		if b[0] < utf8.RuneSelf {
			return '\n', true
		}
		n, size, err := t.br.ReadRune()
		if err != nil {
			return '\n', true
		}
		if n == utf8.RuneError && size == 1 {
			continue
		}
		_ = t.br.UnreadRune()
		return '\n', true
	}
}
