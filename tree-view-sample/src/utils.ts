import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface LinkedDeps {
	[key: string]: {
		from?: string;
		to?: string;
	};
}

export const projectName = vscode.workspace.workspaceFolders?.[0].name;
export const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
export const ycPath = path.join(rootPath, '.yc');
const linkedDepsPath = path.join(rootPath, '.yc/linkedDeps.json');

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
