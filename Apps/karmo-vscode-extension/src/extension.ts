import * as vscode from 'vscode';
import { KarmoViewProvider } from './KarmoViewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('KarmoExtension is now active!');

	// 사이드바 뷰 프로바이더 등록
	const provider = new KarmoViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(KarmoViewProvider.viewType, provider)
	);

	// 상태 표시줄 아이템 생성
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'karmo.toggleExtensions';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// 상태 표시줄 텍스트 업데이트 함수
	const updateStatusBar = () => {
		const config = vscode.workspace.getConfiguration();
		const excludeConfig = config.get<Record<string, boolean>>('files.exclude') || {};
		const toggleGroups = config.get<any[]>('karmo.toggleGroups') || [];

		// 전체적으로 하나라도 숨겨져 있는지 확인 (UI 간략화를 위해)
		const anyHidden = toggleGroups.some(group =>
			group.patterns.every((p: string) => excludeConfig[p] === true)
		);

		statusBarItem.text = anyHidden ? `$(eye-closed) Toggle Ext` : `$(eye) Toggle Ext`;
		statusBarItem.tooltip = `파일 확장자 토글 상태임 (클릭 시 전체 토글)`;
	};

	// 초기 업데이트
	updateStatusBar();

	// 설정 변경 리스너 등록 (사이드바 및 상태 표시줄 동기화)
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('files.exclude') || e.affectsConfiguration('karmo.toggleGroups')) {
			provider.updateState();
			updateStatusBar();
		}
	}));

	// 전체 토글 명령어 (상태 표시줄용)
	context.subscriptions.push(vscode.commands.registerCommand('karmo.toggleExtensions', async () => {
		const config = vscode.workspace.getConfiguration();
		const excludeConfig = config.get<Record<string, boolean>>('files.exclude') || {};
		const toggleGroups = config.get<any[]>('karmo.toggleGroups') || [];

		// 현재 하나라도 보이고 있는지 확인
		const anyVisible = toggleGroups.some(group =>
			group.patterns.every((p: string) => excludeConfig[p] !== true)
		);
		const newStateVisible = !anyVisible; // 보이고 있으면 숨기고, 숨겨져 있으면 보이게 함

		const newExcludeConfig = { ...excludeConfig };
		for (const group of toggleGroups) {
			for (const pattern of group.patterns) {
				if (newStateVisible) {
					delete newExcludeConfig[pattern]; // 보이려면 제외 목록에서 삭제
				} else {
					newExcludeConfig[pattern] = true; // 숨기려면 제외 목록에 추가
				}
			}
		}
		await config.update('files.exclude', newExcludeConfig, vscode.ConfigurationTarget.Workspace);
	}));

	// 그룹별 토글 명령어 (사이드바용)
	context.subscriptions.push(vscode.commands.registerCommand('karmo.toggleGroup', async (groupId: string) => {
		const config = vscode.workspace.getConfiguration();
		const excludeConfig = config.get<Record<string, boolean>>('files.exclude') || {};
		const toggleGroups = config.get<any[]>('karmo.toggleGroups') || [];
		const group = toggleGroups.find(g => g.id === groupId);

		if (!group) return;

		const isCurrentlyVisible = group.patterns.every((p: string) => excludeConfig[p] !== true);
		const newStateVisible = !isCurrentlyVisible;

		const newExcludeConfig = { ...excludeConfig };
		for (const pattern of group.patterns) {
			if (newStateVisible) {
				delete newExcludeConfig[pattern]; // 보이려면 삭제
			} else {
				newExcludeConfig[pattern] = true; // 숨기려면 추가
			}
		}
		await config.update('files.exclude', newExcludeConfig, vscode.ConfigurationTarget.Workspace);
	}));

	// 사이드바 포커스 명령어
	context.subscriptions.push(vscode.commands.registerCommand('karmo.focusSidebar', () => {
		vscode.commands.executeCommand('karmo-sidebar-view.focus');
	}));
}

export function deactivate() { }
