package tasks

import (
	"archive/tar"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/models"
)

// The project content cache (RunProjectUpdate's cache handling in
// main/tasks/jobs.py): a successful update that installed requirements
// keeps its roles and collections in
// <PROJECTS_ROOT>/.__awx_cache/<local_path>/<cache_id>, and publishes them
// as reqcache_<hash>/ keyed by the requirements content so a later revision
// with the same requirements reuses them. Jobs copy the checkout and that
// cache into their private data directory.

// requirementsSubfolders is REQUIREMENTS_SUBFOLDERS.
var requirementsSubfolders = []string{"requirements_collections", "requirements_roles"}

var requirementsHashRe = regexp.MustCompile(`^[0-9a-f]{64}$`)

// requirementsRefreshLaunchTypes install requirements afresh instead of
// reusing a requirements cache (REQUIREMENTS_CACHE_REFRESH_LAUNCH_TYPES).
var requirementsRefreshLaunchTypes = map[string]bool{"manual": true, "scheduled": true, "relaunch": true}

// projectPathFor is get_project_path(check_if_exists=False).
func (d *Dispatcher) projectPathFor(localPath string) string {
	base := filepath.Base(localPath)
	if localPath == "" || base == "." || strings.HasPrefix(base, ".") {
		return ""
	}
	return filepath.Join(d.Cfg.ProjectsRoot, base)
}

// projectCacheBase is get_cache_path.
func (d *Dispatcher) projectCacheBase(localPath string) string {
	return filepath.Join(d.Cfg.ProjectsRoot, ".__awx_cache", filepath.Base(localPath))
}

// projectCacheID is Project.cache_id: the revision, else the last job.
func projectCacheID(p *models.Project) string {
	if p.SCMRevision != "" {
		return p.SCMRevision
	}
	if p.LastJobID == nil {
		return "None"
	}
	return strconv.FormatInt(*p.LastJobID, 10)
}

// puBranchOverride is ProjectUpdate.branch_override.
func puBranchOverride(pu *models.ProjectUpdate, p *models.Project) bool {
	if p == nil {
		return true
	}
	return pu.SCMBranch != "" && pu.SCMBranch != p.SCMBranch
}

// puCacheID is ProjectUpdate.cache_id: the revision the update fetched.
func puCacheID(pu *models.ProjectUpdate, p *models.Project) string {
	if puBranchOverride(pu, p) {
		return strconv.FormatInt(pu.ID, 10)
	}
	if pu.SCMRevision != "" {
		return pu.SCMRevision
	}
	return projectCacheID(p)
}

// readRequirementsHash is read_requirements_hash.
func readRequirementsHash(cachePath string) string {
	// The cache is written by the project update's container: read it
	// through readJobFile, which follows nothing out of the directory.
	b, err := readJobFile(cachePath, filepath.Join(cachePath, ".requirements_hash"), 4096)
	if err != nil {
		return ""
	}
	h := strings.TrimSpace(string(b))
	if requirementsHashRe.MatchString(h) {
		return h
	}
	return ""
}

// readRequirementsGeneration is read_requirements_generation: nil when the
// cache predates generations, 0 when the file is unreadable.
func readRequirementsGeneration(cachePath string) *int64 {
	b, err := readJobFile(cachePath, filepath.Join(cachePath, ".requirements_generation"), 4096)
	if err != nil {
		return nil
	}
	n, err := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	if err != nil {
		n = 0
	}
	return &n
}

func reqcachePath(base, hash string) string {
	return filepath.Join(base, "reqcache_"+hash)
}

// recordedRequirementsGeneration is the refresh generation stored on the
// project.
func (d *Dispatcher) recordedRequirementsGeneration(ctx context.Context, projectID int64) int64 {
	var n *int64
	_ = d.DB.Pool.QueryRow(ctx, `SELECT requirements_generation FROM main_project WHERE unifiedjobtemplate_ptr_id = $1`, projectID).Scan(&n)
	if n == nil {
		return 0
	}
	return *n
}

