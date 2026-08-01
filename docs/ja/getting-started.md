# はじめに

## インストール

```bash
npm install @libraz/html-template
```

Node 22 以降。ESM 専用で、ランタイム依存はありません。

## 一度コンパイルし、何度も描画する

```typescript
import { compile } from '@libraz/html-template';

const template = compile('<h1><TMPL_VAR NAME="title"></h1>');

template.render({ title: 'First' });
template.render({ title: 'Second' });
```

コンパイルはトークナイズ・パース・インクルード展開を行います。描画はその結果を辿るだけです。コストが高いのは前者なので、2 回以上使うテンプレートは一度コンパイルして保持してください。

コンパイル済みテンプレートはイミュータブルです。描画ごとに専用の状態を作るので、同じテンプレートを並行処理で共有でき、描画が例外で終わっても次の描画には何も残りません。

1 回しか描画しないなら `render(source, data)` がコンパイルと描画をまとめて行います。

## データを渡す

データはプレーンなオブジェクトです。キーがテンプレート中の名前に対応します。

```typescript
compile('<TMPL_VAR NAME="name">').render({ name: 'World' });
```

未設定の名前はエラーにならず空文字列になります。テンプレートを段階的に埋められるのはこのためです。宣言のないキーをエラーにしたい場合は、描画時に `strictData: true` を指定します。

```typescript
template.render({ nmae: 'typo' }, { strictData: true }); // 例外
```

同じ間違いは、実行前に型で捕まえることもできます。[型生成](type-generation.md)を参照してください。

## 計算を遅らせる

関数は、テンプレートが実際にその位置に到達したときだけ、しかも 1 回の描画につき最大 1 回だけ呼ばれます。

```typescript
compile('<TMPL_IF NAME="show"><TMPL_VAR NAME="report"></TMPL_IF>').render({
  show: false,
  report: () => buildExpensiveReport() // 呼ばれない
});
```

ループでも同様で、行の配列を返す関数はループに到達した時点で解決されます。

関数は値を直接返す必要があります。描画は同期処理なので、非同期に取得するものは `render` を呼ぶ前に解決してください。

## ファイルから読む

コンパイラはローダー経由でテンプレートに到達します。Node 用のものはディスクから読みます。

```typescript
import { Environment } from '@libraz/html-template';
import { nodeFileLoader } from '@libraz/html-template/loaders';

const env = new Environment({
  loader: nodeFileLoader({ paths: ['./views'] })
});

const html = env.renderFile('page.tmpl', { title: 'Hello' });
```

ローダーがなくても `compile` はテンプレート文字列を扱えます。必要になるのは、その中に `TMPL_INCLUDE` がある場合だけです。

## コンパイル結果をキャッシュする

Environment はコンパイル結果を保持できます。

```typescript
const env = new Environment({
  loader: nodeFileLoader({ paths: ['./views'] }),
  cache: true
});
```

エントリを再利用する前に、Environment はそのテンプレートが変わっていないかをローダーに問い合わせます。テンプレート自身だけでなく、インクルードしたものも含めて確認します。バージョンを返さないローダーは「テンプレートは変化しない」と宣言していることになり、その場合は確認なしで再利用されます。

キャッシュは既定で無効です。開発中に編集より長生きするキャッシュは、驚きの方が大きいためです。

## 次に読むもの

- [テンプレート構文](template-syntax.md) — 全タグと属性
- [API リファレンス](api.md) — 公開 API の全体
- [型生成](type-generation.md) — テンプレートから interface を作る
- [Perl HTML::Template からの移行](from-perl.md) — 何がどう変わったか
