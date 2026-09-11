import type { OptionsResponse } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

/**
 * One category of settings, as its endpoint answers.
 *
 * Which keys a category holds is the category's own business, and the screens
 * drive them off the OPTIONS response rather than off a fixed list.
 */
export type SettingCategory = Record<string, unknown>;

class Settings extends Base<SettingCategory> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/settings/';
  }

  readAllOptions() {
    return this.http.options<OptionsResponse>(`${this.baseUrl}all/`);
  }

  updateAll(data: unknown) {
    return this.http.patch<SettingCategory>(`${this.baseUrl}all/`, data);
  }

  readAll() {
    return this.http.get<SettingCategory>(`${this.baseUrl}all/`);
  }

  readSystem() {
    return this.http.get<SettingCategory>(`${this.baseUrl}system/`);
  }

  updateCategory(category: string, data: unknown) {
    return this.http.patch<SettingCategory>(
      `${this.baseUrl}${category}/`,
      data
    );
  }

  readCategory(category: string) {
    return this.http.get<SettingCategory>(`${this.baseUrl}${category}/`);
  }

  readCategoryOptions(category: string) {
    return this.http.options<OptionsResponse>(`${this.baseUrl}${category}/`);
  }

  createTest(category: string, data: unknown) {
    return this.http.post(`${this.baseUrl}${category}/test/`, data);
  }

  revertCategory(category: string) {
    return this.http.delete(`${this.baseUrl}${category}/`);
  }
}

export default Settings;
