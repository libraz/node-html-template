# HTML::Template → Node.js/TypeScript 移植計画書

**プロジェクト名**: `node-perl-html-template`
**バージョン**: 1.0.0
**更新日**: 2025-10-23
**優先順位**: **互換性 > 速度 > コード複雑性**

---

## 目次

1. [概要](#概要)
2. [優先順位と設計方針](#優先順位と設計方針)
3. [技術スタック](#技術スタック)
4. [プロジェクト構造](#プロジェクト構造)
5. [型定義設計](#型定義設計)
6. [アーキテクチャ設計](#アーキテクチャ設計)
7. [パフォーマンス最適化戦略](#パフォーマンス最適化戦略)
8. [実装フェーズ](#実装フェーズ)
9. [テスト戦略](#テスト戦略)
10. [互換性マトリクス](#互換性マトリクス)
11. [ベンチマーク目標](#ベンチマーク目標)

---

## 概要

Perl モジュール `HTML::Template` (v2.98) を TypeScript/ESM で**完全互換移植**するプロジェクト。

### 目標

- ✅ **100% API互換性**: すべてのオプション、メソッド、動作を完全再現
- ✅ **Perlテストスイート完全移植**: 30+の既存テストをすべて通過
- ✅ **高速化**: Node.jsの強みを活かした最適化（V8最適化、ゼロコピー、キャッシュ）
- ✅ **型安全性**: TypeScriptによる厳密な型定義
- ✅ **ESM対応**: 完全なESモジュール

### 対象機能

以下のすべての機能を完全サポート：

- **テンプレートタグ**: `TMPL_VAR`, `TMPL_LOOP`, `TMPL_IF`, `TMPL_UNLESS`, `TMPL_ELSE`, `TMPL_INCLUDE`
- **エスケープ**: HTML, JavaScript, URL, カスタム
- **遅延評価**: コールバック関数による変数/ループの遅延評価
- **キャッシュ**: メモリキャッシュ、ファイルキャッシュ、Blindキャッシュ
- **ループコンテキスト変数**: `__first__`, `__last__`, `__index__`, `__counter__`, etc.
- **グローバル変数**: ループ内外での変数スコープ制御
- **アソシエート**: 外部オブジェクトからのパラメータ取得
- **フィルター**: テンプレート読み込み時の変換処理
- **インクルード**: 再帰的なテンプレートインクルード
- **エンコーディング**: UTF-8他、各種文字エンコーディング
- **Legacy互換**: Vanguard形式（`%VAR%`）対応

---

## 優先順位と設計方針

### 1. 互換性（最優先）

**原則**: Perlの HTML::Template で動作するコードは、一切の変更なしに動作すること

- すべてのオプション名、デフォルト値を完全一致
- すべてのエラーメッセージを可能な限り一致
- エッジケースの挙動も完全再現
- Perlの30+テストスイートをすべて移植し、100%パス

**許容される違い**:

- Perl固有機能（Taint mode、IPC::SharedCache）は省略可
- エラースタックトレースのフォーマット差異
- 浮動小数点演算の微小な誤差

### 2. 速度（第二優先）

**目標**: Perl版を上回る、または同等のパフォーマンス

互換性を損なわない範囲で以下を追求：

- パース時最適化（正規表現プリコンパイル、ゼロコピー）
- ランタイム最適化（文字列結合最適化、インライン展開）
- キャッシュ最適化（高速なハッシュキー生成、効率的なmtime確認）
- V8エンジン最適化（モノモーフィック関数、hidden class維持）

### 3. コード複雑性（第三優先）

**方針**: 速度のために複雑なコードも許容

- パフォーマンスクリティカルな部分は可読性より速度優先
- コード重複も性能向上に寄与する場合は許容
- ただし、コメントで十分な説明を記載

---

## 技術スタック

### 必須環境

- **Node.js**: >= 22.0.0
- **TypeScript**: ^5.9.0
- **パッケージマネージャー**: Yarn >= 4.0.0

### 開発ツール

- **ビルド**: Vite 7.1.x（ライブラリモード）
- **テスト**: Vitest 3.2.x
- **リント**: ESLint 8.57.x + TypeScript ESLint
- **フォーマット**: Prettier 3.6.x
- **型チェック**: TypeScript Compiler

### 依存関係

**ランタイム依存なし** - Pure Node.js実装

**開発依存**:

```json
{
  "@types/node": "^22.x",
  "@typescript-eslint/eslint-plugin": "^8.x",
  "@typescript-eslint/parser": "^8.x",
  "eslint": "~8.57.1",
  "eslint-config-airbnb-base": "^15.0.0",
  "eslint-plugin-import": "^2.32.0",
  "prettier": "^3.6.x",
  "typescript": "^5.9.x",
  "vite": "^7.1.x",
  "vitest": "^3.2.x"
}
```

---

## プロジェクト構造

```
node-perl-html-template/
├── src/
│   ├── index.ts                      # メインエクスポート
│   ├── HTMLTemplate.ts               # メインクラス
│   ├── types.ts                      # 公開型定義
│   │
│   ├── parser/
│   │   ├── Tokenizer.ts              # レキサー（正規表現ベース、最速）
│   │   ├── Parser.ts                 # 構文解析器（シングルパス）
│   │   └── types.ts                  # パース内部型
│   │
│   ├── runtime/
│   │   ├── OutputGenerator.ts        # 出力生成（ゼロコピー指向）
│   │   ├── Var.ts                    # TMPL_VAR実装
│   │   ├── Loop.ts                   # TMPL_LOOP実装（ループコンテキスト）
│   │   ├── Cond.ts                   # IF/UNLESS/ELSE実装
│   │   ├── Escape.ts                 # エスケープ処理（事前コンパイル）
│   │   └── nodes.ts                  # ノード型定義
│   │
│   ├── cache/
│   │   ├── MemoryCache.ts            # インメモリLRUキャッシュ
│   │   ├── FileCache.ts              # ファイルキャッシュ（高速化）
│   │   └── CacheKey.ts               # キャッシュキー生成（最速ハッシュ）
│   │
│   ├── utils/
│   │   ├── FileResolver.ts           # ファイル解決（同期/非同期）
│   │   ├── LazyValue.ts              # 遅延評価ラッパー
│   │   ├── encoding.ts               # エンコーディング処理
│   │   └── helpers.ts                # 汎用ヘルパー
│   │
│   └── compat/
│       └── vanguard.ts               # Vanguard互換モード
│
├── tests/
│   ├── setup.ts                      # テスト共通設定
│   ├── unit/                         # ユニットテスト
│   │   ├── parser/                   # パーサーテスト
│   │   ├── runtime/                  # ランタイムテスト
│   │   ├── cache/                    # キャッシュテスト
│   │   └── utils/                    # ユーティリティテスト
│   │
│   └── integration/                  # 統合テスト（Perl移植）
│       ├── 01-bad-args.test.ts
│       ├── 01-coderefs.test.ts
│       ├── 02-parse.test.ts
│       ├── 02-random.test.ts
│       └── ... (30+ tests)
│
├── templates/                        # テストテンプレート
│   ├── simple.tmpl
│   ├── loop.tmpl
│   └── ...
│
├── bench/                            # ベンチマーク
│   ├── parse.bench.ts
│   ├── output.bench.ts
│   └── cache.bench.ts
│
├── docs/
│   ├── migration-plan.md             # この文書
│   ├── api.md                        # APIドキュメント
│   ├── performance.md                # パフォーマンスガイド
│   └── compatibility.md              # 互換性ドキュメント
│
├── .eslintrc.cjs                     # ESLint設定
├── .prettierrc                       # Prettier設定
├── .vscode/                          # VSCode設定
│   ├── settings.json
│   └── extensions.json
├── tsconfig.json                     # TypeScript設定
├── vite.config.ts                    # Viteビルド設定
├── vitest.config.ts                  # Vitestテスト設定
├── package.json
├── README.md
└── LICENSE
```

---

## 型定義設計

### 主要型定義

```typescript
// src/types.ts

/**
 * HTML::Template コンストラクタオプション
 * Perl版と100%互換
 */
export interface HTMLTemplateOptions {
  // ========================================
  // テンプレートソース（いずれか1つ必須）
  // ========================================

  /** ファイルパスから読み込み */
  filename?: string;

  /** 文字列から読み込み */
  scalarref?: string;

  /** 行配列から読み込み */
  arrayref?: string[];

  /** ReadableStreamから読み込み */
  filehandle?: NodeJS.ReadableStream;

  // または type + source 形式
  type?: 'filename' | 'scalarref' | 'arrayref' | 'filehandle';
  source?: string | string[] | NodeJS.ReadableStream;

  // ========================================
  // エラー検出オプション
  // ========================================

  /** 未定義パラメータ設定時にエラー (default: true) */
  die_on_bad_params?: boolean;

  /** 厳密な構文チェック (default: true) */
  strict?: boolean;

  /** Vanguard互換モード (%VAR%構文) (default: false) */
  vanguard_compatibility_mode?: boolean;

  /** Perl Taint mode代替（Node.jsでは警告のみ） (default: false) */
  force_untaint?: 0 | 1 | 2;

  // ========================================
  // キャッシュオプション
  // ========================================

  /** インメモリキャッシュ有効化 (default: false) */
  cache?: boolean;

  /** mtime確認なしキャッシュ（最速） (default: false) */
  blind_cache?: boolean;

  /** ファイルキャッシュ有効化 (default: false) */
  file_cache?: boolean;

  /** ファイルキャッシュディレクトリ（file_cache時必須） */
  file_cache_dir?: string;

  /** キャッシュディレクトリのパーミッション (default: 0o700) */
  file_cache_dir_mode?: number;

  /** メモリ+ファイル二重キャッシュ (default: false) */
  double_file_cache?: boolean;

  /** 遅延変数の結果をキャッシュ (default: false) */
  cache_lazy_vars?: boolean;

  /** 遅延ループの結果をキャッシュ (default: false) */
  cache_lazy_loops?: boolean;

  // ========================================
  // ファイルシステムオプション
  // ========================================

  /** テンプレート検索パス (default: []) */
  path?: string[];

  /** TMPL_INCLUDEでpathを検索 (default: false) */
  search_path_on_include?: boolean;

  /** UTF-8として読み込み (default: false) */
  utf8?: boolean;

  /** カスタムエンコーディング（utf8と排他） */
  open_mode?: string;

  // ========================================
  // デバッグオプション
  // ========================================

  /** デバッグ出力 (default: false) */
  debug?: boolean;

  /** パーススタックダンプ (default: false) */
  stack_debug?: boolean;

  /** キャッシュデバッグ (default: false) */
  cache_debug?: boolean;

  // ========================================
  // 動作オプション
  // ========================================

  /** param()メソッドを持つオブジェクト連携 */
  associate?: AssociateObject | AssociateObject[];

  /** パラメータ名の大文字小文字を区別 (default: false) */
  case_sensitive?: boolean;

  /** ループコンテキスト変数有効化 (default: false) */
  loop_context_vars?: boolean;

  /** グローバル変数有効化 (default: false) */
  global_vars?: boolean;

  /** TMPL_INCLUDEを無効化 (default: false) */
  no_includes?: boolean;

  /** インクルード最大深度 (default: 10) */
  max_includes?: number;

  /** インクルードファイル不在時エラー (default: true) */
  die_on_missing_include?: boolean;

  /** テンプレート読み込み後のフィルター */
  filter?: Filter | Filter[];

  /** デフォルトエスケープタイプ (default: 'none') */
  default_escape?: EscapeType;
}

/**
 * エスケープタイプ
 */
export type EscapeType = 'html' | 'js' | 'url' | 'none';

/**
 * パラメータ値の型
 */
export type ParamValue = string | number | boolean | null | undefined | LazyValue | LoopData;

/**
 * 遅延評価変数（コールバック）
 */
export type LazyValue = () => string | number | boolean | null | undefined;

/**
 * ループデータ（配列 or 遅延評価）
 */
export type LoopData = Record<string, ParamValue>[] | LazyLoopValue;

/**
 * 遅延評価ループ
 */
export type LazyLoopValue = () => Record<string, ParamValue>[];

/**
 * param()メソッドを持つオブジェクト（CGI.pmなど）
 */
export interface AssociateObject {
  param(name: string): ParamValue;
}

/**
 * フィルター定義
 */
export interface Filter {
  sub: (content: string | string[]) => string | string[];
  format?: 'scalar' | 'array';
}

/**
 * output()メソッドオプション
 */
export interface OutputOptions {
  /** 出力先ストリーム（指定時はundefinedを返す） */
  print_to?: NodeJS.WritableStream;
}

/**
 * query()メソッドの戻り値
 */
export type QueryResult = 'VAR' | 'LOOP' | undefined;

/**
 * パラメータ設定の型（param()オーバーロード用）
 */
export type ParamSetter =
  | []
  | [string]
  | [string, ParamValue]
  | [Record<string, ParamValue>]
  | [string, ParamValue, ...Array<[string, ParamValue]>];
```

---

## アーキテクチャ設計

### 1. メインクラス (HTMLTemplate)

```typescript
/**
 * HTML::Template メインクラス
 *
 * 完全互換API:
 * - new(options)
 * - param(...args)
 * - output(options?)
 * - clear_params()
 * - query(options?)
 * - config(options?) [static]
 */
export class HTMLTemplate {
  // ========================================
  // Private Fields（V8最適化のためhidden class安定化）
  // ========================================

  private readonly options: Required<HTMLTemplateOptions>;
  private readonly parseStack: ParseNode[];
  private readonly paramMap: Map<string, VarNode | LoopNode>;
  private params: Map<string, ParamValue>;
  private cache?: CacheInstance;

  // ========================================
  // Constructor
  // ========================================

  constructor(options: HTMLTemplateOptions) {
    // 1. オプション正規化とバリデーション
    // 2. ファイル読み込み or 文字列取得
    // 3. キャッシュチェック
    // 4. パース実行
    // 5. paramMapビルド
  }

  // ========================================
  // Factory Methods
  // ========================================

  static new(options: HTMLTemplateOptions): HTMLTemplate;
  static newFile(filename: string, options?: Partial<HTMLTemplateOptions>): HTMLTemplate;
  static newScalarRef(content: string, options?: Partial<HTMLTemplateOptions>): HTMLTemplate;
  static newArrayRef(lines: string[], options?: Partial<HTMLTemplateOptions>): HTMLTemplate;
  static newFilehandle(stream: NodeJS.ReadableStream, options?: Partial<HTMLTemplateOptions>): HTMLTemplate;

  // ========================================
  // Public Methods
  // ========================================

  /**
   * パラメータ取得/設定
   * - param() -> string[] (全パラメータ名)
   * - param(name) -> ParamValue
   * - param(name, value) -> void
   * - param({...}) -> void
   */
  param(...args: ParamSetter): string[] | ParamValue | void;

  /**
   * テンプレート出力
   */
  output(options?: OutputOptions): string | void;

  /**
   * パラメータクリア
   */
  clearParams(): void;

  /**
   * パラメータクエリ
   * - query() -> string[]
   * - query({name: 'VAR'}) -> 'VAR' | 'LOOP' | undefined
   * - query({name: ['LOOP', 'VAR']}) -> 'VAR' | 'LOOP' | undefined
   * - query({loop: 'LOOP'}) -> string[]
   */
  query(options?: { name?: string | string[]; loop?: string | string[] }): string[] | QueryResult;

  /**
   * グローバル設定
   */
  static config(): Partial<HTMLTemplateOptions>;
  static config(options: Partial<HTMLTemplateOptions>): void;

  // ========================================
  // Private Methods（最適化重視）
  // ========================================

  private parse(content: string): ParseNode[];
  private buildParamMap(): void;
  private resolveFile(filename: string): string;
  private applyFilters(content: string): string;
  private normalizeOptions(options: HTMLTemplateOptions): Required<HTMLTemplateOptions>;
}
```

### 2. パーサー (Tokenizer + Parser)

**設計方針**: シングルパス、ゼロコピー、正規表現プリコンパイル

```typescript
/**
 * 超高速トークナイザー
 *
 * 最適化:
 * - 正規表現を事前コンパイル（モジュールスコープ）
 * - exec()のラストインデックス活用でゼロコピー
 * - 文字列スライスを最小化
 */
export class Tokenizer {
  private readonly content: string;
  private pos: number = 0;

  // プリコンパイル正規表現（モジュールスコープで共有）
  private static readonly TAG_REGEX = /<\s*(?:!--\s*)?TMPL_(\w+)\s+([^>]+?)(?:\s*--\s*)?>/gi;

  constructor(content: string) {
    this.content = content;
  }

  /**
   * 次のトークンを取得
   * @returns Token | null
   */
  next(): Token | null;

  /**
   * すべてのトークンを一括取得（最速）
   */
  tokenizeAll(): Token[];
}

/**
 * 高速パーサー
 *
 * 最適化:
 * - スタックベース（再帰なし）
 * - ノードプールで再利用
 * - 条件ジャンプの事前計算
 */
export class Parser {
  private readonly options: Required<HTMLTemplateOptions>;
  private stack: ParseNode[] = [];
  private ifStack: number[] = [];

  /**
   * トークン列をパース
   */
  parse(tokens: Token[]): ParseNode[];

  /**
   * IF/UNLESS/ELSEのジャンプアドレス計算
   */
  private calculateJumps(): void;
}
```

### 3. ランタイム (OutputGenerator)

**設計方針**: 文字列結合最適化、インライン展開、モノモーフィック関数

```typescript
/**
 * 超高速出力生成器
 *
 * 最適化:
 * - 配列joinによる文字列結合（V8最適化）
 * - ノードタイプごとに特化した処理（モノモーフィック）
 * - ループ展開の最適化
 * - エスケープの遅延評価
 */
export class OutputGenerator {
  private readonly parseStack: ParseNode[];
  private readonly params: Map<string, ParamValue>;
  private readonly options: Required<HTMLTemplateOptions>;
  private output: string[] = [];

  /**
   * 出力生成（メイン）
   */
  generate(): string;

  /**
   * ノード処理（型別に分岐）
   */
  private processNode(node: ParseNode): void;

  /**
   * TMPL_VAR処理（インライン化）
   */
  private processVar(node: VarNode): void;

  /**
   * TMPL_LOOP処理（最速ループ）
   */
  private processLoop(node: LoopNode): void;

  /**
   * TMPL_IF/UNLESS処理（ジャンプテーブル）
   */
  private processCond(node: CondNode): void;
}
```

### 4. キャッシュシステム

```typescript
/**
 * 高速メモリキャッシュ（LRU）
 *
 * 最適化:
 * - Map使用（O(1)アクセス）
 * - mtime確認の最小化
 * - キャッシュキーのハッシュ最適化
 */
export class MemoryCache {
  private cache: Map<string, CacheEntry>;
  private readonly maxSize: number;

  get(key: string): ParseNode[] | null;
  set(key: string, value: ParseNode[], mtimes: Map<string, number>): void;
  validate(key: string): boolean;
}

/**
 * 高速ファイルキャッシュ
 */
export class FileCache {
  get(key: string): ParseNode[] | null;
  set(key: string, value: ParseNode[]): void;
}

/**
 * 最速キャッシュキー生成
 *
 * 最適化:
 * - Node.js crypto（ネイティブ実装）
 * - 最小限の文字列結合
 */
export function generateCacheKey(options: Required<HTMLTemplateOptions>): string;
```

---

## パフォーマンス最適化戦略

### 1. パース時最適化

| 最適化項目             | 手法                                  | 効果            |
| ---------------------- | ------------------------------------- | --------------- |
| 正規表現プリコンパイル | モジュールスコープで1回だけコンパイル | パース20%高速化 |
| ゼロコピートークン化   | スライスの代わりにインデックス保持    | メモリ30%削減   |
| シングルパス           | トークン化とパースを同時実行          | パース10%高速化 |
| ノードプール           | 頻繁に使うノードを再利用              | GC負荷50%減     |

### 2. ランタイム最適化

| 最適化項目           | 手法                           | 効果                |
| -------------------- | ------------------------------ | ------------------- |
| 配列join文字列結合   | `+=`の代わりに配列pushしてjoin | 出力30%高速化       |
| モノモーフィック関数 | ノードタイプごとに別関数       | V8最適化で20%高速化 |
| エスケープ遅延評価   | 必要な時だけエスケープ         | 10%高速化           |
| ループ展開           | 小規模ループは展開             | 5-10%高速化         |

### 3. キャッシュ最適化

| 最適化項目      | 手法                              | 効果                      |
| --------------- | --------------------------------- | ------------------------- |
| 高速ハッシュ    | crypto.createHashでネイティブ実装 | キー生成10倍高速          |
| mtime一括確認   | statSyncを最小回数に              | キャッシュ検証50%高速化   |
| Blind Cache     | mtimeチェックスキップ             | キャッシュヒット99%高速化 |
| LRUアルゴリズム | Map+doubly linked list            | O(1)アクセス維持          |

### 4. V8エンジン最適化

| 最適化項目         | 手法                         | 効果                        |
| ------------------ | ---------------------------- | --------------------------- |
| Hidden Class安定化 | オブジェクト構造を一定に保つ | プロパティアクセス30%高速化 |
| Inline Cache活用   | モノモーフィック関数         | 関数呼び出し20%高速化       |
| 小整数最適化       | SMI範囲内の整数使用          | 算術演算2倍高速             |
| 文字列インターン   | 同一文字列の再利用           | メモリ効率50%向上           |

### 5. メモリ最適化

| 最適化項目         | 手法                               | 効果             |
| ------------------ | ---------------------------------- | ---------------- |
| オブジェクトプール | 頻繁に生成するオブジェクトを再利用 | GC負荷70%減      |
| WeakMap活用        | 循環参照の自動GC                   | メモリリーク防止 |
| Buffer再利用       | ファイル読み込みBufferを再利用     | メモリ20%削減    |

---

## 実装フェーズ

### Phase 0: プロジェクトセットアップ ✅

**期間**: Day 1
**内容**:

- package.json作成
- tsconfig.json設定
- ESLint/Prettier設定（harmilia-crosswork準拠）
- VSCode設定
- Vitest設定
- Vite設定（ライブラリモード）
- ディレクトリ構造作成

### Phase 1: 型定義とユーティリティ

**期間**: Day 1-2
**内容**:

- `src/types.ts` - 完全な型定義
- `src/utils/helpers.ts` - 汎用ヘルパー
- `src/utils/FileResolver.ts` - ファイル解決
- `src/utils/encoding.ts` - エンコーディング
- `src/utils/LazyValue.ts` - 遅延評価
- **テスト**: ユニットテスト作成

### Phase 2: 高速パーサー実装

**期間**: Day 2-4
**内容**:

- `src/parser/Tokenizer.ts` - 超高速トークナイザー
  - 正規表現プリコンパイル
  - ゼロコピー実装
  - HTML comment形式対応
- `src/parser/Parser.ts` - 高速パーサー
  - シングルパス実装
  - IF/UNLESS/ELSEのジャンプ計算
  - エラー検出
- `src/parser/types.ts` - パース型定義
- **テスト**: パーサーテスト（02-parse.t移植）

### Phase 3: ランタイムエンジン実装

**期間**: Day 4-7
**内容**:

- `src/runtime/Escape.ts` - エスケープ処理
  - HTML/JS/URL実装
  - 高速テーブルルックアップ
- `src/runtime/Var.ts` - TMPL_VAR
  - DEFAULT属性
  - ESCAPE属性
  - 遅延評価
- `src/runtime/Loop.ts` - TMPL_LOOP
  - ループコンテキスト変数
  - ネストループ
- `src/runtime/Cond.ts` - 条件分岐
  - ジャンプテーブル
- `src/runtime/OutputGenerator.ts` - 出力生成
  - 配列join最適化
  - モノモーフィック処理
- **テスト**: ランタイムテスト

### Phase 4: キャッシュシステム実装

**期間**: Day 7-8
**内容**:

- `src/cache/CacheKey.ts` - キャッシュキー生成
- `src/cache/MemoryCache.ts` - メモリキャッシュ（LRU）
- `src/cache/FileCache.ts` - ファイルキャッシュ
- **テスト**: キャッシュテスト（06-file-cache-dir.t等移植）

### Phase 5: メインクラス統合

**期間**: Day 8-10
**内容**:

- `src/HTMLTemplate.ts` - メインクラス実装
  - コンストラクタ
  - param()メソッド（オーバーロード）
  - output()メソッド
  - query()メソッド
  - clearParams()
  - static config()
  - ファクトリーメソッド
- `src/index.ts` - エクスポート
- **テスト**: 統合テスト

### Phase 6: 互換機能実装

**期間**: Day 10-11
**内容**:

- `src/compat/vanguard.ts` - Vanguard互換
- TMPL_INCLUDE実装
- Associate機能
- Filter機能
- global_vars機能
- **テスト**: 互換性テスト

### Phase 7: 完全テストスイート移植

**期間**: Day 11-15
**内容**:
Perlの30+テストをすべて移植：

1. ✅ `01-bad-args.t` - エラーハンドリング
2. ✅ `01-coderefs.t` - 遅延評価
3. ✅ `02-parse.t` - パース検証
4. ✅ `02-random.t` - ランダムテスト
5. ✅ `03-associate.t` - Associate機能
6. ✅ `03-else_else_bug.t` - ELSEバグ検証
7. ✅ `04-default-escape.t` - デフォルトエスケープ
8. ✅ `04-default_with_escape.t` - DEFAULT+ESCAPE
9. ✅ `04-escape.t` - エスケープ
10. ✅ `04-escape-unicode.t` - Unicodeエスケープ
11. ✅ `04-no_taintmode.t` - Taintモード
12. ✅ `04-type-source.t` - type/source形式
13. ✅ `05-blind-cache.t` - Blindキャッシュ
14. ✅ `05-force_untaint.t` - force_untaint
15. ✅ `05-nested_global.t` - ネストグローバル
16. ✅ `06-file-cache-dir.t` - ファイルキャッシュ
17. ✅ `07-double-file-cache.t` - 二重キャッシュ
18. ✅ `08-cache-debug.t` - キャッシュデバッグ
19. ✅ `09-caching-precluded.t` - キャッシュ不可条件
20. ✅ `10-param.t` - paramメソッド
21. ✅ `11-non-file-templates.t` - 非ファイルテンプレート
22. ✅ `12-open_mode.t` - エンコーディング
23. ✅ `12-query.t` - queryメソッド
24. ✅ `12-utf8.t` - UTF-8
25. ✅ `13-loop-boolean.t` - ループ真偽値
26. ✅ `13-loop-context.t` - ループコンテキスト
27. ✅ `13-loop-repeated.t` - 重複ループ
28. ✅ `14-includes.t` - TMPL_INCLUDE
29. ✅ `15-comment.t` - HTML comment形式
30. ✅ `16-config.t` - config()メソッド
31. ✅ `99-old-test-pl.t` - レガシーテスト

**成功基準**: すべてのテストが100%パス

### Phase 8: ベンチマークと最適化

**期間**: Day 15-17
**内容**:

- ベンチマークスイート作成
- プロファイリング（`node --prof`）
- ボトルネック特定と最適化
- パフォーマンスレグレッションテスト
- **目標**: Perl版以上のパフォーマンス

### Phase 9: ドキュメント作成

**期間**: Day 17-18
**内容**:

- README.md - 基本的な使い方
- docs/api.md - 完全なAPIリファレンス
- docs/compatibility.md - Perl版との違い
- docs/performance.md - パフォーマンスガイド
- JSDoc完全化
- 型定義の説明

### Phase 10: 最終検証

**期間**: Day 18-20
**内容**:

- エッジケーステスト追加
- メモリリークチェック
- 大規模テンプレートテスト
- エラーメッセージ検証
- ビルド最終確認
- npm publish準備

---

## テスト戦略

### 1. ユニットテスト

各モジュールを個別にテスト：

```typescript
// tests/unit/parser/Tokenizer.test.ts
describe('Tokenizer', () => {
  it('should tokenize TMPL_VAR', () => {
    const tokenizer = new Tokenizer('<TMPL_VAR NAME="foo">');
    const tokens = tokenizer.tokenizeAll();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe('VAR');
    expect(tokens[0].name).toBe('foo');
  });

  // ... 100+ tests
});
```

### 2. 統合テスト（Perl移植）

Perlテストを1:1で移植：

```typescript
// tests/integration/02-parse.test.ts
describe('02-parse (Perl test port)', () => {
  it('should reject ESCAPE on TMPL_LOOP', () => {
    const tmpl = `
      <TMPL_LOOP ESCAPE=HTML NAME=EMPLOYEE_INFO>
        Name: <TMPL_VAR NAME=NAME>
      </TMPL_LOOP>
    `;

    expect(() => {
      HTMLTemplate.newScalarRef(tmpl);
    }).toThrow(/ESCAPE option invalid/);
  });

  // ... Perlテストの完全再現
});
```

### 3. パフォーマンステスト

```typescript
// bench/output.bench.ts
import { bench, describe } from 'vitest';

describe('Output generation', () => {
  bench('simple var substitution (1000 iterations)', () => {
    const tmpl = HTMLTemplate.newScalarRef('<TMPL_VAR NAME="foo">');
    for (let i = 0; i < 1000; i++) {
      tmpl.param('foo', 'bar');
      tmpl.output();
      tmpl.clearParams();
    }
  });

  bench('complex loop (100 items x 10 iterations)', () => {
    const tmpl = HTMLTemplate.newScalarRef(`
      <TMPL_LOOP NAME="items">
        <div><TMPL_VAR NAME="name">: <TMPL_VAR NAME="value"></div>
      </TMPL_LOOP>
    `);

    const items = Array.from({ length: 100 }, (_, i) => ({
      name: `Item ${i}`,
      value: `Value ${i}`
    }));

    for (let i = 0; i < 10; i++) {
      tmpl.param('items', items);
      tmpl.output();
      tmpl.clearParams();
    }
  });
});
```

### 4. テストカバレッジ目標

- **行カバレッジ**: 95%以上
- **分岐カバレッジ**: 90%以上
- **関数カバレッジ**: 100%

---

## 互換性マトリクス

### 完全サポート機能 ✅

| 機能              | Perl版 | Node版 | 備考               |
| ----------------- | ------ | ------ | ------------------ |
| TMPL_VAR          | ✅     | ✅     | 完全互換           |
| TMPL_LOOP         | ✅     | ✅     | 完全互換           |
| TMPL_IF           | ✅     | ✅     | 完全互換           |
| TMPL_UNLESS       | ✅     | ✅     | 完全互換           |
| TMPL_ELSE         | ✅     | ✅     | 完全互換           |
| TMPL_INCLUDE      | ✅     | ✅     | 完全互換           |
| ESCAPE=HTML       | ✅     | ✅     | 完全互換           |
| ESCAPE=JS         | ✅     | ✅     | 完全互換           |
| ESCAPE=URL        | ✅     | ✅     | 完全互換           |
| DEFAULT           | ✅     | ✅     | 完全互換           |
| 遅延評価          | ✅     | ✅     | 完全互換           |
| loop_context_vars | ✅     | ✅     | 完全互換           |
| global_vars       | ✅     | ✅     | 完全互換           |
| associate         | ✅     | ✅     | 完全互換           |
| filter            | ✅     | ✅     | 完全互換           |
| cache             | ✅     | ✅     | 完全互換           |
| blind_cache       | ✅     | ✅     | 完全互換           |
| file_cache        | ✅     | ✅     | 完全互換           |
| UTF-8             | ✅     | ✅     | 完全互換           |
| open_mode         | ✅     | ✅     | Node.js encoding名 |
| Vanguard          | ✅     | ✅     | 完全互換           |

### 省略/代替機能 ⚠️

| 機能            | Perl版 | Node版 | 理由                                     |
| --------------- | ------ | ------ | ---------------------------------------- |
| force_untaint   | ✅     | ⚠️     | Node.jsにTaint modeなし（警告のみ）      |
| shared_cache    | ✅     | ❌     | IPC::SharedCache依存（file_cacheで代替） |
| ipc\_\* options | ✅     | ❌     | shared_cache省略のため                   |
| memory_debug    | ✅     | ⚠️     | GTopの代わりにprocess.memoryUsage()      |

### エラーメッセージ互換性

可能な限りPerl版と同じエラーメッセージを使用：

```typescript
// Perl: "HTML::Template->new() called with odd number of option parameters - should be of the form option => value"
// Node: 同じメッセージ

// Perl: "ESCAPE option invalid in TMPL_LOOP tag!"
// Node: 同じメッセージ
```

---

## ベンチマーク目標

### パフォーマンスターゲット

| 操作               | Perl版 | Node版目標    | 備考                           |
| ------------------ | ------ | ------------- | ------------------------------ |
| パース（1KB）      | 1.0x   | **1.2x~1.5x** | 正規表現プリコンパイルで高速化 |
| 出力（1KB）        | 1.0x   | **1.3x~2.0x** | V8の文字列最適化活用           |
| ループ（1000要素） | 1.0x   | **1.1x~1.3x** | 配列join最適化                 |
| キャッシュヒット   | 1.0x   | **2.0x~5.0x** | Map使用で高速化                |
| メモリ使用量       | 1.0x   | **0.8x~1.0x** | 同等またはそれ以下             |

### ベンチマークシナリオ

1. **単純な変数置換** (1000回)
2. **複雑なループ** (100要素 x 10回)
3. **深いネスト** (5階層ループ)
4. **大規模テンプレート** (100KB HTML)
5. **キャッシュ効果** (同一テンプレート1000回)

---

## 開発環境設定

### 必須ツール

```bash
# Node.js 22+
node --version  # v22.20.0

# Yarn 4+
yarn --version  # 4.9.1

# Git
git --version
```

### セットアップ手順

```bash
# 1. 依存関係インストール
yarn install

# 2. 型チェック
yarn type-check

# 3. リント
yarn lint

# 4. テスト
yarn test

# 5. ベンチマーク
yarn bench

# 6. ビルド
yarn build
```

---

## まとめ

この移植計画は以下を保証します：

✅ **完全互換性**: Perl版の全機能を100%再現
✅ **高速化**: Perl版を上回るパフォーマンス
✅ **完全なテスト**: 30+テストスイートすべて移植
✅ **型安全性**: TypeScriptによる堅牢性
✅ **ESM対応**: モダンなNode.js環境

**優先順位**: 互換性 > 速度 > コード複雑性

---

**更新履歴**:

- 2025-10-23: 初版作成
