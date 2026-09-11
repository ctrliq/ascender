import Base from '../Base';
import type { Http } from '../Base';

class Mesh extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/mesh_visualizer/';
  }
}
export default Mesh;
