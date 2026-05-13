import type {
  PlatformAccessory,
  Service,
  CharacteristicValue,
  Logger,
} from 'homebridge';
import { HapStatusError, HAPStatus } from '@homebridge/hap-nodejs';
import type { WhirlpoolPlatform } from './index';
import type { WhirlpoolApi, ApplianceInfo, ApplianceStatus } from './whirlpoolApi';

const MACHINE_STATE_NAMES: Record<string, string> = {
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

export class WhirlpoolAccessory {
  private outletService: Service;
  private isRunning = false;

  constructor(
    private readonly platform: WhirlpoolPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly api: WhirlpoolApi,
    private readonly appliance: ApplianceInfo,
    private readonly log: Logger,
  ) {
    const Characteristic = this.platform.Characteristic;

    // Accessory information
    const infoService = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    infoService
      .setCharacteristic(Characteristic.Manufacturer, 'Whirlpool')
      .setCharacteristic(Characteristic.Model, appliance.modelNumber || appliance.categoryName)
      .setCharacteristic(Characteristic.SerialNumber, appliance.said);

    // Outlet service - "On" = appliance is running
    this.outletService =
      this.accessory.getService(this.platform.Service.Outlet) ||
      this.accessory.addService(this.platform.Service.Outlet, appliance.name);

    this.outletService.getCharacteristic(Characteristic.On)
      .onSet(this.setOn.bind(this));

    this.outletService.setCharacteristic(Characteristic.Name, appliance.name);
  }

  setOn(_value: CharacteristicValue): void {
    // Appliance state is read-only — reject control attempts immediately
    this.log.info(`[${this.appliance.name}] Cannot control appliance remotely via HomeKit. State is read-only.`);
    throw new HapStatusError(HAPStatus.READ_ONLY_CHARACTERISTIC);
  }

  updateStatus(status: ApplianceStatus): void {
    const stateName = MACHINE_STATE_NAMES[status.machineState] || `Unknown (${status.machineState})`;
    this.log.debug(`[${this.appliance.name}] Poll: State=${stateName}, Running=${status.isRunning}, Time remaining=${status.timeRemaining} min`);
    this.isRunning = status.isRunning;
    this.outletService.updateCharacteristic(this.platform.Characteristic.On, status.isRunning);
    this.outletService.updateCharacteristic(this.platform.Characteristic.OutletInUse, status.isRunning);
  }
}
