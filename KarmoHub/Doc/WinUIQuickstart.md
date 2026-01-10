# WinUI Quickstart (KarmoHub 용)

## 왜 WinUI 3?

- 최신 Windows 11 스타일(Mica, Fluent 등) 지원
- UWP/앱 컨테이너 통합, 최신 API 제공
- XAML 기반 UI 구조, MVVM 패턴 적용 가능

## 최소 프로젝트 구조

```text
KarmoHub/
  KarmoHub.csproj        <- <UseWinUI>true</UseWinUI>
  App.xaml/.cs          <- 앱 엔트리, Startup 로직
  MainWindow.xaml/.cs   <- 메인 대시보드 (라이브러리 UI)
  Services/             <- 비즈니스 로직, 프로세스 관리, 라이브러리 관리 등
  Resources/            <- 아이콘, 이미지 등
```

## 필수 XAML/코드 개념 요약

- App.xaml: 전역 리소스, Startup 이벤트 설정.
- MainWindow.xaml: UI 선언. `x:Name`으로 코드비하인드에서 컨트롤 접근.
- 코드비하인드(.xaml.cs): 이벤트 핸들러, 간단 로직. 복잡해지면 ViewModel로 이동.
- 리소스: `<Application.Resources>` 또는 별도 `*.xaml` 리소스 사전에서 브러시/스타일 정의.

## 트레이 아이콘 통합 패턴

- `H.NotifyIcon.WinUI` 라이브러리 사용
- XAML 대신 C# 코드에서 `TaskbarIcon` 생성 및 이벤트 연결
- 창 닫기(AppWindow.Closing) 시 `Hide()`로 전환해 트레이에 남김
- 종료 시 트레이 아이콘 Dispose

## 데이터 바인딩(필요 시)

- ViewModel에 `INotifyPropertyChanged` 구현, 속성 변경 시 `PropertyChanged` 발생
- XAML `DataContext`를 ViewModel로 설정 후 `{x:Bind PropertyName}` 또는 `{Binding PropertyName}` 사용
- 단방향: `Mode=OneWay`, 양방향 입력: `Mode=TwoWay`

## 빌드/실행

```bash
cd KarmoHub
Get-Process KarmoHub -ErrorAction SilentlyContinue | Stop-Process -Force; dotnet build
```

## 다음 확장 아이디어

- 설정 파일(JSON) + 바인딩으로 게임 경로/옵션 UI 구성
- Mica/Fluent 효과, 커스텀 타이틀바, 사이드바 등 WinUI 3 고유 기능 적극 활용
