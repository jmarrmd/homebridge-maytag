import type { API, DynamicPlatformPlugin, PlatformAccessory, PlatformConfig, Logger, Service, Characteristic } from 'homebridge';
export declare class WhirlpoolPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly homebridgeApi: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    private readonly accessories;
    private readonly managedAccessories;
    private api;
    private pollInterval;
    constructor(log: Logger, config: PlatformConfig, homebridgeApi: API);
    configureAccessory(accessory: PlatformAccessory): void;
    private discoverDevices;
    private pollStatus;
}
declare const _default: (api: API) => void;
export default _default;
