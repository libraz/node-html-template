# 型生成

テンプレート自身は型情報を持ちません。しかし「どの名前を、どういう役割で使うか」は宣言しています。それだけあれば、受け取るデータの形は記述できますし、キーの綴り間違いをコンパイルエラーにできます。

## コマンド

```bash
npx html-template-codegen views/ -o src/templates.d.ts
```

パスにはテンプレートファイルでもディレクトリでも指定できます。テンプレート 1 つにつき 1 つの interface が、ファイル名から命名されて出力されます。

```typescript
// Generated from template files. Do not edit.
import type { RowSource, ScalarSource } from '@libraz/html-template';

export interface PageData {
  title?: ScalarSource;
  logged_in?: unknown;
  items?: RowSource<{
    'item-name'?: ScalarSource;
    tags?: RowSource<{
      tag?: ScalarSource;
    }>;
  }>;
}
```

### オプション

| オプション | 効果 |
| --- | --- |
| `-o, --out <file>` | 標準出力ではなくファイルへ書く |
| `--check` | 書き込まず、`--out` が無いか古ければ exit 1 |
| `--required` | すべてのプロパティを必須にする |
| `--split` | ループの行型に個別の interface を与える |
| `--ext <list>` | ディレクトリ探索で拾う拡張子（既定 `.tmpl,.html`） |
| `--suffix <s>` | interface 名に付ける接尾辞（既定 `Data`） |
| `--import <mod>` | 値の型を import するモジュール |

## 使い方

```typescript
import { compile } from '@libraz/html-template';
import type { PageData } from './templates.js';

const template = compile<PageData>(source);

template.render({ titel: 'oops' }); // コンパイル時に弾かれる
```

## 何がどう生成されるか

**すべて optional です。** 呼び出し側が設定しなかった変数はエラーにならず空文字列になるので、optional こそがテンプレートの実際の約束です。それでも必須にしたいプロジェクトのために `--required` があります。

**条件にしか使われない名前は `unknown` になります。** 出力されることはなく真偽判定にしか使われないので、どんな値でも正当です。ここを狭めると正しい呼び出しまで弾いてしまいます。

**ループは `RowSource<Row>` になります。** 行の配列とそれを返す関数の両方を受け付ける、ランタイムと同じ形です。

**行型はインラインに展開されます。** `--split` を付けると個別の interface になります。浅いテンプレートではインラインが読みやすく、2 段を超えると読みにくくなります。

**ループコンテキスト変数は含めません。** `__first__` などはループが供給するもので、呼び出し側が渡すものではありません。

**値の型は `ScalarSource` です。** テンプレートは、ある名前が数値なのか日付なのかを何も語りません。これより狭い型は捏造になります。

**識別子にならない名前は引用符で囲みます。** テンプレートの名前には `-` `.` `/` が普通に含まれますが、いずれも TypeScript ではそのまま書けません。

## 最新に保つ

生成物はコミットし、CI で照合します。

```bash
html-template-codegen views/ -o src/templates.d.ts --check
```

ファイルが無いか、テンプレートと一致しなくなっていれば exit 1 になります。生成物が嘘をつかないようにする方法はこれだけです。

## コードから使う

生成器はコマンドなしでも使え、ファイルには一切触れません。

```typescript
import { generateModule } from '@libraz/html-template/codegen';

const source = generateModule([{ name: 'PageData', source: templateText }]);
```

`generateTypes(source, options)` はモジュールヘッダなしで 1 テンプレート分の宣言だけを返します。バンドラプラグインやテストから使う想定です。
