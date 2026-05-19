# VContainer Mechanism — Source-Verified Reference

**TASK-WM-109-A** — resolves TASK-WM-109 Issue 1 (hypothesis-fixing 4 cycles).

> **황금의 정신**: 본 문서의 모든 동작 주장은 hadashiA/VContainer `master` source 라인으로 인증됨. 가설 X. 향후 VContainer 회귀 fix 시 — 가설 박기 전에 본 문서의 해당 § 를 먼저 확인하고, 없으면 source 를 정독해 본 문서를 확장한다.

Source: https://github.com/hadashiA/VContainer (`master`, 정독 2026-05-19)

---

## 1. Type Injection 분석 (`Internal/TypeAnalyzer.cs`)

### Field 발견

```csharp
BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly
// + fieldInfo.IsDefined(typeof(InjectAttribute), false)
```

- `NonPublic` **포함** → `private` / `protected` / `internal` field 도 `[Inject]` 만 있으면 주입됨. **accessibility 무관 — 기준은 `[Inject]` attribute 단 하나.**
- `DeclaredOnly` → 각 타입 *레벨* 에서 선언된 멤버만 본다. 그래서 base 클래스 멤버를 잡으려면 **명시적 base 순회 루프가 필요** (아래 참조).

### Inheritance / abstract base 순회

```csharp
while (type != null && type != typeof(object)) { /* collect [Inject] fields/methods/properties */ type = type.BaseType; }
```

- `BaseType` 을 `object` 까지 **명시적으로 walk** → **abstract base class 에 선언된 `[Inject]` field / method / property 도 전부 수집됨.**
- derived 가 같은 이름을 재선언하면 skip: `if (injectFields.Any(x => x.Name == fieldInfo.Name)) continue;`
- method 는 `GetBaseDefinition()` 비교로 override 중복 제거.

### Method / Constructor

- `[Inject]` method 만 수집 (`methodInfo.IsDefined(typeof(InjectAttribute), false)`).
- constructor: `[Inject]` 생성자 단일 우선 → 복수면 예외 → 없으면 파라미터 최다 생성자. Enum / Unity Component 는 null 생성자 허용.

### 적용 순서 (`Internal/ReflectionInjector.cs`)

```csharp
InjectFields(...);  InjectProperties(...);  InjectMethods(...);
```

Fields → Properties → **Methods 순**. `InjectTypeInfo` 는 TypeAnalyzer 가 base 순회로 **이미 병합한 단일 리스트** — injector 는 inheritance 를 다시 신경 쓰지 않는다.

---

## 2. LifetimeScope 생명주기 (`Unity/LifetimeScope.cs`)

- `[DefaultExecutionOrder(-5000)]` → 본 scope 의 `Awake()` 가 **다른 모든 컴포넌트 Awake 보다 먼저**.
- Container build 는 **`Awake()` 중** 발생 (`Start` 아님): `protected virtual void Awake() { if (autoRun) Build(); }`.
- 부모 미해결 시 `EnqueueAwake(this)` 로 deferred retry → `Build()` 가 `AwakeWaitingChildren(this)` 처리.
- 부모 resolution 우선순위: 명시 `parentReference.Object` → `FindParent()` override → type 기반 scene `Find()` → `GlobalOverrideParents` → `VContainerSettings` root.
- Build 시 계층: `Parent.Container.CreateScope(...)` (부모 있으면 child container) / 없으면 root `ContainerBuilder`.
- **Scope ≠ Container**: `LifetimeScope` 는 계층·생명주기·`Configure()` 관리 MonoBehaviour. `Container` (`IObjectResolver`) 는 실제 resolver — scope 가 build 하지만 resolution 은 container 가 한다.

---

## 3. InjectGameObject — self-cascade 근본 (`Unity/ObjectResolverUnityExtensions.cs`)

```csharp
public static void InjectGameObject(this IObjectResolver resolver, GameObject gameObject)
{
    void InjectGameObjectRecursive(GameObject current)
    {
        if (current == null) return;
        using (ListPool<MonoBehaviour>.Get(out var buffer))
        {
            buffer.Clear();
            current.GetComponents(buffer);          // ← self 포함 모든 MonoBehaviour
            foreach (var monoBehaviour in buffer)
                if (monoBehaviour != null)
                    resolver.Inject(monoBehaviour); // ← [Inject] method 재실행
        }
        var transform = current.transform;
        for (var i = 0; i < transform.childCount; i++)
            InjectGameObjectRecursive(transform.GetChild(i).gameObject); // ← 자식 재귀
    }
    InjectGameObjectRecursive(gameObject);
}
```

**근본 (TASK-WM-109 Issue 2 인증)**:

- `current.GetComponents(buffer)` 는 호출한 컴포넌트 **자기 자신을 포함** 한 GameObject 의 모든 MonoBehaviour 를 모은다.
- **visited-set / already-injected 가드 / 재귀 보호가 일절 없다** (null 체크만).
- 따라서 `Player.Construct()` ( `[Inject]` method) 안에서 `resolver.InjectGameObject(gameObject)` 호출 시:
  `InjectGameObject` → `GetComponents` 에 Player 포함 → `resolver.Inject(player)` → Player 의 `[Inject] Construct` 재호출 → 다시 `InjectGameObject` → **무한 재귀 → stack overflow → Unity crash**.

