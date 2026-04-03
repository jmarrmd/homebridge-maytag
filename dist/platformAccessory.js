"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhirlpoolAccessory = void 0;
const MACHINE_STATE_NAMES = {
    '0': 'Standby',
    '1': 'Setting',
    '2': 'Delay Countdown',
    '3': 'Delay Pause',
    '4': 'Smart Delay',
    '5': 'Smart Grid Pause',
    '6': 'Paused',
    '7': 'Running',
    '8': 'Running (Post-Cycle)',
    '9': 'Exception',
    '10': 'Complete',
    '11': 'Power Failure',
    '12': 'Service Diagnostic',
    '13': 'Factory Diagnostic',
    '14': 'Life Test',
    '15': 'Customer Focus Mode',
    '16': 'Demo Mode',
    '17': 'Hard Stop / Error',
    '18': 'System Init',
};
class WhirlpoolAccessory {
    constructor(platform, accessory, api, appliance, log) {
        this.platform = platform;
        this.accessory = accessory;
        this.api = api;
        this.appliance = appliance;
        this.log = log;
        this.isRunning = false;
        const Characteristic = this.platform.Characteristic;
        // Accessory information
        const infoService = this.accessory.getService(this.platform.Service.AccessoryInformation);
        infoService
            .setCharacteristic(Characteristic.Manufacturer, 'Whirlpool')
            .setCharacteristic(Characteristic.Model, appliance.modelNumber || appliance.categoryName)
            .setCharacteristic(Characteristic.SerialNumber, appliance.said);
        // Outlet service - "On" = appliance is running
        this.outletService =
            this.accessory.getService(this.platform.Service.Outlet) ||
                this.accessory.addService(this.platform.Service.Outlet, appliance.name);
        this.outletService.getCharacteristic(Characteristic.On)
            .onGet(this.getOn.bind(this))
            .onSet(this.setOn.bind(this));
        // OutletInUse also reflects running state
        this.outletService.getCharacteristic(Characteristic.OutletInUse)
            .onGet(this.getOn.bind(this));
        this.outletService.setCharacteristic(Characteristic.Name, appliance.name);
    }
    async getOn() {
        try {
            const status = await this.api.getApplianceStatus(this.appliance.said);
            this.isRunning = status.isRunning;
            const stateName = MACHINE_STATE_NAMES[status.machineState] || `Unknown (${status.machineState})`;
            this.log.debug(`[${this.appliance.name}] State: ${stateName}, Running: ${status.isRunning}, Time remaining: ${status.timeRemaining} min`);
            return status.isRunning;
        }
        catch (err) {
            this.log.error(`[${this.appliance.name}] Failed to get status: ${err}`);
            return this.isRunning;
        }
    }
    setOn(_value) {
        // We don't actually control the appliance - just read status
        this.log.info(`[${this.appliance.name}] Cannot control appliance remotely via HomeKit. State is read-only.`);
        // Revert to actual state after a short delay
        setTimeout(() => {
            this.outletService.updateCharacteristic(this.platform.Characteristic.On, this.isRunning);
        }, 500);
    }
    updateStatus(isRunning) {
        this.isRunning = isRunning;
        this.outletService.updateCharacteristic(this.platform.Characteristic.On, isRunning);
        this.outletService.updateCharacteristic(this.platform.Characteristic.OutletInUse, isRunning);
    }
}
exports.WhirlpoolAccessory = WhirlpoolAccessory;
