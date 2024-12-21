export default {
	"*.{ts,tsx,json}": "biome check . --write",
	"**/*.ts?(x)": () => "tsc -p tsconfig.json",
};
