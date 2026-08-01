# Perl HTML::Template からの移行

持ち越す価値がある資産はテンプレート構文であって、その周りの API ではありません。テンプレートはそのまま移せますが、描画するコードは移せません。

構文は Perl HTML::Template 2.98 の実出力をケース単位で記録したものと照合しています。あちらである動きをするテンプレートは、ここでも同じ動きをします。

## API

Perl はオブジェクトを作り、変更し、出力を求めます。

```perl
my $tmpl = HTML::Template->new(filename => 'page.tmpl');
$tmpl->param(title => 'Hello');
$tmpl->param(items => \@items);
print $tmpl->output;
```

ここでは、一度コンパイルしたテンプレートをデータとともに描画します。

```typescript
const template = compile(source);
const html = template.render({ title: 'Hello', items });
```

この違いは見た目だけの話ではありません。Perl の形ではパース結果とデータが同じオブジェクトに束ねられるので、1 つのテンプレートで 2 つのリクエストを捌くには、再コンパイルするか、間で状態を消すかしかありません。両者を分ければ、コンパイル済みテンプレートはイミュータブルになり、データは呼び出しごとになります。サーバが本当に必要としているのはこちらです。

`param()`、`output()`、`query()`、`clear()`、および各種コンストラクタヘルパに対応物はありません。それらが担っていたことは `render`・`renderTo`・`template.shape` が引き受けます。

## 変更した既定値

3 つの既定値を意図的に変えています。いずれもコンパイル時または描画時の設定なので、Perl の挙動はオプション 1 つで戻せます。

| 設定 | Perl | ここ | 戻す方法 |
| --- | --- | --- | --- |
| エスケープ | なし | HTML | `defaultEscape: 'none'` |
| 名前一致 | 大小同一視 | 大小区別 | `caseSensitive: false` |
| 宣言外のデータ | 致命的 | 無視 | 描画時に `strictData: true` |

**エスケープ**は出力そのものが変わる唯一の項目です。すでに `ESCAPE="html"` を書いているテンプレートは影響を受けません。明示された属性が常に優先されるためです。生の出力に依存していたテンプレートには `defaultEscape: 'none'` が必要ですが、付ける前に一度読み直す価値があります。

**名前一致**は厳しくなりました。`userName` と書かれたテンプレートは `username` を見つけません。移行中は `caseSensitive: false` を付けておき、名前が揃った時点で外してください。

**宣言外のデータ**は既定では例外になりません。テンプレートが使う以上に広いオブジェクトを渡すのは TypeScript では普通のことですし、本当のタイプミスは生成した型が実行前に捕まえるからです。

## オプションの対応

| Perl | ここ |
| --- | --- |
| `filename` | `Environment#compileFile(name)` |
| `scalarref` / `arrayref` / `filehandle` / `type` + `source` | `compile(source)` |
| `path` | `IncludeOptions.paths`、またはローダーの `paths` |
| `search_path_on_include` | `IncludeOptions.searchAllPaths` |
| `max_includes` | `IncludeOptions.maxDepth` |
| `die_on_missing_include` | `IncludeOptions.onMissing` |
| `no_includes` | `includes: false` |
| `die_on_bad_params` | 描画時の `strictData` |
| `case_sensitive` | `caseSensitive` |
| `global_vars` | `globalVars` |
| `loop_context_vars` | 描画時の `loopContextVars` |
| `default_escape` | `defaultEscape` |
| `vanguard_compatibility_mode` | `legacy.percentVars` |
| `filter` | `filters` |
| `cache` / `blind_cache` | `Environment` の `cache` |
| `file_cache` / `double_file_cache` | — |
| `associate` | 描画時の `resolve` |
| `print_to` | `renderTo(sink, data)` |
| `utf8` / `open_mode` | `nodeFileLoader` の `encoding` |
| `HTML::Template->config` | `Environment` |
| `force_untaint` / `debug` / `stack_debug` / `shared_cache` など | — |

Perl が受け付けていたもののこのパッケージが実装していなかったオプションは、コードだけでなく型からも削除しました。黙って何もしないオプションは、存在しないオプションより悪いためです。

**ファイルキャッシュ**は引き継いでいません。パース結果をディスクへ直列化して得があるのは、1 リクエストごとにプロセスが起動して終了する形の場合で、Node のサーバはそう動きません。残るケースは `Environment` のメモリキャッシュで足ります。

**`associate`** は CGI.pm のオブジェクトから値を引くためのものでした。置き換えはただのフックなので、ライブラリは特定の外部モジュールを知らずに済みます。

```typescript
template.render(data, { resolve: (name) => request.query[name] });
```

## 変わっていないもの

- すべてのタグ・属性と、両方のタグ形式
- Perl の真偽判定。`'0'` が偽であることを含む
- `DEFAULT` がエスケープされないこと
- ループのスコープ規則と、`global_vars` がそれに与える影響
- ループコンテキスト変数が出力する文字列そのもの
- `legacy.percentVars` 下での `%NAME%` 置換
- インクルードの解決順序と、共有インクルードを 1 回しか読まないこと

## 移行の手順

1. `defaultEscape: 'none'` と `caseSensitive: false` でコンパイルし、まずは旧出力と素直に比較できる状態にする
2. 実データで Perl の出力と差分を取る
3. 型を生成して `compile` に渡す。テンプレートが実際に期待している名前がすべて表に出る
4. 名前が揃ったら `caseSensitive: false` を外す
5. 最後に `defaultEscape: 'none'` を外し、本当にマークアップを出力しているタグへ `ESCAPE="none"` を付ける。ここは時間をかける価値がある工程
