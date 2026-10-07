# API リファレンス

## compile

```typescript
compile<T>(source: string, options?: CompileOptions): Template<T>
```

トークナイズ・パース・インクルード展開を行い、イミュータブルなテンプレートを返します。

```typescript
compileAsync<T>(source: string, options?: AsyncCompileOptions): Promise<Template<T>>
```

Promise を返すローダー向けの同等品です。インクルードは階層ごとに読み、同一階層内は並列に処理します。

型引数はテンプレートが期待するデータを表します。[型生成](type-generation.md)を参照してください。

## render

```typescript
render<T>(source: string, data: T, options?: CompileOptions & RenderOptions): string
```

コンパイルと描画をまとめて行います。毎回パースし直すので、2 回以上描画するなら `compile` を使ってください。

## CompileOptions

| オプション | 既定値 | 効果 |
| --- | --- | --- |
| `filename` | — | エラー表示と相対インクルード解決に使う名前 |
| `strict` | `true` | 壊れた `TMPL_` タグを文字列ではなくエラーとして扱う |
| `defaultEscape` | `'html'` | `ESCAPE` 属性のないタグに適用するエスケープ。`html` / `url` / `js` / `none`（大文字小文字は不問）で、それ以外は例外 |
| `caseSensitive` | `true` | 名前一致で大文字小文字を区別するか |
| `globalVars` | `false` | ループ内で解決できない名前を外側のスコープへ落とす |
| `includes` | `true` | インクルードの扱い。`false` は `TMPL_INCLUDE` を一切許可しない |
| `filters` | `[]` | パース前にソーステキストへ適用する変換 |
| `legacy.percentVars` | `false` | タグに加えて `%NAME%` も置換する |
| `loader` | — | インクルードされるテンプレートの取得元。既定値はなく、`TMPL_INCLUDE` を含むテンプレートには必須 |

ここにあるものはすべて「テンプレートが何であるか」を決めます。だからコンパイル時に固定されます。ある設定では存在し別の設定では存在しない名前を、描画ごとに決めることはできません。

### IncludeOptions

`true` 以上の指定が必要なとき、`includes` に渡します。インクルード名をどこから探すかはローダーの役割です。ファイルなら `nodeFileLoader` の `paths` と `searchAllPaths` で指定します。

| オプション | 既定値 | 効果 |
| --- | --- | --- |
| `maxDepth` | `10` | 最大ネスト深度。0 以下で無制限 |
| `onMissing` | `'throw'` | 存在しないテンプレートを指すインクルードの扱い |

## Template

コンパイル済みテンプレート。`compile` から得るもので、直接構築はしません。

### render

```typescript
render(data: T, options?: RenderOptions): string
```

### renderTo

```typescript
renderTo(sink: OutputSink, data: T, options?: RenderOptions): void
```

生成した端から書き出します。sink は `write(chunk: string)` を持つものなら何でもよく、`node:stream.Writable` はそのまま該当します。

### renderChunks

```typescript
renderChunks(data: T, options?: RenderOptions): Generator<string>
```

出力を 1 つずつ返します。要求されるまで何も計算しないので、消費側が途中でやめれば処理もそこで止まります。

最後まで消費した場合は `render` より遅くなります。チャンクごとの中断が無料ではないためです。描画全体を速くする手段ではなく、出力を早く流し始めたい場合に使ってください。

### shape

```typescript
readonly shape: TemplateShape
```

