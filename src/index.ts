import data from "../data/serialized.json" with { type: "json" };

const tlds = new Set(data);

export const isValidTLD = (tld: string) => {
	return tlds.has(tld);
};

export const TLDs = {
	isValid: isValidTLD,
	tlds,
};

export default TLDs;
