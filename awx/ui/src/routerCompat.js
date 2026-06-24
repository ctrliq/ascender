// Single indirection point for the react-router API the app uses. The
// v5-compat -> v6 -> v7 migration was landed in steps by first routing every
// consumer through this module and then repointing it here. It is kept as the
// canonical import site for these symbols.
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
} from 'react-router';
