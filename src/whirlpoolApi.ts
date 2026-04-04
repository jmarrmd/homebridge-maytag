import https from 'https';
import { URL, URLSearchParams } from 'url';
import type { Logger } from 'homebridge';

const BASE_URL = 'https://api.whrcloud.com';

const BRAND_CREDENTIALS: Record<string, { clientId: string; clientSecret: string }> = {
  whirlpool: {
    clientId: 'whirlpool_android_v2',
    clientSecret: 'rMVCgnKKhIjoorcRa7cpckh5irsomybd4tM9Ir3QxJxQZlzgWSeWpkkxmsRg1PL-',
  },
  maytag: {
    clientId: 'maytag_android_v2',
    clientSecret: 'ULTqdvvqK0O9XcSLO3nA2tJDTLFKxdaaeKrimPYdXvnLX_yUtPhxovESldBId0Tf',
  },
  kitchenaid: {
    clientId: 'kitchenaid_android_v2',
    clientSecret: 'jd15ExiJdEt8UgLWBslwkzkQkmRGCR9lVSgeaqcPmFZQc9pgxtpjmaPSw3g-aRXG',
  },
};

// Machine states 7 and 8 mean the appliance is actively running
const RUNNING_STATES = new Set(['7', '8']);

export interface ApplianceInfo {
  said: string;
  name: string;
  categoryName: string;
  modelNumber: string;
}

export interface ApplianceStatus {
  machineState: string;
  isRunning: boolean;
  doorOpen: boolean;
  timeRemaining: number;
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  expiresAt: number;
}

export class WhirlpoolApi {
  private tokenData: TokenData | null = null;
  private readonly brand: string;

  constructor(
    private readonly username: string,
    private readonly password: string,
    brand: string,
    private readonly log: Logger,
  ) {
    this.brand = brand.toLowerCase();
    if (!BRAND_CREDENTIALS[this.brand]) {
      throw new Error(`Unsupported brand: ${brand}. Use whirlpool, maytag, or kitchenaid.`);
    }
  }

