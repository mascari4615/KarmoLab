import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ToggleGroup {
	id: string;
	name: string;
	patterns: string[];
}

export class KarmoViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'karmo-sidebar-view';
	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'toggleGroup':
					vscode.commands.executeCommand('karmo.toggleGroup', data.groupId);
					break;
				case 'refresh':
					this.updateState();
					break;
				case 'openSettings':
					vscode.commands.executeCommand('workbench.action.openSettings', 'karmo.toggleGroups');
					break;
			}
		});

		this.updateState();
	}

	public updateState() {
		if (!this._view) return;

		const config = vscode.workspace.getConfiguration();
		const excludeConfig = config.get<Record<string, boolean>>('files.exclude') || {};
		const toggleGroups = config.get<ToggleGroup[]>('karmo.toggleGroups') || [];

		const groupsWithState = toggleGroups.map(group => {
			// 모든 패턴이 exclude에 "없어야" Visible인 상태
			const isVisible = group.patterns.every(pattern => excludeConfig[pattern] !== true);
			return {
				...group,
				isVisible: isVisible
			};
		});

		this._view.webview.postMessage({
			type: 'updateState',
			groups: groupsWithState
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'index.html');
		const cardTemplatePath = vscode.Uri.joinPath(this._extensionUri, 'media', 'card.html');
		const packageJsonPath = vscode.Uri.joinPath(this._extensionUri, 'package.json');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cardTemplate = fs.readFileSync(cardTemplatePath.fsPath, 'utf8');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath.fsPath, 'utf8'));
		const buildTime = packageJson.buildTime || 'Unknown';

		html = html.replace('{{styleUri}}', styleUri.toString());
		html = html.replace('{{scriptUri}}', scriptUri.toString());
		html = html.replace('{{cardTemplate}}', cardTemplate);
		html = html.replace('{{buildTime}}', buildTime);

		return html;
	}


}
