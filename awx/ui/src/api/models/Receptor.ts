import type { ReceptorAddress } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class ReceptorAddresses extends Base<ReceptorAddress> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/receptor_addresses/';
  }

  updateReceptorAddresses(instanceId: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}`, data);
  }
}

export default ReceptorAddresses;
