'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as process from 'process';
import * as fs from 'fs-extra';
import { DepNodeProvider, Dependency } from './nodeDependencies';
import { getLinkedDeps, setLinkedDeps } from './utils';

const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
const aliasPath = path.join(rootPath, 'alias.json');
const nodeDependenciesProvider = new DepNodeProvider(rootPath);

const handleDebugEntry = async (node: Dependency) => {
	const linkedDeps = await getLinkedDeps();
	if (!linkedDeps[node.label]?.from) {
		vscode.window.showWarningMessage('请先绑定该调试组件的根目录');
	}
	const curTerminal = vscode.window.terminals.find((t) => t.name === node.label);
	curTerminal?.dispose();
	const terminal = vscode.window.createTerminal(node.label);
	terminal.show();
	terminal.sendText(`tnpx -p @ali/orca-cli orca lk ${node.label}`);
	await setLinkedDeps(linkedDeps);
	vscode.window.onDidCloseTerminal(async (closedTerminal) => {
		const name = closedTerminal.name;
		const isAliasExist = await fs.pathExists(aliasPath);
		const alias = isAliasExist ? await fs.readJson(aliasPath) : {};
		delete alias[name];
		if (name === '@alife/xiaoer-json-form') {
			delete alias['@formily/next'];
			delete alias['@formily/next/lib/style.js'];
		}
		if (Object.keys(alias).length) {
			await fs.writeJson(aliasPath, alias, { spaces: 2 });
		} else {
			await fs.remove(aliasPath);
		}
	});
};

const handleEditEntry = async (node: Dependency) => {
	const linkedDeps = await getLinkedDeps();
	const fromVal = linkedDeps[node.label]?.from;
	const folderUris = await vscode.window.showOpenDialog({
		defaultUri: vscode.Uri.parse(fromVal || path.join(os.homedir(), 'Desktop')),
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false,
		openLabel: '确认待调试组件根目录',
	});
	if (folderUris) {
		const fromPath = folderUris[0].path;
		linkedDeps[node.label] = {
			from: fromPath,
		};
		await setLinkedDeps(linkedDeps);
		vscode.window.showInformationMessage(`绑定完成，开始监听${node.label}文件变化`);
		handleDebugEntry(node);
	}
};

const handleAddEntry = async () => {
	const packageJsonPath = path.join(rootPath, 'package.json');
	const packageJson = fs.readJsonSync(packageJsonPath);
	const linkedDeps = await getLinkedDeps();
	const restKeys = Object.keys(packageJson.dependencies).filter(
		(key) => !Object.keys(linkedDeps).includes(key)
	);
	const selected = await vscode.window.showQuickPick(restKeys, {
		placeHolder: '请选择要添加的组件',
	});
	if (selected) {
		linkedDeps[selected] = {};
		await setLinkedDeps(linkedDeps);
		nodeDependenciesProvider.refresh();
	}
};

const handleStartEntry = async () => {
	const startIndex = rootPath.lastIndexOf('/');
	const projectName = rootPath.slice(startIndex + 1);
	const curTerminal = vscode.window.terminals.find((t) => t.name === projectName);
	curTerminal?.dispose();
	let openStr = '';
	const answer = await vscode.window.showInformationMessage('是否需要以跨域模式打开Chrome浏览器？', '是', '否');
	if (answer === '是') {
		openStr = `open -n /Applications/Google\ Chrome.app --args --disable-web-security --user-data-dir=${path.join(os.homedir(), 'MyChromeDevUserData')} && `;
	}
	const terminal = vscode.window.createTerminal(projectName);
	terminal.show();
	terminal.sendText(`${openStr}npm start`);
};

const handleDeleteEntry = async (node: Dependency) => {
	const linkedDeps = await getLinkedDeps();
	if (linkedDeps[node.label]) {
		delete linkedDeps[node.label];
	}
	await setLinkedDeps(linkedDeps);
	const curTerminal = vscode.window.terminals.find((t) => t.name === node.label);
	curTerminal?.dispose();
	nodeDependenciesProvider.refresh();
};

export function activate(context: vscode.ExtensionContext) {
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);
	vscode.commands.registerCommand('nodeDependencies.addEntry', handleAddEntry);
	vscode.commands.registerCommand('nodeDependencies.refreshEntry', () =>
		nodeDependenciesProvider.refresh()
	);
	vscode.commands.registerCommand('nodeDependencies.startEntry', handleStartEntry);
	// vscode.commands.registerCommand('extension.openPackageOnNpm', (moduleName) =>
	// 	vscode.commands.executeCommand(
	// 		'vscode.open',
	// 		vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)
	// 	)
	// );
	vscode.commands.registerCommand('nodeDependencies.editEntry', handleEditEntry);
	// vscode.commands.registerCommand('nodeDependencies.debugEntry', handleDebugEntry);
	vscode.commands.registerCommand('nodeDependencies.deleteEntry', handleDeleteEntry);
}
