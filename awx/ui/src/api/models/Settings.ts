import Base from '../Base';
import type { Http } from '../Base';

class Settings extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/settings/';
  }

  readAllOptions() {
    return this.http.options(`${this.baseUrl}all/`);
  }

  updateAll(data: unknown) {
    return this.http.patch(`${this.baseUrl}all/`, data);
  }

  readAll() {
    return this.http.get(`${this.baseUrl}all/`);
  }

  readSystem() {
    return this.http.get(`${this.baseUrl}system/`);
  }

  updateCategory(category: unknown, data: unknown) {
    return this.http.patch(`${this.baseUrl}${category}/`, data);
  }

  readCategory(category: unknown) {
    return this.http.get(`${this.baseUrl}${category}/`);
  }

  readCategoryOptions(category: unknown) {
    return this.http.options(`${this.baseUrl}${category}/`);
  }

  createTest(category: unknown, data: unknown) {
    return this.http.post(`${this.baseUrl}${category}/test/`, data);
  }

  revertCategory(category: unknown) {
    return this.http.delete(`${this.baseUrl}${category}/`);
  }
}

export default Settings;
