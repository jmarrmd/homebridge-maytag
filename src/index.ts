import type {
  API,
  DynamicPlatformPlugin,
  PlatformAccessory,
  PlatformConfig,
  Logger,
  Service,
  Characteristic,
} from 'homebridge';
import { WhirlpoolApi, type ApplianceStatus } from './whirlpoolApi';
import { WhirlpoolAccessory } from './platformAccessory';

const PLUGIN_NAME = 'homebridge-whirlpool';
const PLATFORM_NAME = 'WhirlpoolCloud';

export class WhirlpoolPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly accessories: PlatformAccessory[] = [];
  private readonly managedAccessories: Map<string, WhirlpoolAccessory> = new Map();
  private api!: WhirlpoolApi;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly homebridgeApi: API,
  ) {
    this.Service = homebridgeApi.hap.Service;
    this.Characteristic = homebridgeApi.hap.Characteristic;

    this.homebridgeApi.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private async discoverDevices(): Promise<void> {
    const { username, password, brand = 'maytag', pollSeconds = 60 } = this.config;

    if (!username || !password) {
      this.log.error('Missing username or password in config. Plugin will not start.');
      return;
    }

    try {
      this.api = new WhirlpoolApi(username, password, brand, this.log);
    } catch (err) {
      this.log.error(`Failed to initialize API: ${err}`);
      return;
    }

    let appliances;
    try {
      appliances = await this.api.getAppliances();
    } catch (err) {
      this.log.error(`Failed to fetch appliances: ${err}`);
      return;
    }

    this.log.info(`Found ${appliances.length} appliance(s)`);

    // Filter to only washers and dryers by default, unless includeAll is set
    const relevant = this.config.includeAll
      ? appliances
      : appliances.filter(a =>
          a.categoryName.includes('wash') ||
          a.categoryName.includes('dry') ||
          a.categoryName.includes('laundry'),
        );

    if (relevant.length === 0 && appliances.length > 0) {
      this.log.warn(
        'No washers/dryers found. All appliances: ' +
        appliances.map(a => `${a.name} (${a.categoryName})`).join(', ') +
        '. Set "includeAll": true in config to include all appliance types.',
      );
    }

    const registeredUUIDs = new Set<string>();

    for (const appliance of relevant) {
      const uuid = this.homebridgeApi.hap.uuid.generate(appliance.said);
      registeredUUIDs.add(uuid);

      const existingAccessory = this.accessories.find(a => a.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory:', appliance.name);
        existingAccessory.context.appliance = appliance;
        this.homebridgeApi.updatePlatformAccessories([existingAccessory]);
        const managed = new WhirlpoolAccessory(this, existingAccessory, this.api, appliance, this.log);
        this.managedAccessories.set(appliance.said, managed);
      } else {
        this.log.info('Adding new accessory:', appliance.name);
        const accessory = new this.homebridgeApi.platformAccessory(appliance.name, uuid);
        accessory.context.appliance = appliance;
        const managed = new WhirlpoolAccessory(this, accessory, this.api, appliance, this.log);
        this.managedAccessories.set(appliance.said, managed);
        this.homebridgeApi.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove stale accessories
    const stale = this.accessories.filter(a => !registeredUUIDs.has(a.UUID));
    if (stale.length > 0) {
      this.log.info(`Removing ${stale.length} stale accessory(ies)`);
      this.homebridgeApi.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }

    // Start polling
    const intervalMs = Math.max(30, pollSeconds) * 1000;
    this.log.info(`Polling appliance status every ${Math.max(30, pollSeconds)}s`);
    this.pollInterval = setInterval(() => this.pollStatus(), intervalMs);
    // Initial poll
    this.pollStatus();
  }

  private async pollStatus(): Promise<void> {
    for (const [said, managed] of this.managedAccessories) {
      try {
        const status = await this.api.getApplianceStatus(said);
        managed.updateStatus(status);
      } catch (err) {
        this.log.debug(`Failed to poll ${said}: ${err}`);
      }
    }
  }
}

export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, WhirlpoolPlatform);
};
