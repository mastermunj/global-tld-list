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
class Sync {
    static getData() {
        return __awaiter(this, void 0, void 0, function* () {
            return axios_1.default.get(Sync.ianaUrl);
        });
    }
    static process(data) {
        const tlds = new Map();
        data
            .toLowerCase()
            .split('\n')
            .forEach((line) => {
            if (line.length <= 0 || line.startsWith('#')) {
                return;
            }
            if (line.startsWith('xn--')) {
                line = (0, punycode_1.toUnicode)(line);
            }
            tlds.set(line.trim(), 1);
        });
        return tlds;
    }
    static do() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield Sync.getData();
            const tlds = Sync.process(response.data);
            const dataFile = path_1.default.join(path_1.default.dirname(__dirname), 'data', 'serialized.txt');
            yield fs_1.default.promises.writeFile(dataFile, JSON.stringify([...tlds]));
        });
    }
}
exports.Sync = Sync;
Sync.ianaUrl = 'http://data.iana.org/TLD/tlds-alpha-by-domain.txt';
