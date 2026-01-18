const vscode = acquireVsCodeApi();
const cardListContainer = document.getElementById('card-list');
const settingsBtn = document.getElementById('settings-button');
let isInitialLoad = true;
// HTML에 주입된 카드 템플릿 읽기
const cardTemplate = document.getElementById('card-template').innerHTML;

// KarmoViewProvider에서 온 메시지 처리
window.addEventListener('message', event => {
	const message = event.data;
	switch (message.type) {
		case 'updateState':
			renderGroups(message.groups);
			if (isInitialLoad) {
				setTimeout(() => {
					document.body.classList.remove('no-transition');
				}, 50);
				isInitialLoad = false;
			}
			break;
	}
});

function renderGroups(groups) {
	if (!cardTemplate) return;

	cardListContainer.innerHTML = '';
	groups.forEach(group => {
		const div = document.createElement('div');
		div.innerHTML = cardTemplate
			.replace(/{{name}}/g, group.name)
			.replace(/{{id}}/g, group.id)
			.replace(/{{statusText}}/g, group.isVisible ? 'Visible' : 'Hidden')
			.replace(/{{checked}}/g, group.isVisible ? 'checked' : '');

		const card = div.firstElementChild;
		const checkbox = card.querySelector('input');
		checkbox.addEventListener('change', () => {
			vscode.postMessage({
				type: 'toggleGroup',
				groupId: group.id
			});
		});

		cardListContainer.appendChild(card);
	});
}

settingsBtn.addEventListener('click', () => {
	vscode.postMessage({ type: 'openSettings' });
});

// 초기 데이터 요청
vscode.postMessage({ type: 'refresh' });
