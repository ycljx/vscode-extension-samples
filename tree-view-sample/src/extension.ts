'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { DepNodeProvider, Dependency } from './nodeDependencies';
import { getLinkedDeps, setLinkedDeps, rootPath, ycPath, projectName } from './utils';

const aliasPath = path.join(rootPath, 'alias.json');
const pkgPath = path.join(rootPath, 'package.json');
const oldPkgPath = path.join(ycPath, 'package-old.json');
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
		handleDebugEntry(node);
		const answer = await vscode.window.showInformationMessage(
			`绑定完成，是否打开组件${node.label}开发目录？`,
			'是',
			'否'
		);
		if (answer === '是') {
			handleOpenEntry(fromPath);
		}
	}
};

const handleAddEntry = async () => {
	const packageJsonPath = path.join(rootPath, 'package.json');
	const packageLockJsonPath = path.join(rootPath, 'package-lock.json');
	const packageLockJson = (await fs.pathExists(packageLockJsonPath))
		? await fs.readJson(packageLockJsonPath)
		: await fs.readJson(packageJsonPath);
	const linkedDeps = await getLinkedDeps();
	const restKeys = Object.keys(packageLockJson.dependencies).filter(
		(key) =>
			(key.startsWith('@ali/orca-') ||
				key.startsWith('@alife/xiaoer-') ||
				key.startsWith('@ali/cd-')) &&
			!Object.keys(linkedDeps).includes(key)
	);
	const selected = await vscode.window.showQuickPick(restKeys, {
		placeHolder: '请选择要添加的组件',
	});
	if (selected) {
		linkedDeps[selected] = {};
		await setLinkedDeps(linkedDeps);
		nodeDependenciesProvider.refresh();
		handleEditEntry(
			new Dependency(
				selected,
				packageLockJson.dependencies[selected]?.version ||
					packageLockJson.dependencies[selected],
				vscode.TreeItemCollapsibleState.None
			)
		);
	}
};

const handleStartEntry = async () => {
	const curTerminal = vscode.window.terminals.find((t) => t.name === projectName);
	curTerminal?.dispose();
	let openStr = '';
	const answer = await vscode.window.showInformationMessage(
		'是否需要以跨域模式打开Chrome浏览器？',
		'是',
		'否'
	);
	if (answer) {
		const oldPkg = (await fs.pathExists(oldPkgPath))
			? await fs.readJson(oldPkgPath)
			: {};
		const terminal = vscode.window.createTerminal({
			name: projectName,
			hideFromUser: true,
		});
		terminal.sendText('git pull');
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: '进程启动',
				cancellable: false,
			},
			(progress) => {
				progress.report({ increment: 0 });
				setTimeout(() => {
					progress.report({ increment: 30, message: '代码拉取中' });
				}, 1000);
				setTimeout(() => {
					progress.report({ increment: 60, message: '依赖检查中' });
				}, 3000);
				return new Promise((r) => setTimeout(r, 5000));
			}
		);
		await new Promise((r) => setTimeout(r, 5000));
		const pkg = await fs.readJson(pkgPath);
		if (pkg.version !== oldPkg.version) {
			vscode.window.showInformationMessage('项目依赖需升级，开始执行依赖安装');
			openStr = `${openStr}tnpm update && `;
			await fs.writeJson(oldPkgPath, pkg, { spaces: 2 });
		}
		if (answer === '是') {
			openStr = `${openStr}open -n /Applications/Google\\ Chrome.app --args --disable-web-security --user-data-dir=${path.join(
				os.homedir(),
				'MyChromeDevUserData'
			)} && `;
		}
		const terminal1 = vscode.window.createTerminal(projectName);
		terminal1.show();
		terminal1.sendText(`${openStr}npm start -- --port=1024`);
	}
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