  private request(url: string, options: https.RequestOptions, body?: string): Promise<{ status: number; data: string }> {
    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(new Error('Request timed out')); });
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  private async authenticate(): Promise<void> {
    const creds = BRAND_CREDENTIALS[this.brand];
    const params = new URLSearchParams({
      grant_type: 'password',
      username: this.username,
      password: this.password,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });

    const url = `${BASE_URL}/oauth/token`;
    const parsed = new URL(url);

    const res = await this.request(url, {
      method: 'POST',
      hostname: parsed.hostname,
      path: parsed.pathname,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'okhttp/3.12.0',
      },
    }, params.toString());

    if (res.status === 423) {
      throw new Error('Whirlpool account is locked. Unlock it via the mobile app.');
    }
    if (res.status !== 200) {
      throw new Error(`Authentication failed (HTTP ${res.status}): ${res.data}`);
    }

    const json = JSON.parse(res.data);
    this.tokenData = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      accountId: json.accountId,
      expiresAt: Date.now() + (json.expires_in * 1000) - 60000, // 1 min buffer
    };
    this.log.debug('Authenticated with Whirlpool cloud');
  }

  private async refreshToken(): Promise<void> {
    if (!this.tokenData) {
      return this.authenticate();
    }
    const creds = BRAND_CREDENTIALS[this.brand];
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokenData.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });

    const url = `${BASE_URL}/oauth/token`;
    const parsed = new URL(url);

    const res = await this.request(url, {
      method: 'POST',
      hostname: parsed.hostname,
      path: parsed.pathname,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'okhttp/3.12.0',
      },
    }, params.toString());

    if (res.status !== 200) {
      this.log.warn('Token refresh failed, re-authenticating...');
      this.tokenData = null;
      return this.authenticate();
    }

    const json = JSON.parse(res.data);
    this.tokenData = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      accountId: this.tokenData.accountId,
      expiresAt: Date.now() + (json.expires_in * 1000) - 60000,
    };
    this.log.debug('Token refreshed');
  }

  private async ensureToken(): Promise<void> {
    if (!this.tokenData) {
      await this.authenticate();
    } else if (Date.now() >= this.tokenData.expiresAt) {
      await this.refreshToken();
    }
  }

  private async apiGet(path: string): Promise<unknown> {
    await this.ensureToken();
    const url = `${BASE_URL}${path}`;
    const parsed = new URL(url);

    const res = await this.request(url, {
      method: 'GET',
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'Authorization': `Bearer ${this.tokenData!.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/3.12.0',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });

    if (res.status === 401) {
      this.log.warn('Token expired, re-authenticating...');
      await this.authenticate();
      return this.apiGet(path);
    }
    if (res.status !== 200) {
      throw new Error(`API request failed (HTTP ${res.status}): ${res.data}`);
    }
    return JSON.parse(res.data);
  }

  async getAppliances(): Promise<ApplianceInfo[]> {
    await this.ensureToken();
    const data = await this.apiGet(`/api/v3/appliance/all/account/${this.tokenData!.accountId}`) as Record<string, unknown>;

    const appliances: ApplianceInfo[] = [];
    const accountData = data[this.tokenData!.accountId] as Record<string, unknown> | undefined;
    if (!accountData) {
      this.log.warn('No appliance data found for account');
      return appliances;
    }

    for (const locationId of Object.keys(accountData)) {
      const location = accountData[locationId] as Record<string, unknown[]>;
      for (const type of ['tsAppliance', 'legacyAppliance']) {
        const list = location[type];
        if (!Array.isArray(list)) {
          continue;
        }
        for (const appliance of list) {
          const a = appliance as Record<string, string>;
          appliances.push({
            said: a.said || a.SAID,
            name: a.applianceName || a.said || 'Unknown',
            categoryName: (a.categoryName || '').toLowerCase(),
            modelNumber: a.modelNumber || '',
          });
        }
      }
    }

    return appliances;
  }

  async getApplianceStatus(said: string): Promise<ApplianceStatus> {
    const data = await this.apiGet(`/api/v1/appliance/${said}`) as Record<string, unknown>;
    const attrs = data as Record<string, { value?: string } | string>;

    // Log all attributes that look like machine/cycle state for debugging
    const stateKeys = Object.keys(attrs).filter(k =>
      /state|status|cycle|machine|running/i.test(k),
    );
    if (stateKeys.length > 0) {
      const stateSnapshot: Record<string, unknown> = {};
      for (const k of stateKeys) {
        const v = attrs[k];
        stateSnapshot[k] = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
      }
      this.log.debug(`[${said}] State-related attributes: ${JSON.stringify(stateSnapshot)}`);
    } else {
      this.log.debug(`[${said}] No state-related attributes found. All keys: ${Object.keys(attrs).join(', ')}`);
    }

    const getMachineState = (): string => {
      // Try common attribute names
      for (const key of [
        'Cavity_CycleStatusMachineState',
        'WashCavity_CycleStatusMachineState',
        'DryCavity_CycleStatusMachineState',
      ]) {
        const val = attrs[key];
        if (val !== undefined) {
          if (typeof val === 'object' && val !== null && 'value' in val) {
            this.log.debug(`[${said}] Matched machine state key: ${key} = ${val.value}`);
            return val.value ?? '0';
          }
          if (typeof val === 'string') {
            this.log.debug(`[${said}] Matched machine state key: ${key} = ${val}`);
            return val;
          }
        }
      }
      this.log.warn(`[${said}] No known machine state attribute found, defaulting to 0 (Standby)`);
      return '0';
    };

    const getAttrValue = (keys: string[]): string => {
      for (const key of keys) {
        const val = attrs[key];
        if (val !== undefined) {
          if (typeof val === 'object' && val !== null && 'value' in val) {
            return val.value ?? '0';
          }
          if (typeof val === 'string') {
            return val;
          }
        }
      }
      return '0';
    };

    const machineState = getMachineState();
    const doorOpen = getAttrValue(['Cavity_OpStatusDoorOpen']) === '1';
    const timeRemaining = parseInt(getAttrValue(['Cavity_TimeStatusEstTimeRemaining']), 10) || 0;

    return {
      machineState,
      isRunning: RUNNING_STATES.has(machineState),
      doorOpen,
      timeRemaining,
    };
  }
}
