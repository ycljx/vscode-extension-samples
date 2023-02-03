import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getLinkedDeps } from './utils';

export class DepNodeProvider implements vscode.TreeDataProvider<Dependency> {
	private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> =
		new vscode.EventEmitter<Dependency | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> =
		this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string | undefined) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Dependency): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: Dependency): Promise<Dependency[]> {
		if (!this.workspaceRoot) {
			vscode.window.showWarningMessage('No dependency in empty workspace');
			return Promise.resolve([]);
		}

		const packageLockJsonPath = path.join(this.workspaceRoot, 'package-lock.json');

		if (element) {
			// return Promise.resolve(
			// 	this.getDepsInPackageJson(
			// 		path.join(
			// 			this.workspaceRoot,
			// 			'node_modules',
			// 			element.label,
			// 			'package.json'
			// 		),
			// 		packageLockJsonPath
			// 	)
			// );
			return Promise.resolve([]);
		} else {
			const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
			if (this.pathExists(packageJsonPath)) {
				const deps = await this.getDepsInPackageJson(
					packageJsonPath,
					packageLockJsonPath
				);
				return Promise.resolve(deps);
			} else {
				vscode.window.showWarningMessage('Workspace has no package.json');
				return Promise.resolve([]);
			}
		}
	}

	/**
	 * Given the path to package.json, read all its dependencies and devDependencies.
	 */
	private async getDepsInPackageJson(
		packageJsonPath: string,
		packageLockJsonPath: string
	): Promise<Dependency[]> {
		let deps: any[] = [];
		const workspaceRoot = this.workspaceRoot;

		if (this.pathExists(packageJsonPath) && workspaceRoot) {
			const packageJson = await fs.readJson(packageJsonPath);
			const packageLockJson = (await fs.pathExists(packageLockJsonPath))
				? await fs.readJson(packageLockJsonPath)
				: packageJson;

			const toDep = (moduleName: string, version: string): Dependency => {
				// if (this.pathExists(path.join(workspaceRoot, 'node_modules', moduleName))) {
				// 	return new Dependency(
				// 		moduleName,
				// 		version,
				// 		vscode.TreeItemCollapsibleState.Collapsed
				// 	);
				// } else {
				return new Dependency(
					moduleName,
					version,
					vscode.TreeItemCollapsibleState.None,
					{
						command: 'extension.openInNewWindow',
						title: '',
						arguments: [moduleName],
					}
				);
				// }
			};

			if (packageJson.dependencies) {
				const linkedDeps = await getLinkedDeps();
				deps = Object.keys(linkedDeps).map((dep) =>
					toDep(
						dep,
						packageLockJson.dependencies[dep]?.version ||
							packageLockJson.dependencies[dep]
					)
				);
			} else {
				vscode.window.showWarningMessage('This project has no dependencies');
			}
		} else {
			vscode.window.showWarningMessage('Workspace has no package.json');
		}

		return deps;
	}

	private pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}

		return true;
	}
}

export class Dependency extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);

		this.tooltip = `${this.label}-${this.version}`;
		this.description = this.version;
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg'),
	};

	contextValue = 'dependency';
}
