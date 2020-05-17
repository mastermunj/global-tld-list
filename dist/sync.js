"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sync = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const punycode_1 = require("punycode");
// import { TLDs as oldTLDs } from './index';
let Sync = /** @class */ (() => {
    class Sync {
        static srcPath() {
            return path_1.default.dirname(__dirname) + '/src';
        }
        static getData() {
            return __awaiter(this, void 0, void 0, function* () {
                return axios_1.default.get(Sync.ianaUrl);
            });
        }
        static process(data) {
            const tlds = [];
            data
                .toLowerCase()
                .split('\n')
                .forEach((line) => {
                if (line.length <= 0 || line.startsWith('#')) {
                    return;
                }
                if (line.startsWith('xn--')) {
                    line = punycode_1.toUnicode(line);
                }
                tlds.push(line.trim());
            });
            return tlds;
        }
        static difference(oldTLDs, newTLDs) {
            return {
                added: newTLDs.filter((tld) => !oldTLDs.includes(tld)),
                removed: oldTLDs.filter((tld) => !newTLDs.includes(tld)),
            };
        }
        static exportableTLDs(tlds) {
            const data = JSON.stringify(tlds, null, 2)
                .replace(/"/gi, `'`)
                .replace(`\n]`, `,\n]`);
            return `export const TLDs = ${data};\n`;
        }
        // static changes(added: string[], removed: string[]): string {
        //   let changes = '';
        //   if (added.length > 0) {
        //     changes = `Added: ${added.join(', ')}\n`;
        //   }
        //   if (removed.length > 0) {
        //     changes += `Removed: ${removed.join(', ')}\n`;
        //   }
        //   return changes;
        // }
        static writeTLDs(tlds) {
            const data = Sync.exportableTLDs(tlds);
            fs_1.default.writeFileSync(`${Sync.srcPath()}/index.ts`, data);
        }
        // static writeChanges(added: string[], removed: string[]): void {
        //   const changes = Sync.changes(added, removed);
        //   fs.writeFileSync(`${Sync.srcPath()}/.changes`, changes);
        // }
        static do() {
            return __awaiter(this, void 0, void 0, function* () {
                const response = yield Sync.getData();
                const tlds = Sync.process(response.data);
                // const { added, removed } = Sync.difference(oldTLDs, tlds);
                // if (added.length <= 0 && removed.length <= 0) {
                //   return;
                // }
                Sync.writeTLDs(tlds);
                // Sync.writeChanges(added, removed);
            });
        }
    }
    Sync.ianaUrl = 'http://data.iana.org/TLD/tlds-alpha-by-domain.txt';
    return Sync;
})();
exports.Sync = Sync;
