'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { DepNodeProvider, Dependency } from './nodeDependencies';
import {
	getLinkedDeps,
	setLinkedDeps,
	curRootPath,
	curYcPath,
	curProjectName,
} from './utils';

const curPkgPath = path.join(curRootPath, 'package.json');
const curAliasPath = path.join(curRootPath, 'alias.json');
const nodeDependenciesProvider = new DepNodeProvider(curRootPath);

const GIT_MAP: Record<string, string> = {
	orca: 'git@gitlab.alibaba-inc.com:team-orca/orca',
	orcaPreview: 'git@gitlab.alibaba-inc.com:team-orca/orca-preview',
};

const handleDebugEntry = async (
	node: Dependency,
	projectPath?: string,
	openStr = `tnpx -p @ali/orca-cli orca lk ${node.label}`
) => {
	const aliasPath = projectPath ? path.join(projectPath, 'alias.json') : curAliasPath;
	const linkedDeps = await getLinkedDeps(
		projectPath && path.join(projectPath, '.yc/linkedDeps.json')
	);
	if (!linkedDeps[node.label]?.from) {
		vscode.window.showWarningMessage('请先绑定该调试组件的根目录');
	}
	const curTerminal = vscode.window.terminals.find((t) => t.name === node.label);
	curTerminal?.dispose();
	const terminal = vscode.window.createTerminal({
		name: node.label,
		...(projectPath ? { cwd: projectPath } : {}),
	});
	terminal.show();
	terminal.sendText(openStr);
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
	const packageJsonPath = path.join(curRootPath, 'package.json');
	const packageLockJsonPath = path.join(curRootPath, 'package-lock.json');
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
		handleEditEntry(new Dependency(selected));
	}
};

const startProject = async (
	projectPath: string,
	gitPath: string,
	branchName = 'master'
) => {
	const pkgPath = path.join(projectPath, 'package.json');
	const depsPath = path.join(projectPath, '.yc/linkedDeps.json');
	const pkg = await fs.readJson(curPkgPath);
	const depName = pkg.name;

	let openStr = '';

	const isExist = await fs.pathExists(pkgPath);
	if (!isExist) {
		await fs.ensureDir(projectPath);
		openStr = `${openStr}git clone -b ${branchName} ${gitPath} ${projectPath} && tnpm i && `;
	} else {
		openStr = `${openStr}git pull && `;
	}

	if (gitPath) {
		openStr = `${openStr}tnpx -p @ali/orca-cli orca lk ${depName} && npm start -- --port=1024`;
		const node = new Dependency(depName);
		const linkedDeps = await getLinkedDeps(depsPath);
		linkedDeps[node.label] = {
			from: curRootPath,
		};
		await setLinkedDeps(linkedDeps, depsPath);
		handleDebugEntry(node, projectPath, openStr);
	} else {
		openStr = `${openStr}npm start -- --port=1024`;
		const curTerminal = vscode.window.terminals.find((t) => t.name === curProjectName);
		curTerminal?.dispose();
		const terminal = vscode.window.createTerminal(curProjectName);
		terminal.show();
		terminal.sendText(openStr);
	}
};

const handleStartEntry = async () => {
	const selected = await vscode.window.showQuickPick(
		[
			{ label: 'Orca资源', value: 'orca' },
			{ label: 'Orca Preview资源', value: 'orcaPreview' },
			// { label: 'Orca搭建的业务应用资源', value: 'bizOrca' },
			{ label: '当前项目资源', value: 'current' },
		],
		{
			placeHolder: '请选择资源构建的环境',
		}
	);
	if (selected) {
		let tempPath = curRootPath;
		if (selected.value !== 'current') {
			const rootDir = path.join(os.homedir(), 'orcaDebug');
			tempPath = path.join(rootDir, selected.value);
		}
		startProject(
			tempPath,
			GIT_MAP[selected.value],
			selected.value === 'orcaPreview' ? 'v2-pre' : 'master'
		);
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
			name: curProjectName,
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
		const configPath = path.join(curYcPath, `${type}.json`);
		const isExist = await fs.pathExists(configPath);
		!isExist && (await fs.ensureFile(configPath));
		if (type === 'bzbConfig') {
			await fs.writeJson(
				configPath,
				[
					'//(.*)g.alicdn.com/bzb-westeros/biz-orca-(.*)/(.*)/(.*)/index.(.*)',
					'//localhost:1024/$4/index.$5',
				],
				{ spaces: 2 }
			);
		} else if (type === 'orcaConfig') {
			await fs.writeJson(
				configPath,
				[
					'//(.*)g.alicdn.com/team-orca/orca/(.*)/(.*)/index.(.*)',
					'//localhost:1024/$3/index.$4',
				],
				{ spaces: 2 }
			);
		} else if (type === 'orcaPreviewConfig') {
			await fs.writeJson(
				configPath,
				[
					'//(.*)g.alicdn.com/team-orca/orca-preview/(.*)/(.*)/index.(.*)',
					'//localhost:1024/$3/index.$4',
				],
				{ spaces: 2 }
			);
		}
		vscode.window.showTextDocument(vscode.Uri.file(configPath), { preview: true });
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
