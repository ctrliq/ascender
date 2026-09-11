import type { QSParams } from 'util/qs';
import type { BaseConstructor } from '../Base';
import type { Label, Paginated } from '../../types/api';

const LabelsMixin = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    readLabels(id: number | string, params?: QSParams) {
      return this.http.get(`${this.baseUrl}${id}/labels/`, {
        params,
      });
    }

    readAllLabels(id: number | string) {
      const fetchLabels = async (
        pageNo = 1,
        labels: Label[] = []
      ): Promise<{ data: { results: Label[] } }> => {
        try {
          const { data } = await this.http.get<Paginated<Label>>(
            `${this.baseUrl}${id}/labels/`,
            {
              params: {
                page: pageNo,
                page_size: 200,
              },
            }
          );
          if (data?.next) {
            return fetchLabels(pageNo + 1, labels.concat(data.results));
          }
          return Promise.resolve({
            data: {
              results: labels.concat(data.results),
            },
          });
        } catch (error) {
          return Promise.reject(error);
        }
      };

      return fetchLabels();
    }

    associateLabel(
      id: number | string,
      label: { name: string },
      /** Null where the caller has no organization to put the label under. */
      orgId: number | string | null
    ) {
      return this.http.post(`${this.baseUrl}${id}/labels/`, {
        name: label.name,
        organization: orgId,
      });
    }

    disassociateLabel(id: number | string, label: { id: number }) {
      return this.http.post(`${this.baseUrl}${id}/labels/`, {
        id: label.id,
        disassociate: true,
      });
    }
  };

export default LabelsMixin;
