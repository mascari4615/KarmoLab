# Tech Note: User Environment Installation (No UAC)

관리자 권한(UAC) 없이 사용자 로컬 환경에 앱을 설치하고, Windows 시스템(제어판, 시작 메뉴)에 통합하는 방법에 대한 기술 노트.

## 1. 설치 경로 전략

`Program Files`는 관리자 권한 필수이므로 미사용. 대신 사용자별 로컬 데이터 폴더 사용.

- **Target Path**: `%LocalAppData%/YourApp/` (`C:\Users\<User>\AppData\Local\YourApp`)
- **장점**:
  - 권한 상승 불필요.
  - 자동 업데이트 시 Silent Update 가능.

## 2. Windows 시스템 통합 (Registry)

### "프로그램 추가/제거" 등록

`HKCU`(HKEY_CURRENT_USER) 레지스트리를 사용하면 현재 사용자 범위 내에서 프로그램을 제어판 목록에 추가할 수 있음.

- **Key Path**: `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{AppId}`
- **Required Values**:
  - `DisplayName`: 제어판에 표시될 이름
  - `DisplayVersion`: 버전 (1.0.0)
  - `DisplayIcon`: 아이콘 경로 (.exe 또는 .ico)
  - `UninstallString`: 삭제 명령 (e.g., `"Path/To/App.exe" --uninstall`)
  - `InstallLocation`: 설치 폴더 경로
  - `Publisher`: 게시자 이름

## 3. 시작 메뉴 바로가기 (Start Menu)

Windows 검색에 노출되려면 시작 메뉴 프로그램 폴더에 바로가기(.lnk)를 생성해야 함.

- **Folder Path**: `%AppData%\Microsoft\Windows\Start Menu\Programs\YourAppFolder\`
- **IShellLink**: C#에서는 `IWshRuntimeLibrary` (COM) 또는 ShellLink 라이브러리를 통해 `.lnk` 생성 가능.

## 4. 삭제 (Uninstaller) 구현

별도의 `uninstall.exe`를 만들지 않고 메인 앱에 `--uninstall` 인자를 처리하는 로직을 심는 것이 효율적.

```csharp
// Program.cs or App.xaml.cs
if (args.Contains("--uninstall"))
{
    // 1. 레지스트리 키 삭제 (Registry.CurrentUser.DeleteSubKey)
    // 2. 시작 메뉴 바로가기 삭제
    // 3. (Optional) 설치 폴더 삭제 스크립트 실행 후 종료
    //    (자신이 실행 중이라 셀프 삭제가 불가능하므로, cmd /c del 등의 트릭 사용)
}
```
