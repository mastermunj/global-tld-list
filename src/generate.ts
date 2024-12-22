import fs from "node:fs";
import path from "node:path";
import { toUnicode } from "punycode";

const ianaUrl = "http://data.iana.org/TLD/tlds-alpha-by-domain.txt";
const __dirname = import.meta.dirname;

(async (): Promise<void> => {
	const res = await fetch(ianaUrl);
	const text = await res.text();
	/**
	 * A Set currently seems to be the fasted version:
	 * ref.: https://www.measurethat.net/Benchmarks/Show/13803/0/arrayincludes-vs-sethas-vas-maphas#latest_results_block
	 */
	const tlds = new Set<string>();

	for (const line of text.toLowerCase().split("\n")) {
		const tld = line.startsWith("xn--") ? toUnicode(line).trim() : line.trim();

		if (tld.length <= 0 || tld.startsWith("#")) {
			continue;
		}

		tlds.add(tld);
	}

	const dataFile = path.join(
		path.dirname(__dirname),
		"data",
		"serialized.json",
	);

	await fs.promises.writeFile(dataFile, JSON.stringify([...tlds]));
})();
