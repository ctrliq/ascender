import { RootAPI, UsersAPI } from 'api';
import bootstrapPendo from './bootstrapPendo';

/** The parts of /api/v2/config/ this reads, plus whatever else it carries. */
export interface PendoConfig {
  version: string;
  trial?: boolean;
  license_type?: string;
  instance_count?: number;
  license_date?: number;
  ansible_version?: string;
  analytics_status?: string;
  license_info?: Record<string, unknown>;
  me: { id: number; is_superuser?: boolean };
  [key: string]: unknown;
}

interface PendoOptions {
  apiKey: string;
  visitor: { id: number; role: string | null };
  account: Record<string, unknown>;
}

declare global {
  interface Window {
    pendo: { initialize: (options: PendoOptions) => void };
  }
}

function buildPendoOptions(
  config: PendoConfig,
  pendoApiKey: string
): PendoOptions {
  const towerVersion = config.version.split('-')[0];
  const trial = config.trial ? config.trial : false;

  return {
    apiKey: pendoApiKey,
    visitor: {
      id: 0,
      role: null,
    },
    account: {
      id: 'tower.ansible.com',
      planLevel: config.license_type,
      planPrice: config.instance_count,
      creationDate: config.license_date,
      trial,
      tower_version: towerVersion,
      ansible_version: config.ansible_version,
    },
  };
}

async function buildPendoOptionsRole(
  options: PendoOptions,
  config: PendoConfig
): Promise<PendoOptions> {
  // No try/catch: this used to wrap whatever it caught in new Error(error),
  // which stringified one Error into the message of another and lost the
  // original stack. Letting it propagate is what that wrapper was for.
  if (config.me.is_superuser) {
    options.visitor.role = 'admin';
  } else {
    const { data } = await UsersAPI.readAdminOfOrganizations(config.me.id);
    if ((data as { count: number }).count > 0) {
      options.visitor.role = 'orgadmin';
    } else {
      options.visitor.role = 'user';
    }
  }
  return options;
}

async function issuePendoIdentity(config: PendoConfig): Promise<void> {
  if (!('license_info' in config)) {
    config.license_info = {};
  }
  config.license_info!.analytics_status = config.analytics_status;
  config.license_info!.version = config.version;
  config.license_info!.ansible_version = config.ansible_version;

  if (config.analytics_status !== 'off') {
    const { data } = await RootAPI.readAssetVariables();
    const { PENDO_API_KEY } = data as { PENDO_API_KEY?: string };
    if (PENDO_API_KEY && PENDO_API_KEY !== '') {
      bootstrapPendo(PENDO_API_KEY);
      const pendoOptions = buildPendoOptions(config, PENDO_API_KEY);
      const pendoOptionsWithRole = await buildPendoOptionsRole(
        pendoOptions,
        config
      );
      window.pendo.initialize(pendoOptionsWithRole);
    }
  }
}

export default issuePendoIdentity;
