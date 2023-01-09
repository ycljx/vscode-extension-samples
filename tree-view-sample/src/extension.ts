'use strict';

import * as vscode from 'vscode';

import { DepNodeProvider, Dependency } from './nodeDependencies';

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
	vscode.commands.registerCommand(
		'nodeDependencies.editEntry',
		async (node: Dependency) => {
			const result = await vscode.window.showInputBox({
				value: 'abcdef',
				valueSelection: [2, 4],
				placeHolder: 'For example: fedcba. But not: 123',
				validateInput: (text) => {
					vscode.window.showInformationMessage(`Validating: ${text}`);
					return text === '123' ? 'Not 123!' : null;
				},
			});
			vscode.window.showInformationMessage(`Got: ${result}`);
		}
	);
	vscode.commands.registerCommand('nodeDependencies.deleteEntry', (node: Dependency) =>
		vscode.window.showInformationMessage(
			`Successfully called delete entry on ${node.label}.`
		)
	);
}
