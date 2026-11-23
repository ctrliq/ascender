package models

import (
	"path/filepath"

	"github.com/ctrliq/ascender/internal/pystr"
)

// ProjectPlaybooks is Project.playbooks: the files of a project checkout
// that could be playbooks (could_be_playbook), in the directories
// skip_directory lets through, found by a top-down os.walk that follows
// links to directories when followLinks (ASCENDER_SHOW_PLAYBOOK_LINKS) is
// on, sorted case-insensitively. There is no cap. skip_directory is given
// the directory as os.walk yields it, the project path included, as with
// inventories. A file is read only when it is a regular file inside the
// checkout (see ReadProjectFile), so a link that leads out of it, or to a
// FIFO or a device, is not a playbook (the old open() followed it).
func ProjectPlaybooks(projectPath string, followLinks bool) []string {
	out := []string{}
	if projectPath == "" {
		return out
	}
	walkProject(projectPath, followLinks, func(dir string, files []string) bool {
		if skipInventoryDirectory(dir) {
			return true
		}
		for _, name := range files {
			if rel, ok := couldBePlaybook(projectPath, dir, name); ok {
				out = append(out, rel)
			}
		}
		return true
	})
	sortCaseInsensitive(out)
	return out
}

// couldBePlaybook is could_be_playbook: a .yml or .yaml file (the
// extension as os.path.splitext gives it, case included) one of whose
// lines matches valid_playbook_re, or whose first line starts with
// "$ANSIBLE_VAULT;" (a vault-encrypted playbook). The file is read to its
// end if need be, line by line, as Python's text mode reads it (UTF-8,
// dropping what does not decode, universal newlines).
func couldBePlaybook(root, dir, name string) (string, bool) {
	if ext := pySplitextExt(name); ext != ".yml" && ext != ".yaml" {
		return "", false
	}
	path := filepath.Join(dir, name)
	rel, err := filepath.Rel(root, path)
	if err != nil || !playbookLinesMatch(root, path) {
		return "", false
	}
	return filepath.ToSlash(rel), true
}

// playbookKeys are the keys valid_playbook_re accepts:
// hosts|(ansible\.builtin\.)?include|(ansible\.builtin\.)?import_playbook,
// each followed by a colon.
var playbookKeys = []string{"hosts:", "include:", "ansible.builtin.include:", "import_playbook:", "ansible.builtin.import_playbook:"}

// maxPlaybookKey is the length of the longest of playbookKeys.
const maxPlaybookKey = len("ansible.builtin.import_playbook:")

// vaultHeader is what the first line of a vault-encrypted file starts with.
const vaultHeader = "$ANSIBLE_VAULT;"

// playbookLinesMatch reports whether a line of the file matches
// valid_playbook_re,
//
//	^\s*?-?\s*?(?:hosts|(ansible\.builtin\.)?include|(ansible\.builtin\.)?import_playbook):\s*?.*?$
//
// with re.match: Python whitespace (str.isspace), at most one dash and
// whitespace again, then a key and its colon (what follows the colon
// always matches, a line holding no newline but its last character), or
// whether line 0 starts with "$ANSIBLE_VAULT;". Only the start of each
// line is kept, so a long line costs no memory.
func playbookLinesMatch(root, path string) bool {
	f, _, err := openProjectFile(root, path)
	if err != nil {
		return false
	}
	defer f.Close()
	t := newPyTextReader(f)
	const (
		leading   = iota // before the dash
		afterDash        // after the dash
		key              // reading the key
		rest             // the line cannot match any more
	)
	line, state := 0, leading
	var keyBuf, head []rune
	for {
		r, ok := t.next()
		if !ok {
			return false
		}
		if line == 0 && len(head) < len(vaultHeader) && r != '\n' {
			head = append(head, r)
			if string(head) == vaultHeader {
				return true
			}
		}
		if r == '\n' {
			line, state, keyBuf = line+1, leading, keyBuf[:0]
			continue
		}
		switch state {
		case leading, afterDash:
			switch {
			case pystr.IsSpace(r):
				continue
			case r == '-' && state == leading:
				state = afterDash
				continue
			}
			state = key
			fallthrough
		case key:
			keyBuf = append(keyBuf, r)
			if matched, possible := playbookKeyPrefix(string(keyBuf)); matched {
				return true
			} else if !possible || len(keyBuf) >= maxPlaybookKey {
				state = rest
			}
		}
	}
}

// playbookKeyPrefix reports whether s is one of playbookKeys, and whether
// it is the start of one (so that more characters might make it one).
func playbookKeyPrefix(s string) (matched, possible bool) {
	for _, k := range playbookKeys {
		if s == k {
			return true, true
		}
		if len(s) < len(k) && k[:len(s)] == s {
			possible = true
		}
	}
	return false, possible
}