const handleConfigEntry = async (type: string) => {
	if (type === 'openChrome') {
		const terminal = vscode.window.createTerminal({
			name: projectName,
			hideFromUser: true,
		});
		terminal.sendText(
			`open -n /Applications/Google\\ Chrome.app --args --disable-web-security --user-data-dir=${path.join(
				os.homedir(),
				'MyChromeDevUserData'
			)}`
		);
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: '进程启动',
				cancellable: false,
			},
			(progress) => {
				progress.report({ increment: 0 });
				setTimeout(() => {
					progress.report({ increment: 30, message: '环境检查中' });
				}, 1000);
				setTimeout(() => {
					progress.report({ increment: 60, message: '浏览器启动中' });
				}, 3000);
				return new Promise((r) => setTimeout(r, 5000));
			}
		);
	} else {
		const configPath = path.join(ycPath, `${type}.json`);
		if (type === 'bzbConfig') {
			await fs.writeJson(
				configPath,
				[
					'//(.*)g.alicdn.com/bzb-westeros/biz-orca-(.*)/(.*)/js/index.js',
					'//localhost:1024/js/index.js',
				],
				{ spaces: 2 }
			);
		} else if (type === 'orcaConfig') {
			await fs.writeJson(
				configPath,
				[
					'//(.*)g.alicdn.com/team-orca/orca/(.*)/js/index.js',
					'//localhost:1024/js/index.js',
				],
				{ spaces: 2 }
			);
		} else if (type === 'orcaPreviewConfig') {
			await fs.writeJson(
				configPath,
				[
					'//(.*)g.alicdn.com/team-orca/orca-preview/(.*)/js/index.js',
					'//localhost:1024/js/index.js',
				],
				{ spaces: 2 }
			);
		}
		vscode.window.showTextDocument(vscode.Uri.file(configPath), { preview: false });
	}
};

const handleSettingEntry = async () => {
	const selected = await vscode.window.showQuickPick(
		[
			{ label: 'Orca代理配置', value: 'orcaConfig' },
			{ label: 'Orca预览引擎代理配置', value: 'orcaPreviewConfig' },
			{ label: 'Orca搭建的工作台页面代理配置', value: 'bzbConfig' },
			{ label: '打开Chrome（跨域模式）', value: 'openChrome' },
		],
		{
			placeHolder: '请选择要查看的代理配置',
		}
	);
	selected && handleConfigEntry(selected.value);
};

const handleOpenEntry = async (nodeOrFromVal: Dependency | string) => {
	let fromVal: string | undefined;
	if (typeof nodeOrFromVal === 'string') {
		fromVal = nodeOrFromVal;
	} else {
		const linkedDeps = await getLinkedDeps();
		fromVal = linkedDeps[nodeOrFromVal.label]?.from;
	}
	if (fromVal) {
		vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(fromVal), {
			forceNewWindow: true,
		});
	} else {
		vscode.window.showWarningMessage('请先绑定该调试组件的根目录');
	}
};

export function activate(context: vscode.ExtensionContext) {
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);
	vscode.commands.registerCommand('nodeDependencies.addEntry', handleAddEntry);
	vscode.commands.registerCommand('nodeDependencies.refreshEntry', () =>
		nodeDependenciesProvider.refresh()
	);
	vscode.commands.registerCommand('nodeDependencies.startEntry', handleStartEntry);
	vscode.commands.registerCommand('nodeDependencies.settingEntry', handleSettingEntry);
	vscode.commands.registerCommand('nodeDependencies.openEntry', handleOpenEntry);
	vscode.commands.registerCommand('nodeDependencies.editEntry', handleEditEntry);
	// vscode.commands.registerCommand('nodeDependencies.debugEntry', handleDebugEntry);
	vscode.commands.registerCommand('nodeDependencies.deleteEntry', handleDeleteEntry);
	vscode.commands.registerCommand('nodeDependencies.bzbConfig', () =>
		handleConfigEntry('bzbConfig')
	);
	vscode.commands.registerCommand('nodeDependencies.orcaConfig', () =>
		handleConfigEntry('orcaConfig')
	);
	vscode.commands.registerCommand('nodeDependencies.orcaPreviewConfig', () =>
		handleConfigEntry('orcaPreviewConfig')
	);
	vscode.commands.registerCommand('nodeDependencies.openChrome', () =>
		handleConfigEntry('openChrome')
	);
}
