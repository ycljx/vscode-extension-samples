import * as os from 'os';
import * as fs from 'fs-extra';

export interface LinkedDeps {
	[key: string]: {
		from?: string;
		to?: string;
		isRunning?: boolean;
	};
}

const linkedDepsPath = `${os.tmpdir()}/.yc/linkedDeps.json`;

export const getLinkedDeps = async () => {
	let linkedDeps: LinkedDeps = {};
	const isExist = await fs.pathExists(linkedDepsPath);
	if (isExist) linkedDeps = await fs.readJson(linkedDepsPath);
	return linkedDeps;
};

export const setLinkedDeps = async (linkedDeps: LinkedDeps) => {
	const isExist = await fs.pathExists(linkedDepsPath);
	if (!isExist) await fs.ensureFile(linkedDepsPath);
	await fs.writeJson(linkedDepsPath, linkedDeps, { spaces: 2 });
};
