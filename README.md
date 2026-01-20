# KarmoLab

개인 프로젝트를 위한 통합 리포지토리입니다.
Unity, WPF, .NET 등 다양한 환경의 프로젝트를 한곳에서 관리합니다.

---

## Core Projects

### Unity Projects

- **[KarmoLab](file:///Unity/KarmoLab/)** (`Unity/KarmoLab`)  
  Unity 기반 메인 프로젝트. (**KarmoToys**)
- **[LocalPackages](file:///Unity/LocalPackages/)** (`Unity/LocalPackages`)  
  프로젝트 간 공유되는 커스텀 패키지 모음. (**KarmoEditor**)

### Non-Unity

- **[KarmoHub](file:///Apps/KarmoHub/)** (`Apps/KarmoHub`)  
  WPF 기반 통합 런처.
- **[YawnBot](file:///Apps/YawnBot/)** (`Apps/YawnBot`)  
  .NET 9 기반 Discord Bot.

<br/>

## Structure

```text
Root
├── Apps/       : 독립 실행형 애플리케이션 (WPF, Bot 등)
├── Unity/      : 유니티 프로젝트 및 패키지
├── docs/       : 통합 문서 저장소 (Standards, Projects, Notes)
└── Lab/        : 실험 및 학습용 폴더 (CSharpPlayground 등)
```

<br/>

## Getting Started

### Prerequisites

- **Unity**: 6000.0.32f1+
- **.NET SDK**: 9.0+

### Setup

```bash
# Clone Repository
git config --global core.symlinks true
git clone https://github.com/_Mascari4615/KarmoLab.git
```

<br/>

## Documentation

더 자세한 내용은 **[docs](file:///docs/)** 디렉터리를 참고하세요.
