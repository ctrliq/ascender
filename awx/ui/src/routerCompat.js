// Single indirection point for the react-router API the app uses. The
// react-router-dom-v5-compat -> v6 migration was landed in three steps by first
// routing every consumer through this module and then repointing it here, so the
// whole app flipped to react-router-dom v6 from one place. It is kept as the
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
} from 'react-router-dom';
