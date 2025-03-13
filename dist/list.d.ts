export declare class List {
    static ianaUrl: string;
    static getData(): Promise<string>;
    static process(data: string): Map<string, number>;
    static generate(): Promise<void>;
}
