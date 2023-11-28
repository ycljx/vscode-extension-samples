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

interface CurObj {
	curRootPath: string;
	curPkgPath: string;
	curProjectName?: string;
}

const curPkgPath = path.join(curRootPath, 'package.json');
const nodeDependenciesProvider = new DepNodeProvider(curRootPath);

const GIT_MAP: Record<string, string> = {
	orcaPreview: 'git@gitlab.alibaba-inc.com:team-orca/orca-preview',
	orcaNextPreview: 'git@gitlab.alibaba-inc.com:team-orca/orca-next-preview.git',
	orcaNextCardPreview: 'git@gitlab.alibaba-inc.com:team-orca/orca-next-card-preview.git',
};

const BRANCH_MAP: Record<string, string> = {
	orcaPreview: 'v2-pre',
	orcaNextPreview: 'feat/init',
	orcaNextCardPreview: 'feat/init',
};

const PORT_MAP: Record<string, number> = {
	orcaPreview: 1024,
	orcaNextPreview: 1026,
	orcaNextCardPreview: 1025,
};

const handleDebugEntry = async (
	node: Dependency,
	openStr = `tnpx -p @ali/orca-cli orca lk ${node.label}`
) => {
	const linkedDeps = await getLinkedDeps(node.curLinkedDepsPath);
	if (!node.projectPath) {
		vscode.window.showWarningMessage('未指定项目根目录');
		return;
	}
	if (!linkedDeps[node.label]?.from && !node.projectPath.includes('/orcaDebug/')) {
		vscode.window.showWarningMessage('请先绑定该调试组件的根目录');
		return;
	}
	const aliasPath = path.join(node.projectPath, 'alias.json');
	const pkgPath = path.join(node.projectPath, 'package.json');
	const ycPath = path.join(node.projectPath, '.yc');
	const curTerminal = vscode.window.terminals.find((t) => t.name === node.label);
	curTerminal?.dispose();
	const terminal = vscode.window.createTerminal({
		name: node.label,
		cwd: node.projectPath,
	});
	terminal.show();
	terminal.sendText(openStr);
	vscode.window.onDidCloseTerminal(async (closedTerminal) => {
		const name = closedTerminal.name;
		const pkg = await fs.readJson(pkgPath);
		if (pkg.dependencies[name] === 'new') {
			delete pkg.dependencies[name];
			await fs.writeJson(pkgPath, pkg, { spaces: 2 });
		}
		const isAliasExist = await fs.pathExists(aliasPath);
		const alias = isAliasExist ? await fs.readJson(aliasPath) : {};
		delete alias[name];
		if (name === '@alife/xiaoer-json-form') {
			delete alias['@formily/next'];
			delete alias['@formily/next/lib/style.js'];
		}
		if (Object.keys(alias).length) {
			await fs.writeJson(aliasPath, alias, { spaces: 2 });
			delete linkedDeps[name];
			await setLinkedDeps(linkedDeps, node.curLinkedDepsPath);
			await fs.remove(path.join(ycPath, name));
		} else {
			await fs.remove(aliasPath);
			await fs.remove(ycPath);
		}
		nodeDependenciesProvider.refresh(node.projectPath, node.curLinkedDepsPath);
	});
	if (openStr.includes('git clone ')) {
		await new Promise((r) => setTimeout(r, 160_000));
	}
	return terminal;
};

const handleEditEntry = async (node: Dependency) => {
	const linkedDeps = await getLinkedDeps(node.curLinkedDepsPath);
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
		await setLinkedDeps(linkedDeps, node.curLinkedDepsPath);
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
	const isPkgExist = await fs.pathExists(curPkgPath);
	const curObj = { curRootPath, curPkgPath };
	if (!isPkgExist) {
		const comps = [];
		const files = await fs.readdir(curRootPath);
		for (let i = 0; i < files.length; i++) {
			const fileName = files[i];
			const stat = await fs.lstat(path.join(curRootPath, fileName));
			if (stat.isDirectory()) {
				comps.push(fileName);
			}
		}
		const selected = await vscode.window.showQuickPick(comps, {
			placeHolder: '请选择项目',
		});
		if (selected) {
			curObj.curRootPath = path.join(curRootPath, selected);
			curObj.curPkgPath = path.join(curObj.curRootPath, 'package.json');
		} else {
			return;
		}
	}

	const curLinkedDepsPath = path.join(curObj.curRootPath, '.yc/linkedDeps.json');
	const packageLockJsonPath = path.join(curObj.curRootPath, 'package-lock.json');
	const packageLockJson = (await fs.pathExists(packageLockJsonPath))
		? await fs.readJson(packageLockJsonPath)
		: await fs.readJson(curObj.curPkgPath);
	const linkedDeps = await getLinkedDeps(curLinkedDepsPath);
	const selected = await vscode.window.showQuickPick(['已有组件', '新组件'], {
		placeHolder: '请选择添加方式',
	});

	if (selected === '已有组件') {
		const restKeys = Object.keys(packageLockJson.dependencies).filter(
			(key) =>
				(key.startsWith('@ali/orca-') ||
					key.startsWith('@alife/xiaoer-') ||
					key.startsWith('@alife/copilot-') ||
					key.startsWith('@ali/cd-') ||
					key.startsWith('@alife/material-scene-')) &&
				!Object.keys(linkedDeps).includes(key)
		);
		const selected = await vscode.window.showQuickPick(restKeys, {
			placeHolder: '请选择要添加的组件',
		});
		if (selected) {
			linkedDeps[selected] = {};
			await setLinkedDeps(linkedDeps, curLinkedDepsPath);
			nodeDependenciesProvider.refresh(curObj.curRootPath, curLinkedDepsPath);
			handleEditEntry(
				new Dependency(selected, undefined, undefined, undefined, {
					projectPath: curObj.curRootPath,
					curLinkedDepsPath,
				})
			);
		}
	} else if (selected === '新组件') {
		const selected = await vscode.window.showQuickPick(
			[
				'@ali/orca-',
				'@alife/xiaoer-',
				'@alife/copilot-',
				'@ali/cd-',
				'@alife/material-scene-',
			],
			{ placeHolder: '请选择组件前缀' }
		);
		if (selected) {
			const inputStr = await vscode.window.showInputBox({
				placeHolder: '请输入组件名称',
			});
			if (inputStr) {
				const name = selected + inputStr;
				linkedDeps[name] = {};
				await setLinkedDeps(linkedDeps, curLinkedDepsPath);
				nodeDependenciesProvider.refresh(curObj.curRootPath, curLinkedDepsPath);
				handleEditEntry(
					new Dependency(name, undefined, undefined, undefined, {
						projectPath: curObj.curRootPath,
						curLinkedDepsPath,
					})
				);
			}
		}
	}
};

