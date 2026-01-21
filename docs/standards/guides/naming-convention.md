# Naming Convention Guide

Summary: KarmoLab 프로젝트의 파일/폴더 네이밍 규칙 가이드. 업계 표준 및 플랫폼별 권장사항 포함.

## 📁 폴더 네이밍

### C# 프로젝트 (Apps/)

**규칙**: **PascalCase**

```
✅ 좋은 예:
Apps/YawnBot/
├── src/
├── tests/
└── docs/

❌ 나쁜 예:
Apps/yawn-bot/    # kebab-case
Apps/yawn_bot/    # snake_case
```

- 이유: C# 네임스페이스 규칙과 일치
- 예외: `src/`, `docs/`, `tests/` 같은 표준 폴더는 소문자

### Unity 프로젝트 (Unity/)

**규칙**: **PascalCase**

```
✅ 좋은 예:
Unity/KarmoToys/Assets/
├── Scripts/
├── Prefabs/
└── Scenes/

❌ 나쁜 예:
Assets/scripts/      # 소문자
Assets/my_prefabs/   # snake_case
```

- Unity 공식 권장사항
- 에셋 스토어 표준

### 문서 폴더

**규칙**: **kebab-case** (업계 표준)

```
✅ 좋은 예:
docs/
├── features/
│   ├── gemini-integration/
│   └── user-authentication/
└── guides/

❌ 나쁜 예:
docs/GeminiIntegration/  # PascalCase (문서에서는 비표준)
docs/user_auth/          # snake_case + 축약
```

- URL 친화적
- 대소문자 무관 (크로스 플랫폼 호환성)
- 업계 대다수 사용

## 📄 파일 네이밍

### C# 코드 파일

**규칙**: **PascalCase** + **파일명 = 클래스명**

```
✅ 좋은 예:
CompanionFeature.cs
GeminiService.cs
ICompanionModule.cs        # Interface
CompanionModuleBase.cs     # Base class

❌ 나쁜 예:
companionFeature.cs        # camelCase
companion_feature.cs       # snake_case
CF.cs                      # 축약
```

- C# 표준 (Microsoft 공식)
- 1 파일 = 1 클래스 원칙

### Unity 스크립트

**규칙**: **PascalCase**

```
✅ 좋은 예:
CompanionCharacter.cs
TimeModule.cs
PlayerController.cs

❌ 나쁜 예:
companion.cs               # 소문자
Companion_Character.cs     # snake_case
```

- Unity 공식 스타일 가이드
- MonoBehaviour 클래스명과 일치

### 문서 파일

**규칙**: **kebab-case** (업계 표준)

```
✅ 좋은 예:
README.md                  # 표준 문서는 대문자
CHANGELOG.md
TODO.md
architecture.md
api-reference.md
getting-started.md

❌ 나쁜 예:
readme.MD                  # 확장자 대문자
history_log.md             # snake_case
ArchitectureGuide.md       # PascalCase (문서에서는 비표준)
```

- **표준 문서** (README, TODO, CHANGELOG): 대문자
- **일반 문서**: kebab-case
- URL 친화적, 가독성 좋음

### 설정/데이터 파일

**규칙**: **프레임워크/도구의 표준 따르기**

```
✅ 좋은 예:
appsettings.json           # .NET 표준
package.json               # Node.js 표준
.gitignore                 # Git 표준
CompanionData.asset        # Unity ScriptableObject (PascalCase)
```

## 🎮 Unity 에셋 네이밍

### 씬 파일

```
✅ 좋은 예:
MainMenu.unity
GamePlay_Level01.unity
Tutorial_Stage01.unity
```

### 프리팹

```
✅ 좋은 예:
Player_Character.prefab
Enemy_Goblin.prefab
UI_HealthBar.prefab
```

### 텍스처/스프라이트

**규칙**: **카테고리_대상_상태**

```
✅ 좋은 예:
Character_Player_Idle.png
UI_Button_Normal.png
Environment_Grass_01.png

❌ 나쁜 예:
tex1.png
button.png
grass.png
```

## 📚 빠른 참조 카드

| 파일/폴더 타입 | 규칙 | 예시 |
|---------------|------|------|
| C# 클래스 파일 | PascalCase | UserService.cs |
| C# 폴더 | PascalCase | Services/, Models/ |
| Unity 스크립트 | PascalCase | PlayerController.cs |
| Unity 폴더 | PascalCase | Scripts/, Prefabs/ |
| 문서 폴더 | kebab-case | features/, guides/ |
| 문서 파일 | kebab-case | api-reference.md |
| 표준 문서 | UPPERCASE | README.md, TODO.md |
| 설정 파일 | 프레임워크 표준 | appsettings.json |
| Unity 에셋 | 카테고리_설명 | UI_Button_Normal.png |

## 💡 핵심 원칙

1. **플랫폼 표준 우선** - 프레임워크/도구의 관례 따르기
2. **일관성** - 한 프로젝트 내에서는 하나의 스타일만
3. **의미 명확성** - 축약 금지, 역할이 명확한 이름
4. **검색 가능성** - 너무 일반적인 이름 피하기

## 🎓 학습 리소스

- **Microsoft C# 가이드**: [docs.microsoft.com/dotnet/csharp](https://docs.microsoft.com/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- **Unity 스타일 가이드**: Unity Manual > Scripting > Coding Style
- **Google 스타일 가이드**: [google.github.io/styleguide](https://google.github.io/styleguide/)
