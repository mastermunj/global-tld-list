import { AxiosResponse } from 'axios';
export declare class Sync {
    static ianaUrl: string;
    static getData(): Promise<AxiosResponse<string>>;
    static process(data: string): Map<string, number>;
    static do(): Promise<void>;
}
