'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs-extra';
import { DepNodeProvider, Dependency } from './nodeDependencies';
import { getLinkedDeps, setLinkedDeps } from './utils';

const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
const nodeDependenciesProvider = new DepNodeProvider(rootPath);

const handleDebugEntry = async (node: Dependency) => {
	const linkedDeps = await getLinkedDeps();
	if (!linkedDeps[node.label]?.isRunning) {
		const terminal = vscode.window.createTerminal(node.label);
		terminal.show();
		terminal.sendText(`tnpx -p @ali/orca-cli orca lk ${node.label}`);
		linkedDeps[node.label].isRunning = true;
		await setLinkedDeps(linkedDeps);

		vscode.window.onDidCloseTerminal(async (closedTerminal) => {
			if (closedTerminal.name === node.label) {
				linkedDeps[node.label].isRunning = false;
				await setLinkedDeps(linkedDeps);
			}
		});
	} else {
		vscode.window.showWarningMessage('已存在调试程序，请先关闭');
	}
};

const handleEditEntry = async (node: Dependency) => {
	const linkedDeps = await getLinkedDeps();
	const fromVal = linkedDeps[node.label]?.from;
	const folderUris = await vscode.window.showOpenDialog({
		defaultUri: vscode.Uri.parse(fromVal || 'file://Users'),
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false,
		openLabel: '确认待调试组件根目录',
	});
	if (folderUris) {
		const fromPath = folderUris[0].path;
		linkedDeps[node.label] = {
			from: fromPath.endsWith('/') ? fromPath : `${fromPath}/`,
		};
		await setLinkedDeps(linkedDeps);
		vscode.window.showInformationMessage(`${node.label}已绑定本地调试路径`);
		if (linkedDeps[node.label]?.isRunning) {
			const curTerminal = vscode.window.terminals.find((t) => t.name === node.label);
			curTerminal?.dispose();
		}
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

const handleDeleteEntry = async (node: Dependency) => {
	const linkedDeps = await getLinkedDeps();
	if (linkedDeps[node.label]) {
		delete linkedDeps[node.label];
	}
	await setLinkedDeps(linkedDeps);
	if (linkedDeps[node.label]?.isRunning) {
		const curTerminal = vscode.window.terminals.find((t) => t.name === node.label);
		curTerminal?.dispose();
	}
	nodeDependenciesProvider.refresh();
};

export function activate(context: vscode.ExtensionContext) {
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);
	vscode.commands.registerCommand('nodeDependencies.refreshEntry', () =>
		nodeDependenciesProvider.refresh()
	);
	// vscode.commands.registerCommand('extension.openPackageOnNpm', (moduleName) =>
	// 	vscode.commands.executeCommand(
	// 		'vscode.open',
	// 		vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)
	// 	)
	// );
	vscode.commands.registerCommand('nodeDependencies.editEntry', handleEditEntry);
	vscode.commands.registerCommand('nodeDependencies.debugEntry', handleDebugEntry);
	vscode.commands.registerCommand('nodeDependencies.addEntry', handleAddEntry);
	vscode.commands.registerCommand('nodeDependencies.deleteEntry', handleDeleteEntry);
}
