"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TLDs = void 0;
const serialized_json_1 = __importDefault(require("../data/serialized.json"));
class TLDs {
    static isValid(tld) {
        return this.tlds.has(tld);
    }
}
exports.TLDs = TLDs;
TLDs.tlds = new Map(serialized_json_1.default);
