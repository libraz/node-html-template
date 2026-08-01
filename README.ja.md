# @libraz/html-template

[![npm version](https://img.shields.io/npm/v/@libraz/html-template.svg)](https://www.npmjs.com/package/@libraz/html-template)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

Perl の **HTML::Template v2.98** のコア API とテンプレート構文に互換性を持つ TypeScript/ESM 移植版。

高速で強力、柔軟性の高いテンプレートエンジン。レガシー Perl アプリケーションを現代的な JavaScript/TypeScript に移行する際、テンプレートの互換性を維持しながら移行できます。

[English](./README.md) | 日本語

## 特徴

- ✅ **Perl 互換** - Perl HTML::Template v2.98 のコア API と構文に互換
- ✅ **型安全** - 完全な TypeScript 定義
- ✅ **ESM ファースト** - モダンな ES Module サポート
- ✅ **高速** - 高度に最適化されたパーサーと実行エンジン
- ✅ **依存ゼロ** - 外部ランタイム依存なし
- ✅ **充実したテスト** - 240+ テストで全機能をカバー
- ✅ **セキュア** - HTML/URL/JS エスケープによる XSS 対策

## インストール

```bash
npm install @libraz/html-template
```

```bash
yarn add @libraz/html-template
```

## クイックスタート

```typescript
import { HTMLTemplate } from '@libraz/html-template';

// 文字列からテンプレート作成
const tmpl = new HTMLTemplate({
  scalarref: `
    <h1><TMPL_VAR NAME="title"></h1>
    <TMPL_LOOP NAME="items">
      <p><TMPL_VAR NAME="name">: <TMPL_VAR NAME="value"></p>
    </TMPL_LOOP>
  `
});

// パラメータ設定
tmpl.param('title', 'こんにちは');
tmpl.param('items', [
  { name: 'アイテム1', value: '値1' },
  { name: 'アイテム2', value: '値2' }
]);

// 出力生成
console.log(tmpl.output());
```

## 主な機能

### 変数

```typescript
const tmpl = new HTMLTemplate({
  scalarref: 'こんにちは <TMPL_VAR NAME="name">!'
});
tmpl.param('name', '世界');
console.log(tmpl.output()); // こんにちは 世界!
```

### ループ

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_LOOP NAME="users">
      <p><TMPL_VAR NAME="username"></p>
    </TMPL_LOOP>
  `
});

tmpl.param('users', [
  { username: 'Alice' },
  { username: 'Bob' },
  { username: 'Charlie' }
]);
```

### 条件分岐

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_IF NAME="show_message">
      <p><TMPL_VAR NAME="message"></p>
    <TMPL_ELSE>
      <p>メッセージがありません</p>
    </TMPL_IF>
  `
});

tmpl.param({ show_message: true, message: 'こんにちは!' });
```

### エスケープ（XSS 対策）

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <div><TMPL_VAR NAME="content" ESCAPE="HTML"></div>
    <a href="?q=<TMPL_VAR NAME="query" ESCAPE="URL">">リンク</a>
    <script>var data = "<TMPL_VAR NAME="data" ESCAPE="JS">";</script>
  `
});

tmpl.param({
  content: '<script>alert("XSS")</script>',  // エスケープされる
  query: 'こんにちは 世界',                    // URL エンコード
  data: 'Some "quoted" text'                  // JS エスケープ
});
```

`ESCAPE` に指定できる値は `HTML` / `URL` / `JS` / `NONE` と、`HTML` の短縮形 `1`、
`NONE` の短縮形 `0` です。それ以外の値は Perl と同じくパースエラーになります。

`DEFAULT` の値はエスケープされずそのまま出力されます。Perl の `HTML::Template::DEF`
がデフォルト値を差し込む際にエスケープ処理を飛ばすためです。

### デフォルトエスケープ

```typescript
const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="html">',
  default_escape: 'html'  // 全変数をデフォルトで HTML エスケープ
});
```

`default_escape` が効くのは `ESCAPE` 属性を持たないタグだけです。`ESCAPE=NONE`
（または `ESCAPE=0`）を書いたタグはデフォルトの対象から外れます。

### テンプレートコメント

```typescript
// TMPL_COMMENT / TMPL_NOTE ブロックは出力から除去されます
const tmpl = new HTMLTemplate({
  scalarref: `
    表示される内容
    <TMPL_COMMENT>これは出力に含まれません</TMPL_COMMENT>
    表示される内容
  `
});
```

### ファイルインクルード

```typescript
// template.html
<TMPL_INCLUDE NAME="header.html">
<TMPL_VAR NAME="content">
<TMPL_INCLUDE NAME="footer.html">
```

```typescript
const tmpl = new HTMLTemplate({
  filename: 'template.html',
  path: ['./templates']  // 検索パス
});
```

### テンプレートクエリ

```typescript
const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="foo"> <TMPL_LOOP NAME="items"><TMPL_VAR NAME="x"></TMPL_LOOP>'
});

// トップレベルのパラメータ名を取得
console.log(tmpl.query());  // ['foo', 'items']

// パラメータタイプをチェック
console.log(tmpl.query({ name: 'foo' }));     // 'VAR'
console.log(tmpl.query({ name: 'items' }));   // 'LOOP'

// ループ内のパラメータを取得
console.log(tmpl.query({ loop: 'items' }));   // ['x']
```

## 高度な機能

### 遅延評価（Lazy Values）

変数やループが実際に使われるまで計算を遅延：

```typescript
const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="expensive">',
  die_on_bad_params: false
});

// 変数がレンダリングされた時のみ関数が呼ばれる
tmpl.param('expensive', () => computeExpensiveValue());
```

### Associate オブジェクト

`param()` メソッドを持つ外部オブジェクトからパラメータを取得（CGI.pm 互換）：

```typescript
const cgi = {
  param: (name: string) => {
    if (name === 'user') return 'alice';
    return undefined;
  }
};

const tmpl = new HTMLTemplate({
  scalarref: '<TMPL_VAR NAME="user">',
  associate: cgi,
  die_on_bad_params: false
});
```

### コンテンツフィルター

パース前にテンプレート内容を変換：

```typescript
const tmpl = new HTMLTemplate({
  scalarref: 'hello <TMPL_VAR NAME="name">',
  filter: {
    sub: (content) => (content as string).toUpperCase(),
    format: 'scalar'
  }
});
```

### Vanguard 互換モード

レガシーな `%VAR%` 構文のサポート：

```typescript
const tmpl = new HTMLTemplate({
  scalarref: 'こんにちは %name%!',
  vanguard_compatibility_mode: true
});
tmpl.param('name', '世界');
console.log(tmpl.output());  // こんにちは 世界!
```

### キャッシュサポート

```typescript
const tmpl = new HTMLTemplate({
  filename: 'template.html',
  cache: true  // インメモリキャッシュ有効化
});
```

### ループコンテキスト変数

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_LOOP NAME="items">
      アイテム <TMPL_VAR NAME="__counter__">
      <TMPL_IF NAME="__first__">最初!</TMPL_IF>
      <TMPL_IF NAME="__last__">最後!</TMPL_IF>
      <TMPL_IF NAME="__odd__">奇数行</TMPL_IF>
    </TMPL_LOOP>
  `,
  loop_context_vars: true
});
```

利用可能なコンテキスト変数: `__first__`, `__last__`, `__inner__`, `__outer__`, `__odd__`, `__even__`, `__counter__`（1始まり）, `__index__`（0始まり）

### グローバル変数

```typescript
const tmpl = new HTMLTemplate({
  scalarref: `
    <TMPL_VAR NAME="site_name">
    <TMPL_LOOP NAME="items">
      <TMPL_VAR NAME="site_name"> - <TMPL_VAR NAME="item">
    </TMPL_LOOP>
  `,
  global_vars: true  // ループ内で親スコープの変数にアクセス
});
```

## パフォーマンス

ベンチマーク実行：

```bash
yarn bench
```

サンプル結果：
- 単純な変数置換: ~50,000 ops/sec
- 100 アイテムのループ: ~5,000 ops/sec
- 複雑なテンプレートパース: ~10,000 ops/sec

## 互換性

- **Node.js**: >= 22.0.0
- **Perl HTML::Template**: v2.98 互換（Taint mode や IPC::SharedCache など Perl 固有機能を除く）

挙動は、共通のケース集合を Perl HTML::Template 2.98 の実出力と突き合わせるテストで固定しています。
Perl が使える環境では `yarn goldens:record` で記録を更新できます。記録はリポジトリにコミットされているため、
CI 側に Perl は不要です。

テンプレートを移植する際に押さえておきたい点：

- **パラメータのスコープ。** `TMPL_LOOP` の本体はそれぞれ独立した名前空間です。`die_on_bad_params`、
  引数なしの `param()`、`query()` はいずれもトップレベルの名前空間を対象にするため、ループ内にしか
  現れない名前へは、そのループ経由でアクセスします。`global_vars` を有効にすると、ループ内の変数が
  トップレベルにのみ公開されます。
- **ループデータも検証対象。** `die_on_bad_params` が有効なとき、ループ本体が宣言していないキーが
  反復データに含まれているとエラーになります。これがループデータのタイポ検出になります。
- **`query({ name })` は完全一致。** パスを最後まで指定してください（`['loop', 'var']`）。名前だけを
  渡してネストしたループを探索することはありません。
- **`TMPL_COMMENT` / `TMPL_NOTE` は独自拡張。** Perl 2.98 はこのタグを構文エラーとして扱いますが、
  本ライブラリはブロックごと削除します。メインテンプレートとインクルード先の双方に適用されます。

## Perl からの移行

このライブラリはドロップイン互換として設計されています：

```perl
# Perl
use HTML::Template;
my $template = HTML::Template->new(filename => 'template.tmpl');
$template->param(name => 'World');
print $template->output();
```

```typescript
// TypeScript/JavaScript
import { HTMLTemplate } from '@libraz/html-template';
const template = new HTMLTemplate({ filename: 'template.tmpl' });
template.param('name', 'World');
console.log(template.output());
```

## テスト

```bash
yarn test             # 全テスト実行
yarn test:watch       # ウォッチモード
yarn test:coverage    # カバレッジレポート生成
```

## 開発

```bash
yarn dev             # 開発用ウォッチモード
yarn build           # プロダクションビルド
yarn lint            # Biome lint 実行
yarn format          # Biome フォーマット
yarn type-check      # TypeScript 型チェック
```

## ライセンス

MIT

## クレジット

本プロジェクトは Sam Tregar による Perl の [HTML::Template](https://metacpan.org/pod/HTML::Template) モジュールの完全な TypeScript 移植版です。元の設計と API のすべてのクレジットは Perl コミュニティに帰属します。

## リンク

- [npm パッケージ](https://www.npmjs.com/package/@libraz/html-template)
- [GitHub リポジトリ](https://github.com/libraz/node-perl-html-template)
- [オリジナル Perl HTML::Template](https://metacpan.org/pod/HTML::Template)
