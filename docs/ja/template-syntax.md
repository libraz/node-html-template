# テンプレート構文

構文は Perl HTML::Template 2.98 のものをそのまま採用しています。Perl モジュール向けに書かれたテンプレートはここでもパースでき、同じ出力になります。意図的な例外は[エスケープ](#エスケープ)の 1 点だけです。

## タグの書き方

すべてのタグは 2 通りに書けます。

```html
<TMPL_VAR NAME="title">
<!-- TMPL_VAR NAME="title" -->
```

コメント形式は、テンプレート単体でも正しい HTML であり続けるためのものです。描画前にエディタやブラウザで開くときに効いてきます。2 つの形式の意味は完全に同じで、混在させても構いません。

タグ名と属性名は大文字小文字を区別しません。`<TMPL_VAR>`、`<tmpl_var>`、`<Tmpl_Var>` はすべて同じタグです。

## TMPL_VAR

値を書き出します。

```html
<TMPL_VAR NAME="title">
<TMPL_VAR title>
<TMPL_VAR NAME='title'>
```

`NAME=` は省略でき、値はどちらの引用符でも囲めますし、囲まなくても構いません。

未設定の名前は何も出力しません。

### DEFAULT

```html
<TMPL_VAR NAME="title" DEFAULT="Untitled">
```

名前が未設定のときに使われます。空文字列は「値がある」扱いなので、`''` を設定した名前は空のまま描画され、既定値には落ちません。

既定値は書かれたとおりに出力され、エスケープされることはありません。

### ESCAPE

```html
<TMPL_VAR NAME="body" ESCAPE="html">
<TMPL_VAR NAME="query" ESCAPE="url">
<TMPL_VAR NAME="text" ESCAPE="js">
<TMPL_VAR NAME="raw" ESCAPE="none">
```

| 値 | 効果 |
| --- | --- |
| `html` / `1` | `& " ' < >` を実体参照に |
| `url` | パーセントエンコード |
| `js` | `\ ' "`・改行・U+2028/U+2029 をバックスラッシュエスケープ |
| `none` / `0` | そのまま出力 |

これ以外の値はパースエラーになります。

## TMPL_IF と TMPL_UNLESS

```html
<TMPL_IF NAME="logged_in">
  welcome
<TMPL_ELSE>
  please sign in
</TMPL_IF>

<TMPL_UNLESS NAME="empty">there is something here</TMPL_UNLESS>
```

`TMPL_ELSE` は両方で使えます。閉じタグは `</TMPL_IF>` でも `</TMPL_UNLESS>` でも構いません。

真偽判定は JavaScript ではなく Perl に従います。テンプレートがそちらを前提に書かれているためです。

| 値 | 判定 |
| --- | --- |
| `undefined` / `null` / `false` | 偽 |
| `0` / `''` / `'0'` | 偽 |
| `[]` | 偽 |
| それ以外 | 真 |

文字列 `'0'` が偽になる点が、最も引っかかりやすい違いです。

## TMPL_LOOP

```html
<TMPL_LOOP NAME="rows">
  <TMPL_VAR NAME="cell">
</TMPL_LOOP>
```

値は 1 反復につき 1 個のオブジェクトからなる配列か、それを返す関数です。空のループと未設定のループは何も出力しません。

### スコープ

ループ本体から見えるのは、その行のキーだけです。外側の名前は `globalVars` を有効にしない限り見えません。

```typescript
compile(source, { globalVars: true });
```

有効にすると、行で解決できなかった名前が外側のスコープへ順に落ちていきます。同じ名前を持つ行は外側を隠します。

### ループコンテキスト変数

描画時に `loopContextVars: true` を指定すると、各反復に次の名前が加わります。

| 名前 | 値 |
| --- | --- |
| `__first__` | 最初の反復で `1`、それ以外は `0` |
| `__last__` | 最後の反復で `1`、それ以外は `''` |
| `__inner__` | 最初でも最後でもないとき `1`、それ以外は `0` |
| `__outer__` | 最初と最後の反復で `1`、それ以外は `0` |
| `__odd__` | 奇数番目で `1`、それ以外は `''` |
| `__even__` | 偶数番目で `1`、それ以外は `''` |
| `__counter__` | 1 から始まる反復番号 |
| `__index__` | 0 から始まる反復番号 |

偽の値が `0` だったり `''` だったりするのは Perl の挙動そのままです。テンプレートがこれらを直接出力すると差が見えてしまうため、正確に再現しています。

反復ごとにコストがかかるので、既定では無効です。

## TMPL_INCLUDE

```html
<TMPL_INCLUDE NAME="header.tmpl">
<TMPL_INCLUDE header.tmpl>
```

指定されたテンプレートは、パースより前にタグの位置へ差し込まれます。したがってインクルード側にはどんなタグでも書けます。テンプレートがそういう作りなら、ループの片側だけでも構いません。

名前は、それを参照したテンプレートからの相対で解決されます。複数箇所から参照されるテンプレートの読み込みは 1 回だけです。

インクルードの扱いはコンパイル時に設定します。

```typescript
compile(source, {
  loader: nodeFileLoader({ paths: ['./views'] }),
  includes: {
    maxDepth: 10,          // 0 以下で無制限
    onMissing: 'throw',    // または 'ignore'
    searchAllPaths: false  // 参照元ではなく設定したパスから探す
  }
});
```

`includes: false` は、テンプレート中の `TMPL_INCLUDE` を一切許可しません。

`onMissing: 'ignore'` は、存在しないテンプレートを指すインクルードを取り除きます。循環と深さ超過は握り潰しません。どちらもテンプレートが壊れていることに変わりないためです。

## TMPL_COMMENT

```html
<TMPL_COMMENT>編集者向けのメモ</TMPL_COMMENT>
<TMPL_NOTE>同じもの</TMPL_NOTE>
```

ブロックとその中身は、パースより前に丸ごと取り除かれます。したがって対応の取れていないタグを含め、何を書いても構いません。

## パーセント変数

古いテンプレートには、タグの代わりに `%NAME%` を使うものがあります。`%` は本来ただの文字なので、既定では無効です。

```typescript
compile('Hello %name%!', { legacy: { percentVars: true } });
```

有効にすると `%NAME%` は `<TMPL_VAR NAME="NAME">` と同じに扱われ、同じテンプレート内でタグと混在できます。

## 名前の一致

名前は既定で大文字小文字を区別します。

```typescript
compile('<TMPL_VAR NAME="userName">').render({ username: 'x' }); // 空
```

Perl は区別しません。`caseSensitive: false` で同じ挙動になります。

```typescript
compile('<TMPL_VAR NAME="userName">', { caseSensitive: false }).render({ USERNAME: 'x' });
```

## エスケープ

Perl と異なり、`ESCAPE` 属性のない変数は HTML エスケープされます。既定値はコンパイル時の設定です。

```typescript
compile(source, { defaultEscape: 'none' });
```

タグに書かれた `ESCAPE` は常に既定より優先されます。`ESCAPE="none"` も同じで、既定が何であれ個別に外せます。

## 壊れたテンプレート

未知の `TMPL_` タグ、閉じられていないブロック、対応する開始タグのない閉じタグはエラーです。`strict: false` は未知のタグをただの文字列に格下げします。テンプレートについて説明するテンプレートを書くときに、たまに必要になります。
