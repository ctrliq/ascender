import Base from '../Base';
import type { Http } from '../Base';

/** One instance in the mesh, as the visualizer endpoint describes it. */
export interface MeshNodeRecord {
  id: number;
  hostname: string;
  node_type: string;
  node_state: string;
  enabled?: boolean;
}

/** One peering between two instances. */
export interface MeshLinkRecord {
  source: string;
  target: string;
  link_state: string;
}

/** The whole mesh: every instance, and every link between them. */
export interface MeshRecord {
  nodes: MeshNodeRecord[];
  links: MeshLinkRecord[];
}

class Mesh extends Base<MeshRecord> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/mesh_visualizer/';
  }

  // The mesh comes back whole rather than as a page of nodes.
  read<T = MeshRecord>() {
    return this.http.get<T>(this.baseUrl);
  }
}

export default Mesh;
