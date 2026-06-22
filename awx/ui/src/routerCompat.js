// Single indirection point for react-router so the v5-compat -> v6 migration can
// flip the whole app from one place. While the migration is in flight this
// re-exports the v6 API from react-router-dom-v5-compat (which bridges the
// still-installed react-router-dom v5 Router via <CompatRouter>). The final
// migration step repoints these re-exports at `react-router-dom` once the
// package is on v6 -- every consumer imports from here, so nothing else changes.
//
// CompatRouter is intentionally not re-exported: it has no v6 equivalent and is
// used only by App.js, which keeps importing it directly until the final flip.
export {
  Link,
  Navigate,
  Route,
  Router,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
} from 'react-router-dom-v5-compat';
