import type { Logger } from 'homebridge';
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
export declare class WhirlpoolApi {
    private readonly username;
    private readonly password;
    private readonly log;
    private tokenData;
    private readonly brand;
    constructor(username: string, password: string, brand: string, log: Logger);
    private request;
    private authenticate;
    private refreshToken;
    private ensureToken;
    private apiGet;
    getAppliances(): Promise<ApplianceInfo[]>;
    getApplianceStatus(said: string): Promise<ApplianceStatus>;
}
