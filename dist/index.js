"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TLDs = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class TLDs {
    static isValid(tld) {
        return this.tlds.has(tld);
    }
}
exports.TLDs = TLDs;
_a = TLDs;
(() => {
    const dataFile = path_1.default.join(path_1.default.dirname(__dirname), 'data', 'serialized.txt');
    const serialized = fs_1.default.readFileSync(dataFile, 'utf-8');
    _a.tlds = new Map(JSON.parse(serialized));
})();
