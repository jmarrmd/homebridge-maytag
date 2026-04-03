"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhirlpoolPlatform = void 0;
const whirlpoolApi_1 = require("./whirlpoolApi");
const platformAccessory_1 = require("./platformAccessory");
const PLUGIN_NAME = 'homebridge-whirlpool';
const PLATFORM_NAME = 'WhirlpoolCloud';
class WhirlpoolPlatform {
    constructor(log, config, homebridgeApi) {
        this.log = log;
        this.config = config;
        this.homebridgeApi = homebridgeApi;
        this.accessories = [];
        this.managedAccessories = new Map();
        this.pollInterval = null;
        this.Service = homebridgeApi.hap.Service;
        this.Characteristic = homebridgeApi.hap.Characteristic;
        this.homebridgeApi.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    async discoverDevices() {
        const { username, password, brand = 'maytag', pollSeconds = 60 } = this.config;
        if (!username || !password) {
            this.log.error('Missing username or password in config. Plugin will not start.');
            return;
        }
        try {
            this.api = new whirlpoolApi_1.WhirlpoolApi(username, password, brand, this.log);
        }
        catch (err) {
            this.log.error(`Failed to initialize API: ${err}`);
            return;
        }
        let appliances;
        try {
            appliances = await this.api.getAppliances();
        }
        catch (err) {
            this.log.error(`Failed to fetch appliances: ${err}`);
            return;
        }
        this.log.info(`Found ${appliances.length} appliance(s)`);
        // Filter to only washers and dryers by default, unless includeAll is set
        const relevant = this.config.includeAll
            ? appliances
            : appliances.filter(a => a.categoryName.includes('wash') ||
                a.categoryName.includes('dry') ||
                a.categoryName.includes('laundry'));
        if (relevant.length === 0 && appliances.length > 0) {
            this.log.warn('No washers/dryers found. All appliances: ' +
                appliances.map(a => `${a.name} (${a.categoryName})`).join(', ') +
                '. Set "includeAll": true in config to include all appliance types.');
        }
        const registeredUUIDs = new Set();
        for (const appliance of relevant) {
            const uuid = this.homebridgeApi.hap.uuid.generate(appliance.said);
            registeredUUIDs.add(uuid);
            const existingAccessory = this.accessories.find(a => a.UUID === uuid);
            if (existingAccessory) {
                this.log.info('Restoring existing accessory:', appliance.name);
                existingAccessory.context.appliance = appliance;
                this.homebridgeApi.updatePlatformAccessories([existingAccessory]);
                const managed = new platformAccessory_1.WhirlpoolAccessory(this, existingAccessory, this.api, appliance, this.log);
                this.managedAccessories.set(appliance.said, managed);
            }
            else {
                this.log.info('Adding new accessory:', appliance.name);
                const accessory = new this.homebridgeApi.platformAccessory(appliance.name, uuid);
                accessory.context.appliance = appliance;
                const managed = new platformAccessory_1.WhirlpoolAccessory(this, accessory, this.api, appliance, this.log);
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
    async pollStatus() {
        for (const [said, managed] of this.managedAccessories) {
            try {
                const status = await this.api.getApplianceStatus(said);
                managed.updateStatus(status.isRunning);
            }
            catch (err) {
                this.log.debug(`Failed to poll ${said}: ${err}`);
            }
        }
    }
}
exports.WhirlpoolPlatform = WhirlpoolPlatform;
exports.default = (api) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, WhirlpoolPlatform);
};