// currentRequirementsGeneration is current_requirements_generation: the id
// of the latest successful update that refreshed the requirements.
func (d *Dispatcher) currentRequirementsGeneration(ctx context.Context, p *models.Project, pu *models.ProjectUpdate) int64 {
	if pu != nil && requirementsRefreshLaunchTypes[pu.LaunchType] {
		return pu.ID
	}
	recorded := d.recordedRequirementsGeneration(ctx, p.ID)
	var latest int64
	_ = d.DB.Pool.QueryRow(ctx, `SELECT COALESCE(MAX(uj.id), 0) FROM main_projectupdate pu JOIN main_unifiedjob uj ON uj.id = pu.unifiedjob_ptr_id
		WHERE pu.project_id = $1 AND uj.launch_type IN ('manual', 'scheduled', 'relaunch') AND uj.status = 'successful' AND pu.job_tags LIKE '%install_%'`, p.ID).Scan(&latest)
	if latest > recorded {
		return latest
	}
	return recorded
}

// projectCacheIsComplete is project_cache_is_complete.
func (d *Dispatcher) projectCacheIsComplete(ctx context.Context, p *models.Project) bool {
	base := d.projectCacheBase(p.LocalPath)
	cachePath := filepath.Join(base, projectCacheID(p))
	if !pathExists(cachePath) {
		return false
	}
	gen := readRequirementsGeneration(cachePath)
	if gen == nil {
		if d.recordedRequirementsGeneration(ctx, p.ID) != 0 {
			return false
		}
	} else if *gen != d.currentRequirementsGeneration(ctx, p, nil) {
		return false
	}
	h := readRequirementsHash(cachePath)
	if h == "" || pathExists(reqcachePath(base, h)) {
		return true
	}
	for _, sub := range requirementsSubfolders {
		if pathExists(filepath.Join(cachePath, sub)) {
			return true
		}
	}
	return false
}

// removeCacheEntry renames an entry out of the way, then deletes it, so a
// partial delete never looks like a usable cache.
func (d *Dispatcher) removeCacheEntry(dir, entry string) {
	old := filepath.Join(dir, entry)
	tmp := filepath.Join(dir, ".~~delete~~"+entry)
	if err := os.Rename(old, tmp); err != nil {
		d.Log.Warn("could not remove cache directory", "path", old)
		return
	}
	if err := os.RemoveAll(tmp); err != nil {
		d.Log.Warn("could not remove cache directory", "path", old)
	}
}

