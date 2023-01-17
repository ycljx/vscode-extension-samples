'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { DepNodeProvider, Dependency } from './nodeDependencies';
import { getLinkedDeps, setLinkedDeps, rootPath, ycPath } from './utils';

const aliasPath = path.join(rootPath, 'alias.json');
const pkgPath = path.join(rootPath, 'package.json');
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
	const packageLockJsonPath = path.join(rootPath, 'package-lock.json');
	const packageLockJson = fs.readJsonSync(packageLockJsonPath);
	const linkedDeps = await getLinkedDeps();
	const restKeys = Object.keys(packageLockJson.dependencies).filter(
		(key) => key.startsWith('@ali') && !Object.keys(linkedDeps).includes(key)
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
				packageLockJson.dependencies[selected]?.version,
				vscode.TreeItemCollapsibleState.None
			)
		);
	}
};

const handleStartEntry = async () => {
	const startIndex = rootPath.lastIndexOf('/');
	const projectName = rootPath.slice(startIndex + 1);
	const curTerminal = vscode.window.terminals.find((t) => t.name === projectName);
	curTerminal?.dispose();
	let openStr = '';
	const answer = await vscode.window.showInformationMessage(
		'是否需要以跨域模式打开Chrome浏览器？',
		'是',
		'否'
	);
	if (answer) {
		const oldPkg = await fs.readJson(pkgPath);
		const terminal = vscode.window.createTerminal({
			name: projectName,
			hideFromUser: true,
		});
		terminal.sendText('git pull');
		await new Promise((r) => setTimeout(r, 1000));
		const pkg = await fs.readJson(pkgPath);
		if (pkg.version !== oldPkg.version) {
			vscode.window.showInformationMessage('检测到项目依赖变化，执行依赖升级');
			openStr = `${openStr}tnpm update && `;
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
};

const handleSettingEntry = async () => {
	const selected = await vscode.window.showQuickPick(
		[
			{ label: 'Orca预览引擎代理配置', value: 'orcaPreviewConfig' },
			{ label: 'Orca搭建的工作台页面代理配置', value: 'bzbConfig' },
		],
		{
			placeHolder: '请选择要查看的代理配置',
		}
	);
	selected && handleConfigEntry(selected.value);
};

export function activate(context: vscode.ExtensionContext) {
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);
	vscode.commands.registerCommand('nodeDependencies.addEntry', handleAddEntry);
	vscode.commands.registerCommand('nodeDependencies.refreshEntry', () =>
		nodeDependenciesProvider.refresh()
	);
	vscode.commands.registerCommand('nodeDependencies.startEntry', handleStartEntry);
	vscode.commands.registerCommand('nodeDependencies.settingEntry', handleSettingEntry);
	// vscode.commands.registerCommand('extension.openPackageOnNpm', (moduleName) =>
	// 	vscode.commands.executeCommand(
	// 		'vscode.open',
	// 		vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)
	// 	)
	// );
	vscode.commands.registerCommand('nodeDependencies.editEntry', handleEditEntry);
	// vscode.commands.registerCommand('nodeDependencies.debugEntry', handleDebugEntry);
	vscode.commands.registerCommand('nodeDependencies.deleteEntry', handleDeleteEntry);
	vscode.commands.registerCommand('nodeDependencies.bzbConfig', () =>
		handleConfigEntry('bzbConfig')
	);
	vscode.commands.registerCommand('nodeDependencies.orcaPreviewConfig', () =>
		handleConfigEntry('orcaPreviewConfig')
	);
}
