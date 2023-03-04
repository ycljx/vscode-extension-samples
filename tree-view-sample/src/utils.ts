import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface LinkedDeps {
	[key: string]: {
		from?: string;
		to?: string;
	};
}

export const curProjectName = vscode.workspace.workspaceFolders?.[0].name;
export const curRootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
export const curYcPath = path.join(curRootPath, '.yc');
const curLinkedDepsPath = path.join(curRootPath, '.yc/linkedDeps.json');

export const getLinkedDeps = async (depsPath?: string) => {
	const linkedDepsPath = depsPath || curLinkedDepsPath;
	let linkedDeps: LinkedDeps = {};
	const isExist = await fs.pathExists(linkedDepsPath);
	if (isExist) linkedDeps = await fs.readJson(linkedDepsPath);
	return linkedDeps;
};

export const setLinkedDeps = async (linkedDeps: LinkedDeps, depsPath?: string) => {
	const linkedDepsPath = depsPath || curLinkedDepsPath;
	const isExist = await fs.pathExists(linkedDepsPath);
	if (!isExist) await fs.ensureFile(linkedDepsPath);
	await fs.writeJson(linkedDepsPath, linkedDeps, { spaces: 2 });
};