// clearProjectCache is clear_project_cache: everything but the kept
// revision, the stage and the requirements caches goes; the least recently
// used requirements caches past maxReqcache go too, unless the kept
// directories rely on them.
func (d *Dispatcher) clearProjectCache(dir, keep string, maxReqcache int) {
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return
	}
	protected := map[string]bool{}
	for _, kept := range []string{"stage", keep} {
		if h := readRequirementsHash(filepath.Join(dir, kept)); h != "" {
			protected["reqcache_"+h] = true
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	var reqcaches []string
	for _, e := range entries {
		name := e.Name()
		switch {
		case strings.HasPrefix(name, "reqcache_"):
			reqcaches = append(reqcaches, name)
		case name != keep && name != "stage":
			d.removeCacheEntry(dir, name)
		}
	}
	excess := len(reqcaches) - maxReqcache
	if excess <= 0 {
		return
	}
	var evictable []string
	mtime := map[string]time.Time{}
	for _, e := range reqcaches {
		if protected[e] {
			continue
		}
		if st, err := os.Stat(filepath.Join(dir, e)); err == nil {
			mtime[e] = st.ModTime()
		}
		evictable = append(evictable, e)
	}
	sort.SliceStable(evictable, func(i, j int) bool { return mtime[evictable[i]].Before(mtime[evictable[j]]) })
	for i := 0; i < excess && i < len(evictable); i++ {
		d.removeCacheEntry(dir, evictable[i])
	}
}

// syncRequirementsCache is sync_requirements_cache: a successful update's
// roles and collections are published (hard linked, plus one tar per
// folder) as the requirements cache its key names. Failures are logged.
func (d *Dispatcher) syncRequirementsCache(base, cachePath string, refresh bool) {
	h := readRequirementsHash(cachePath)
	if h == "" {
		return
	}
	target := reqcachePath(base, h)
	if pathExists(target) && !refresh {
		now := time.Now()
		_ = os.Chtimes(target, now, now)
		return
	}
	tmp, err := os.MkdirTemp(base, ".~~delete~~reqcache_tmp_")
	if err != nil {
		d.Log.Error("could not save requirements cache", "path", target, "err", err)
		return
	}
	defer func() {
		if tmp != "" {
			_ = os.RemoveAll(tmp)
		}
	}()
	for _, sub := range requirementsSubfolders {
		src := filepath.Join(cachePath, sub)
		if !pathExists(src) {
			continue
		}
		dst := filepath.Join(tmp, sub)
		if err := linkTree(src, dst); err != nil {
			d.Log.Error("could not save requirements cache", "path", target, "err", err)
			return
		}
		if err := tarDir(dst, dst+".tar", sub); err != nil {
			d.Log.Warn("could not archive requirements folder, jobs will copy the folder", "folder", sub, "path", target)
			_ = os.Remove(dst + ".tar")
		}
	}
	if pathExists(target) {
		d.removeCacheEntry(base, filepath.Base(target))
	}
	if err := os.Rename(tmp, target); err != nil {
		d.Log.Error("could not save requirements cache", "path", target, "err", err)
		return
	}
	tmp = ""
}

// linkTree is copytree(symlinks=True, copy_function=_link_or_copy).
func linkTree(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)
		switch {
		case info.Mode()&os.ModeSymlink != 0:
			link, err := os.Readlink(path)
			if err != nil {
				return err
			}
			return os.Symlink(link, target)
		case info.IsDir():
			return os.MkdirAll(target, info.Mode().Perm()|0o700)
		case !info.Mode().IsRegular():
			// FIFOs, sockets and devices are not copied (opening one
			// blocks or never ends).
			return nil
		default:
			if err := os.Link(path, target); err == nil {
				return nil
			}
			return copyFile(path, target, info.Mode().Perm())
		}
	})
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// tarDir writes dir into an uncompressed tar named by arcname.
func tarDir(dir, tarPath, arcname string) error {
	f, err := os.Create(tarPath)
	if err != nil {
		return err
	}
	tw := tar.NewWriter(f)
	err = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		name := arcname
		if rel != "." {
			name = filepath.ToSlash(filepath.Join(arcname, rel))
		}
		link := ""
		if info.Mode()&os.ModeSymlink != 0 {
			if link, err = os.Readlink(path); err != nil {
				return err
			}
		}
		hdr, err := tar.FileInfoHeader(info, link)
		if err != nil {
			return err
		}
		hdr.Name = name
		if info.IsDir() {
			hdr.Name += "/"
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if info.Mode().IsRegular() {
			in, err := os.Open(path)
			if err != nil {
				return err
			}
			_, err = io.Copy(tw, in)
			in.Close()
			return err
		}
		return nil
	})
	if cerr := tw.Close(); err == nil {
		err = cerr
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return err
}

