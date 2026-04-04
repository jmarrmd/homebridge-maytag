import type { PlatformAccessory, CharacteristicValue, Logger } from 'homebridge';
import type { WhirlpoolPlatform } from './index';
import type { WhirlpoolApi, ApplianceInfo, ApplianceStatus } from './whirlpoolApi';
export declare class WhirlpoolAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly api;
    private readonly appliance;
    private readonly log;
    private outletService;
    private isRunning;
    constructor(platform: WhirlpoolPlatform, accessory: PlatformAccessory, api: WhirlpoolApi, appliance: ApplianceInfo, log: Logger);
    getOn(): Promise<CharacteristicValue>;
    setOn(_value: CharacteristicValue): void;
    updateStatus(status: ApplianceStatus): void;
}