テンプレートが宣言している内容です。[TemplateShape](#templateshape) を参照してください。

### filename

```typescript
readonly filename: string | undefined
```

## RenderOptions

| オプション | 既定値 | 効果 |
| --- | --- | --- |
| `strictData` | `false` | テンプレートが宣言していないキーを拒否する |
| `loopContextVars` | `false` | ループ内に `__first__` などを供給する |
| `memoizeLazy` | `true` | 関数値の呼び出しを、現れる場所によらず 1 描画につき 1 回までにする |
| `resolve` | — | データにないトップレベル名のフォールバック |

`resolve` が呼ばれるのはトップレベルだけで、ループの反復内では呼ばれません。行にない名前は「ない」のであって、他所を探しに行くべきものではないからです。

`memoizeLazy` が有効なら、関数値は何度参照されても 1 回しか呼ばれません。トップレベルでも、ループの行でも、`resolve` が返した値でも同じです。`resolve` 自体も名前ごとに 1 回です。無効にすると、どちらも参照のたびに呼ばれます。

## Environment

ローダー・コンパイル既定値・キャッシュをまとめて保持します。

```typescript
new Environment(options?: EnvironmentOptions)
```

`EnvironmentOptions` は `CompileOptions` から `filename` を除いたものに、次を加えたものです。

| オプション | 既定値 | 効果 |
| --- | --- | --- |
| `loader` | — | テンプレートの取得元 |
| `cache` | `false` | コンパイル結果を再利用する。`true` または `CacheOptions` |

| メソッド | 戻り値 |
| --- | --- |
| `compile(source, options?)` | `Template` |
| `compileFile(name, options?)` | `Template` |
| `compileFileAsync(name, options?)` | `Promise<Template>` |
| `render(source, data, options?)` | `string` |
| `renderFile(name, data, options?)` | `string` |
| `renderFileAsync(name, data, options?)` | `Promise<string>` |
| `clearCache()` | `void` |
| `cacheSize` | `number` |

呼び出しごとのオプションは Environment の既定値を上書きします。`loader` も例外ではなく、ファイル系メソッドはテンプレート本体・そのインクルード・キャッシュのすべてに対してこれを使います。`compileFileAsync` と `renderFileAsync` は `AsyncCompileOptions` を取るので、`loader` には Promise を返すものも渡せます。

同期メソッドは、非同期ローダーにテンプレートを要求した最初の時点で「The loader is asynchronous; use compileFileAsync or renderFileAsync」を投げます。

### CacheOptions

| オプション | 既定値 | 効果 |
| --- | --- | --- |
| `maxSize` | `100` | 最も古く使われたものを捨てるまでに保持する件数 |
| `revalidate` | `true` | 再利用前にエントリを取得元と照合する |

エントリのキーは、テンプレートの id と、コンパイル結果を変えるすべての設定です。フィルタを伴うコンパイルはキャッシュされません。フィルタはソースを書き換えるうえ、関数にはキーへ記録できる同一性がないためです。

## ローダー

```typescript
interface TemplateLoader<Sync extends boolean = boolean> {
  readonly sync: Sync;
  resolve(request: ResolveRequest): string | Promise<string>;
  read(id: string): TemplateResource | Promise<TemplateResource>;
  version?(id: string): (string | undefined) | Promise<string | undefined>;
}
```

`sync` は実行時のフラグであると同時に型レベルの判別子です。`sync: true` を宣言したローダーは全メソッドが直接値を返すと約束していることになり、これによって `compile` はそれを受け取り、Promise しか返せないローダーを拒否できます。

`version` は不透明な識別子を返します。キャッシュ済みのコンパイル結果がまだ有効かどうかを、この値の一致だけで判定します。`undefined` を返すことは「このテンプレートは変化しない」という約束です。

### memoryLoader

```typescript
memoryLoader(files: Record<string, string> | ReadonlyMap<string, string>): SyncTemplateLoader
```

オブジェクトまたは `Map` から読みます。そのテンプレートは不変として扱われます。

キーは名前と同じ規則で正規化されるので、`./a.tmpl` や `dir//b.tmpl` はその綴りのまま見つかります。正規化すると同じテンプレートを指す 2 つのキーは例外になります。

### nodeFileLoader

`@libraz/html-template/loaders` から公開しています。メインエントリを import しても `node:fs` を引き込まないようにするためです。

```typescript
nodeFileLoader(options?: NodeFileLoaderOptions): SyncTemplateLoader
```

| オプション | 既定値 | 効果 |
| --- | --- | --- |
| `paths` | `[]` | テンプレートファイルを探すディレクトリ |
| `searchAllPaths` | `false` | 参照元のディレクトリではなく、設定したパスから探す |
| `root` | `HTML_TEMPLATE_ROOT` | 探索パスの前に付けるプレフィックス |
| `cwd` | カレントディレクトリ | 最後の手段として使うディレクトリ |
| `encoding` | `utf-8` | Node の `Buffer` か `TextDecoder` がデコードできるエンコーディング。Node と Perl どちらの表記でも可 |

環境から読むものはローダー構築時に 1 度だけ取り込みます。長時間動くプロセスの途中で解決結果が変わることはありません。

`shiftjis` や `cp932` といった Perl の名前は `shift_jis` に対応づけられます。デコードできないエンコーディング名は、ローダーの作成時に例外になります。`utf16` だけを指定した場合は BOM が必須で、BOM のないテキストには `utf-16le` か `utf-16be` を指定してください。

```typescript
fileVersion(path: string): string | undefined
```

こちらも `@libraz/html-template/loaders` から公開しています。`nodeFileLoader` がファイルに対して報告するバージョン文字列で、更新時刻とサイズから作られます。ファイルを読めなければ `undefined` です。自作ローダーの `version` に使えます。

## TemplateShape

テンプレートが宣言している内容の読み取り専用ビューです。

| メンバー | 戻り値 |
| --- | --- |
| `names` | この階層の参照キー（`caseSensitive` が無効なら小文字化されたもの）。宣言順 |
| `get(name)` | `ParamInfo`、なければ undefined |
| `has(name)` | `boolean` |
| `kind(name)` | `'var'` / `'loop'` / undefined |
| `loop(name)` | ループ本体のシェイプ、なければ undefined |
| `at(path)` | ループ名のパスが指すシェイプ |

`ParamInfo` は、最初に書かれた綴りの名前、正規化キー、種別、その名前が使われたすべての形、`DEFAULT` を伴うタグがあったか、その名前に現れた `ESCAPE` の値、最初の出現位置を持ちます。位置 `loc` には、そのタグを実際に含むテンプレートを示す `file` と、そのファイル自身での行・列が入ります。

シェイプは `globalVars` が有効でも常に実際のネストを表します。この設定が変えるのは描画時の名前解決であって、テンプレートが述べている内容ではありません。

## エラー

`TemplateNotFoundError` は、名前が何にも解決できなかったときにローダーが投げます。`onMissing: 'ignore'` が握り潰すのはこの型だけです。

それ以外はプレーンな `Error` で、テンプレート名と、パーサーが把握していれば行番号を伴います。インクルードされたテンプレート内のタグなら、そのテンプレートの名前と、そのテンプレート自身での行番号です。

## 型生成

`@libraz/html-template/codegen` から公開しています。[型生成](type-generation.md)も参照してください。

```typescript
generateTypes(source: string, options?: CodegenOptions): string
generateModule(entries: TemplateEntry[], options?: CodegenOptions): string
pascalCase(name: string): string
```

`pascalCase` は、コマンドがファイル名から interface 名を作るときに使う関数です。

| `CodegenOptions` | 既定値 | 効果 |
| --- | --- | --- |
| `name` | `TemplateData` | interface 名（`generateTypes` 用） |
| `required` | `false` | すべてのプロパティを必須にする |
| `split` | `false` | ループの行型に個別の interface を与える |
| `importFrom` | `@libraz/html-template` | 値の型を import するモジュール |
| `compile` | — | テンプレートの読み取りに使う `CompileOptions` |

`TemplateEntry` は `{ name, source, filename? }` です。`filename` を渡すと、インクルードをそのファイルからの相対で解決します。interface 名は、split の行 interface も含め、有効な識別子で、生成するモジュール内で一意でなければならず、そうでなければ生成は例外になります。

## version

```typescript
version: string
```

パッケージのバージョンです。`@libraz/html-template` から公開しています。
