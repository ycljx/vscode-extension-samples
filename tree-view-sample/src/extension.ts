'use strict';

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs-extra';
import { DepNodeProvider, Dependency } from './nodeDependencies';

const linkedDepsPath = `${os.tmpdir()}/.yc/linkedDeps.json`;

const handleDebugEntry = async (node: Dependency) => {
	const terminal = vscode.window.createTerminal('开始监听组件变化');
	terminal.sendText(`tnpx -p @ali/orca-cli orca lk ${node.label}`);
	const terminal1 = vscode.window.createTerminal('开始启动预览引擎');
	terminal1.sendText('npm start');
};

const handleEditEntry = async (node: Dependency) => {
	let linkedDeps: Record<string, any> = {};
	const isExist = await fs.pathExists(linkedDepsPath);
	if (isExist) linkedDeps = await fs.readJson(linkedDepsPath);

	const result = await vscode.window.showInputBox({
		value: linkedDeps[node.label]?.from || '',
		valueSelection: [2, 4],
		placeHolder: '请输入待调试组件根目录的绝对路径',
	});

	if (result) {
		linkedDeps[node.label] = {
			from: result.endsWith('/') ? result : `${result}/`,
		};

		if (!isExist) await fs.ensureFile(linkedDepsPath);
		await fs.writeJson(linkedDepsPath, linkedDeps, { spaces: 2 });

		vscode.window.showInformationMessage(`${node.label}已绑定本地调试路径`);
	}
};

export function activate(context: vscode.ExtensionContext) {
	const rootPath =
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
			? vscode.workspace.workspaceFolders[0].uri.fsPath
			: undefined;

	// Samples of `window.registerTreeDataProvider`
	const nodeDependenciesProvider = new DepNodeProvider(rootPath);
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);
	vscode.commands.registerCommand('nodeDependencies.refreshEntry', () =>
		nodeDependenciesProvider.refresh()
	);
	vscode.commands.registerCommand('extension.openPackageOnNpm', (moduleName) =>
		vscode.commands.executeCommand(
			'vscode.open',
			vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)
		)
	);
	vscode.commands.registerCommand('nodeDependencies.addEntry', () =>
		vscode.window.showInformationMessage(`Successfully called add entry.`)
	);
	vscode.commands.registerCommand('nodeDependencies.editEntry', handleEditEntry);
	vscode.commands.registerCommand('nodeDependencies.debugEntry', handleDebugEntry);
	vscode.commands.registerCommand('nodeDependencies.deleteEntry', (node: Dependency) =>
		vscode.window.showInformationMessage(
			`Successfully called delete entry on ${node.label}.`
		)
	);
}