**규칙 (가설 X — 위 source 가 근거)**: `[Inject]` method 본문에서 *자기 자신이 붙은 GameObject* 를 대상으로 `InjectGameObject` 를 호출하지 말 것. 자식만 주입하려면 자식 GameObject 를 명시 전달하거나, self 를 제외한 helper 를 둔다.

---

## 4. RegisterComponentInHierarchy 해석 (`Unity/InstanceProviders/FindComponentProvider.cs`)

```csharp
component = parent.GetComponentInChildren(componentType, true);   // parent 우선, inactive 포함
// fallback:
scene.GetRootGameObjects(gameObjectBuffer);
foreach (var gameObject in gameObjectBuffer) {
    component = gameObject.GetComponentInChildren(componentType, true);
    if (component != null) break;                                  // ← 첫 매치만
}
```

- `GetComponentInChildren(type, true)` — **inactive GameObject 포함**.
- **첫 매치 1개만** 등록 (`if (component != null) break;`). 다중 인스턴스 cascade **하지 않음**.
- `FindObjectsByType` 미사용 — scene root 수동 순회 + `GetComponentInChildren`.

→ 동일 type 컴포넌트가 씬에 여러 개여도 `RegisterComponentInHierarchy` 는 *하나* 만 잡는다. 다중 인스턴스는 별도 cascade 설계 필요 (TASK-WM-109 Issue 3/5 의 근본 배경).

---

## 5. 본 세션 4개 가설 — source 라인 반증 (TASK-WM-109 Issue 1)

| # | 가설 (본 세션 2026-05-14~15) | 판정 | source 근거 |
|---|---|---|---|
| 1 | "abstract base `[Inject]` field 처리 한계" | **틀림** | `TypeAnalyzer`: `while (type != null && type != typeof(object)) ... type = type.BaseType` 로 base 명시 순회 → abstract base `[Inject]` 멤버 전부 수집 (§1) |
| 2 | "Init Awake → Start race" | **틀림·무관** | `LifetimeScope` `[DefaultExecutionOrder(-5000)]` + Build 는 `Awake()` 중 → Container 는 일반 컴포넌트 Awake/Start 전에 이미 존재 (§2) |
| 3 | "field 인젝션 private/protected 안 됨" | **틀림** | field BindingFlags 에 `NonPublic` 명시 포함 → accessibility 무관, 기준은 `[Inject]` attribute 뿐 (§1) |
| 4 | "SetBaseDeps 수동 패턴 필요" | **불필요** | base 순회가 base `[Inject]` 를 자동 병합 (`InjectTypeInfo` 단일 리스트) → 수동 SetBaseDeps 는 중복 (§1) |

4개 모두 source 정독 1회로 반증 가능했다. 가설 기반 5+ commit 은 source 미정독의 비용.

---

## 6. 향후 VContainer 회귀 fix 검증 프레임워크

가설 박기 전 **반드시**:

1. **본 문서 해당 § 확인.** 답이 있으면 그대로 적용 (재가설 X).
2. 없으면 → `github.com/hadashiA/VContainer` `master` 해당 source 정독 → **본 문서에 § 추가 + source 라인 인용**.
3. fix 는 *재현 테스트 먼저* (`[Test]` 또는 최소 repro scene) → 가설 검증을 코드로 고정. 「그냥 진행」 식 self-cycle 미검증 금지 (Issue 2 교훈).
4. PR 설명에 "본 문서 § N 근거" 를 명시 — 리뷰어가 가설 여부를 audit 가능.

테스트 패턴 (Unity Test Framework, repro 우선):

```csharp
// 가설 검증을 코드로 고정하는 패턴 — abstract base [Inject] 회귀 가드 예
[Test]
public void AbstractBase_InjectField_IsResolved()
{
    var builder = new ContainerBuilder();
    builder.Register<Dep>(Lifetime.Transient);
    builder.Register<ConcreteImpl>(Lifetime.Transient); // ConcreteImpl : AbstractBase, AbstractBase has [Inject] Dep field
    var container = builder.Build();
    var impl = container.Resolve<ConcreteImpl>();
    Assert.That(impl.BaseDep, Is.Not.Null); // §1 base 순회 인증
}
```

---

## 7. cwd 한계 명시 (정직 보고)

- 본 작업 cwd (KarmoLab repo) 에는 **VContainer 패키지도, WitchMendokusai VContainer 사용 게임 코드(Motor/SceneLifetimeScope/Player.Construct 등)도 부재** (`manifest.json` 에 VContainer 없음, `using VContainer` 0건).
- 따라서 스펙 산출물 중 **"기존 코드 주석에 근본 이유 박기"는 본 PR 에서 불가** — 실제 WM 게임 repo 에서 별도 적용 필요. 본 문서가 그 정본 레퍼런스 역할.
- "재현 테스트" 는 §6 의 패턴으로 제시 (실 컴파일 검증은 VContainer 가 있는 WM repo 에서).

---

## cross-cut

- TASK-WM-109 Issue 1 (가설 4회), Issue 2 (self-cascade crash), Issue 3/5 (cascade 분산)
- TASK-WM-108 § VContainer 정밀 학습
- `memo/rules/process.md § 황금의 정신 — 가설 박기 X` / `§ 설계 자가 검토`
