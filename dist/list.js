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
exports.List = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const punycode_1 = require("punycode");
class List {
    static getData() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(List.ianaUrl);
            return response.text();
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
    static generate() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield List.getData();
            const tlds = List.process(response);
            const dataFile = node_path_1.default.join(node_path_1.default.dirname(__dirname), 'data', 'serialized.json');
            yield node_fs_1.default.promises.writeFile(dataFile, JSON.stringify([...tlds]));
        });
    }
}
exports.List = List;
List.ianaUrl = 'http://data.iana.org/TLD/tlds-alpha-by-domain.txt';
(() => __awaiter(void 0, void 0, void 0, function* () {
    yield List.generate();
}))();
