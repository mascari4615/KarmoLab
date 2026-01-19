# WPF Quickstart (KarmoHub 용)

Summary: KarmoHub 런처 개발을 위한 WPF(Windows Presentation Foundation) 핵심 개념 및 구조 가이드.

## 왜 WPF?

- DPI 대응과 레이아웃 유연성
- 스타일/테마, 리소스 사전(XAML Resource Dictionary) 확장 용이
- MVVM 패턴 적용 쉬움: View(XAML)와 로직 분리

## 최소 프로젝트 구조

```text
KarmoHub/
  KarmoHub.csproj        <- <UseWPF>true</UseWPF>
  App.xaml/.cs          <- 앱 엔트리, Startup 로직
  MainWindow.xaml/.cs   <- 메인 대시보드 (라이브러리 UI)
  Services/             <- 비즈니스 로직, 프로세스 관리, 라이브러리 관리 등
  Tray/                 <- 트레이 아이콘 래퍼
```

## 필수 XAML/코드 개념 요약

- App.xaml: 전역 리소스, Startup 이벤트 설정.
- MainWindow.xaml: UI 선언. `x:Name`으로 코드비하인드에서 컨트롤 접근.
- 코드비하인드(.xaml.cs): 이벤트 핸들러, 간단 로직. 복잡해지면 ViewModel로 이동.
- 리소스: `<Application.Resources>` 또는 별도 `*.xaml` 리소스 사전에서 브러시/스타일 정의.

## 트레이 아이콘 통합 패턴

1) 프로젝트에 `<UseWindowsForms>true</UseWindowsForms>` 추가 (이미 설정됨).
2) `System.Windows.Forms.NotifyIcon` 생성, `ContextMenuStrip` 메뉴 연결.
3) 창 닫기(OnClosing) 시 `Hide()`로 전환해 트레이에 남김.
4) 종료 시 `NotifyIcon.Dispose()` 후 `Application.Shutdown()` 호출.

## 데이터 바인딩(필요 시)

- ViewModel에 `INotifyPropertyChanged` 구현, 속성 변경 시 `PropertyChanged` 발생.
- XAML `DataContext`를 ViewModel로 설정 후 `{Binding PropertyName}` 사용.
- 단방향: `Mode=OneWay`, 양방향 입력: `Mode=TwoWay`.

## 빌드/실행

```bash
cd KarmoHub
dotnet build
dotnet run
```

## 다음 확장 아이디어

- 설정 파일(JSON) + 바인딩으로 게임 경로/옵션 UI 구성
