import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getLinkedDeps } from './utils';

export class DepNodeProvider implements vscode.TreeDataProvider<Dependency> {
	private projectPath?: string;
	private curLinkedDepsPath?: string;
	private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | void> =
		new vscode.EventEmitter<Dependency | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> =
		this._onDidChangeTreeData.event;

	constructor(private workspaceRoot?: string) {}

	refresh(projectPath?: string, curLinkedDepsPath?: string): void {
		if (projectPath && curLinkedDepsPath) {
			this.projectPath = projectPath;
			this.curLinkedDepsPath = curLinkedDepsPath;
		}
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Dependency): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: Dependency): Promise<Dependency[]> {
		if (!this.workspaceRoot) {
			vscode.window.showWarningMessage('No dependency in empty project or workspace');
			return Promise.resolve([]);
		}

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
			let packageJsonPath = path.join(this.workspaceRoot, 'package.json');
			let packageLockJsonPath = path.join(this.workspaceRoot, 'package-lock.json');
			if (this.pathExists(packageJsonPath)) {
				const deps = await this.getDepsInPackageJson(
					packageJsonPath,
					packageLockJsonPath
				);
				return Promise.resolve(deps);
			} else {
				if (this.projectPath) {
					packageJsonPath = path.join(this.projectPath, 'package.json');
					packageLockJsonPath = path.join(this.projectPath, 'package-lock.json');
					const deps = await this.getDepsInPackageJson(
						packageJsonPath,
						packageLockJsonPath
					);
					return Promise.resolve(deps);
				} else {
					return Promise.resolve([]);
				}
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
		if (this.pathExists(packageJsonPath)) {
			const packageJson = await fs.readJson(packageJsonPath);
			const packageLockJson = (await fs.pathExists(packageLockJsonPath))
				? await fs.readJson(packageLockJsonPath)
				: packageJson;

			const toDep = (moduleName: string, version: string): Dependency => {
				// if (this.pathExists(path.join(this.workspaceRoot, 'node_modules', moduleName))) {
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
					undefined,
					{
						projectPath: this.projectPath || this.workspaceRoot,
						curLinkedDepsPath: this.curLinkedDepsPath,
					}
					// {
					// 	command: 'nodeDependencies.openEntry',
					// 	title: '',
					// 	arguments: [moduleName],
					// }
				);
				// }
			};

			if (packageJson.dependencies) {
				const linkedDeps = await getLinkedDeps(this.curLinkedDepsPath);
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
	projectPath?: string;
	curLinkedDepsPath?: string;

	constructor(
		public readonly label: string,
		public readonly version: string = '1.0.0',
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
			.TreeItemCollapsibleState.None,
		public readonly command?: vscode.Command,
		public readonly curObj?: { projectPath?: string; curLinkedDepsPath?: string }
	) {
		super(label, collapsibleState);

		this.tooltip = `${label}-${version}`;
		const index = curObj?.projectPath?.lastIndexOf('/') || -1;
		const projectName = curObj?.projectPath?.slice(index + 1);
		this.description = `version: ${version}（linked with ${projectName}）`;
		this.projectPath = curObj?.projectPath;
		this.curLinkedDepsPath = curObj?.curLinkedDepsPath;
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg'),
	};

	contextValue = 'dependency';
}