// extractTarData is tarfile.extractall(filter='data'): members may not
// leave the destination, links may not point outside it, and special
// files are refused.
func extractTarData(tarPath, dest string) error {
	f, err := os.Open(tarPath)
	if err != nil {
		return err
	}
	defer f.Close()
	tr := tar.NewReader(f)
	root, _ := filepath.Abs(dest)
	if err := os.MkdirAll(root, 0o700); err != nil {
		return err
	}
	// Every write goes through an os.Root on the destination: the checks
	// below only read the names, and a chain of links (a -> ., a/b -> ..)
	// passes them one at a time, but nothing is ever created through a
	// link that leads out of the destination.
	rt, err := os.OpenRoot(root)
	if err != nil {
		return err
	}
	defer rt.Close()
	inside := func(p string) bool {
		rel, err := filepath.Rel(root, p)
		return err == nil && rel != ".." && !strings.HasPrefix(rel, "../")
	}
	relOf := func(p string) string {
		rel, _ := filepath.Rel(root, p)
		return rel
	}
	unpackBudget := int64(maxRequirementsUnpacked)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		name := strings.TrimLeft(hdr.Name, "/")
		target := filepath.Join(root, name)
		if filepath.IsAbs(hdr.Name) || !inside(target) {
			return fmt.Errorf("%s is outside the destination", hdr.Name)
		}
		rel := relOf(target)
		mode := os.FileMode(hdr.Mode).Perm() &^ 0o022
		switch hdr.Typeflag {
		case tar.TypeDir:
			if rel == "." {
				continue
			}
			if err := rt.MkdirAll(rel, mode|0o700); err != nil {
				return fmt.Errorf("%s is outside the destination: %w", hdr.Name, err)
			}
		case tar.TypeReg:
			if err := rt.MkdirAll(filepath.Dir(rel), 0o755); err != nil {
				return fmt.Errorf("%s is outside the destination: %w", hdr.Name, err)
			}
			out, err := rt.OpenFile(rel, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return fmt.Errorf("%s is outside the destination: %w", hdr.Name, err)
			}
			n, err := io.Copy(out, io.LimitReader(tr, unpackBudget+1))
			unpackBudget -= n
			if err == nil && unpackBudget < 0 {
				err = fmt.Errorf("the requirements archive unpacks to more than %d bytes", maxRequirementsUnpacked)
			}
			if err != nil {
				out.Close()
				return err
			}
			if err := out.Close(); err != nil {
				return err
			}
		case tar.TypeSymlink:
			if filepath.IsAbs(hdr.Linkname) || !inside(filepath.Join(filepath.Dir(target), hdr.Linkname)) {
				return fmt.Errorf("%s links outside the destination", hdr.Name)
			}
			if err := rt.MkdirAll(filepath.Dir(rel), 0o755); err != nil {
				return fmt.Errorf("%s is outside the destination: %w", hdr.Name, err)
			}
			if err := rt.Symlink(hdr.Linkname, rel); err != nil {
				return err
			}
		case tar.TypeLink:
			src := filepath.Join(root, strings.TrimLeft(hdr.Linkname, "/"))
			if !inside(src) {
				return fmt.Errorf("%s links outside the destination", hdr.Name)
			}
			if err := rt.Link(relOf(src), rel); err != nil {
				return fmt.Errorf("%s links outside the destination: %w", hdr.Name, err)
			}
		default:
			return fmt.Errorf("%s is a special file", hdr.Name)
		}
	}
}

// makeLocalCopy is make_local_copy: the checkout (without .git) and the
// roles and collections of the revision's cache, or of the requirements
// cache it reused, go into a job's private data directory.
func (d *Dispatcher) makeLocalCopy(ctx context.Context, localPath, cacheID, pdd string) error {
	projectPath := d.projectPathFor(localPath)
	dest := filepath.Join(pdd, "project")
	_ = os.RemoveAll(dest)
	if err := copyTree(projectPath, dest, map[string]bool{".git": true}); err != nil {
		return err
	}
	base := d.projectCacheBase(localPath)
	cachePath := filepath.Join(base, cacheID)
	var subs []string
	if d.Settings.Bool(ctx, "ASCENDER_COLLECTIONS_ENABLED") {
		subs = append(subs, "requirements_collections")
	}
	if d.Settings.Bool(ctx, "ASCENDER_ROLES_ENABLED") {
		subs = append(subs, "requirements_roles")
	}
	h := readRequirementsHash(cachePath)
	for _, sub := range subs {
		src := filepath.Join(cachePath, sub)
		dst := filepath.Join(pdd, sub)
		if !pathExists(src) && h != "" {
			// This revision reused the requirements of an earlier one.
			reqSub := filepath.Join(reqcachePath(base, h), sub)
			if pathExists(reqSub + ".tar") {
				if err := extractTarData(reqSub+".tar", pdd); err == nil {
					continue
				}
				d.Log.WarnContext(ctx, "could not extract requirements cache archive, copying the folder instead", "path", reqSub+".tar")
				_ = os.RemoveAll(dst)
			}
			src = reqSub
		}
		if pathExists(src) {
			_ = os.RemoveAll(dst)
			if err := copyTree(src, dst, nil); err != nil {
				return err
			}
		}
	}
	return nil
}