const startProject = async (
	projectPath: string,
	gitPath: string,
	branchName = 'master',
	port = 1024,
	{ curRootPath, curPkgPath, curProjectName }: CurObj
) => {
	const index = projectPath.lastIndexOf('/');
	const projectName = projectPath.slice(index + 1);
	const pkgPath = path.join(projectPath, 'package.json');
	const depsPath = path.join(projectPath, '.yc/linkedDeps.json');
	const pkg = await fs.readJson(curPkgPath);
	const depName = pkg.name;

	let openStr = '';

	const isExist = await fs.pathExists(pkgPath);
	if (!isExist) {
		await fs.emptyDir(projectPath);
		openStr = `${openStr}git clone -b ${branchName} ${gitPath} ${projectPath} && tnpm i`;
	} else {
		openStr = `${openStr}git pull`;
	}

	if (gitPath) {
		const node = new Dependency(depName, undefined, undefined, undefined, {
			projectPath,
			curLinkedDepsPath: depsPath,
		});
		const linkedDeps = await getLinkedDeps(depsPath);
		linkedDeps[node.label] = {
			from: curRootPath,
		};
		const terminal = await handleDebugEntry(node, openStr);
		await setLinkedDeps(linkedDeps, depsPath);
		terminal?.sendText(`tnpx -p @ali/orca-cli orca lk ${depName}`);
		await new Promise((r) => setTimeout(r, 25_000));
		const curTerminal = vscode.window.terminals.find((t) => t.name === projectName);
		curTerminal?.dispose();
		const terminal1 = vscode.window.createTerminal({
			name: projectName,
			cwd: projectPath,
		});
		terminal1.show();
		terminal1.sendText(`npm start -- --port=${port}`);
	} else {
		openStr = `${openStr} && npm start -- --port=${port}`;
		const curTerminal = vscode.window.terminals.find((t) => t.name === curProjectName);
		curTerminal?.dispose();
		const terminal = vscode.window.createTerminal({
			name: curProjectName,
			cwd: projectPath,
		});
		terminal.show();
		terminal.sendText(openStr);
	}
};

const handleStartEntry = async () => {
	const isPkgExist = await fs.pathExists(curPkgPath);
	const curObj = { curRootPath, curPkgPath, curProjectName };
	if (!isPkgExist) {
		const comps = [];
		const files = await fs.readdir(curRootPath);
		for (let i = 0; i < files.length; i++) {
			const fileName = files[i];
			const stat = await fs.lstat(path.join(curRootPath, fileName));
			if (stat.isDirectory()) {
				comps.push(fileName);
			}
		}
		const selected = await vscode.window.showQuickPick(comps, {
			placeHolder: '请选择要调试的项目',
		});
		if (selected) {
			curObj.curRootPath = path.join(curRootPath, selected);
			curObj.curPkgPath = path.join(curObj.curRootPath, 'package.json');
			curObj.curProjectName = selected;
		} else {
			return;
		}
	}
	const selected1 = await vscode.window.showQuickPick(
		[
			{ label: 'Orca Preview资源', value: 'orcaPreview' },
			{ label: 'Orca Next Preview资源', value: 'orcaNextPreview' },
			{ label: 'Orca Next Card Preview资源', value: 'orcaNextCardPreview' },
			// { label: 'Orca搭建的业务应用资源', value: 'bizOrca' },
			{ label: '当前项目资源', value: 'current' },
		],
		{
			placeHolder: '请选择资源构建的环境',
		}
	);
	if (selected1) {
		let tempPath = curObj.curRootPath;
		if (selected1.value !== 'current') {
			const rootDir = path.join(os.homedir(), 'orcaDebug');
			tempPath = path.join(rootDir, selected1.value);
		}
		startProject(
			tempPath,
			GIT_MAP[selected1.value],
			BRANCH_MAP[selected1.value],
			PORT_MAP[selected1.value],
			curObj
		);
	}
};

const handleDeleteEntry = async (node: Dependency) => {
	const curTerminal = vscode.window.terminals.find((t) => t.name === node.label);
	curTerminal?.dispose();
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
		const linkedDeps = await getLinkedDeps(nodeOrFromVal.curLinkedDepsPath);
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
