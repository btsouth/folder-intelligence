export function stableFingerprint(parts: string[]): string {
	let hash = 0xcbf29ce484222325n;
	const prime = 0x100000001b3n;
	const mask = 0xffffffffffffffffn;
	const input = parts.join('\u001f');
	for (let index = 0; index < input.length; index += 1) {
		hash ^= BigInt(input.charCodeAt(index));
		hash = (hash * prime) & mask;
	}
	return hash.toString(16).padStart(16, '0');
}
