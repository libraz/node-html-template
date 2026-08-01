# @libraz/html-template

[![CI](https://img.shields.io/github/actions/workflow/status/libraz/node-html-template/ci.yml?branch=main&label=CI)](https://github.com/libraz/node-html-template/actions)
[![npm](https://img.shields.io/npm/v/@libraz/html-template)](https://www.npmjs.com/package/@libraz/html-template)
[![codecov](https://codecov.io/gh/libraz/node-html-template/branch/main/graph/badge.svg)](https://codecov.io/gh/libraz/node-html-template)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/libraz/node-html-template/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?logo=typescript)](https://www.typescriptlang.org/)

Perl HTML::Template のテンプレート構文を、TypeScript の API で。

既存の `.tmpl` はそのまま描画できます。一方 API は Perl のものの移植ではありません。テンプレートは一度コンパイルして何度でも描画でき、1 回の描画が触る状態はすべてその描画専用で、テンプレートが宣言するパラメータから TypeScript の interface を生成できます。

## インストール

```bash
npm install @libraz/html-template
```

Node 22 以降。ランタイム依存はありません。

## 使い始める

```typescript
import { compile } from '@libraz/html-template';

const template = compile(`
  <h1><TMPL_VAR NAME="title"></h1>
  <TMPL_LOOP NAME="items">
    <p><TMPL_VAR NAME="name">: <TMPL_VAR NAME="value"></p>
  </TMPL_LOOP>
`);

const html = template.render({
  title: 'Hello World',
  items: [
    { name: 'Item 1', value: 'Value 1' },
    { name: 'Item 2', value: 'Value 2' }
  ]
});
```

コストが高いのはコンパイル側なので、コンパイル済みテンプレートは保持して何度でも描画してください。イミュータブルなので、並行処理で共有しても安全です。

1 回きりなら `render(source, data)` が両方をまとめて行います。

## ファイルからの読み込み

コアはローダー越しにしかテンプレートへ到達しません。これがファイルシステム依存を持たない理由です。Node 用のローダーは専用のサブパスにあります。

```typescript
import { Environment } from '@libraz/html-template';
import { nodeFileLoader } from '@libraz/html-template/loaders';

const env = new Environment({
  loader: nodeFileLoader({ paths: ['./views'] }),
  cache: true
});

const html = env.renderFile('page.tmpl', { title: 'Hello' });
```

Environment はローダー・コンパイル設定・キャッシュをまとめて持ちます。同じ設定を二度書く必要がなく、プロセス全体で共有されるグローバル状態もありません。

## テンプレート構文

```html
<TMPL_VAR NAME="title">
<TMPL_VAR NAME="raw" ESCAPE="none">
<TMPL_VAR NAME="missing" DEFAULT="fallback">

<TMPL_IF NAME="logged_in">welcome<TMPL_ELSE>please sign in</TMPL_IF>
<TMPL_UNLESS NAME="empty">there is something here</TMPL_UNLESS>

<TMPL_LOOP NAME="rows"><TMPL_VAR NAME="cell"></TMPL_LOOP>

<TMPL_INCLUDE NAME="header.tmpl">
<TMPL_COMMENT>never rendered</TMPL_COMMENT>
```

すべてのタグには HTML コメント形式 `<!-- TMPL_VAR NAME="x" -->` もあります。テンプレート単体で正しい HTML であり続ける必要がある場合に使います。

全機能は[構文リファレンス](docs/ja/template-syntax.md)を参照してください。

## エスケープ

変数は既定で HTML エスケープされます。タグ単位で外すなら `ESCAPE="none"`、既定そのものを変えるならコンパイル時の `defaultEscape` です。

```typescript
compile('<TMPL_VAR NAME="x">').render({ x: '<b>' }); // '&lt;b&gt;'
compile('<TMPL_VAR NAME="x">', { defaultEscape: 'none' }).render({ x: '<b>' }); // '<b>'
```

ここは Perl と意図的に異なる唯一の点です。Perl は指示がない限り何もエスケープしません。すでに `ESCAPE="html"` を書いているテンプレートはそのまま動きます。生の出力に依存していたテンプレートには `defaultEscape: 'none'` が必要です。

## 型生成

テンプレートは「どの名前を、どういう役割で使うか」を宣言しています。これだけで、受け取るデータの形を記述できます。

```bash
npx html-template-codegen views/ -o src/templates.d.ts
```

```typescript
export interface PageData {
  title?: ScalarSource;
  items?: RowSource<{
    name?: ScalarSource;
  }>;
}
```

生成された interface を `compile` に渡せば、データ側の綴り間違いが型エラーになります。

```typescript
const template = compile<PageData>(source);
```

CI では `--check` を付けると、生成物がテンプレートから遅れていることを検出できます。

## ストリーミング

`renderTo(sink, data)` は生成した端から書き出し、`renderChunks(data)` は 1 つずつ返します。

```typescript
template.renderTo(response, data);

for (const chunk of template.renderChunks(data)) {
  // ...
}
```

## ドキュメント

- [はじめに](docs/ja/getting-started.md)
- [テンプレート構文](docs/ja/template-syntax.md)
- [API リファレンス](docs/ja/api.md)
- [型生成](docs/ja/type-generation.md)
- [Perl HTML::Template からの移行](docs/ja/from-perl.md)

## ライセンス

MIT
