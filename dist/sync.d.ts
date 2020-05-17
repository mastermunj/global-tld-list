import { AxiosResponse } from 'axios';
export declare class Sync {
    static ianaUrl: string;
    static srcPath(): string;
    static getData(): Promise<AxiosResponse<string>>;
    static process(data: string): string[];
    static difference<T>(oldTLDs: T[], newTLDs: T[]): {
        added: T[];
        removed: T[];
    };
    static exportableTLDs(tlds: string[]): string;
    static writeTLDs(tlds: string[]): void;
    static do(): Promise<void>;
}
