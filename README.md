# f1-api-ws

このプロジェクトは、F1データのWebSocketミラーとして動作するバックエンドです。主な機能は、F1のデータソースWebSocketに接続し、受信した情報を内部変数に保存し、それらのデータを独自のWebSocketに接続したクライアントへ再送信することです。

## 概要

- **入力:** サードパーティのWebSocket（例：公式または非公式のF1フィード）からのデータ。
- **処理:** 受信したデータは、`deepMerge`（ディープマージ）ロジックを使って内部変数に保存・更新されます。これにより、データ構造の関連部分のみを更新し、以前の状態を完全に上書きせずに済みます。
- **出力:** 更新されたデータは、このバックエンドのWebSocketに接続したリスナー／クライアントに提供されます。

---

## 情報はどのように保存されるか？

F1のWebSocketからメッセージを受信するたびに、情報状態を保持する変数が完全に置き換えられるのではなく、**ディープマージ**（deep merge）が行われます。これにより、以下が可能になります：

- 変更されていない既存の値を保持できる
- 新しいメッセージで変更されたオブジェクトの部分のみを更新できる
- イベント／メッセージが増分的な場合でも、部分的な情報損失を防げる

### `deepMerge`の例

例えば、次のような状態が保存されているとします：

```js
let estado = {
  carData: {
    car1: { speed: 320, rpm: 12000 },
    car2: { speed: 315, rpm: 11800 }
  },
  weather: { temp: 28 }
};
```

そして、車1の更新情報だけを含む新しいメッセージを受信した場合：

```js
let incoming = {
  carData: {
    car1: { speed: 325 }
  }
};
```

`deepMerge(estado, incoming)`を使うと、結果は次のようになります：

```js
{
  carData: {
    car1: { speed: 325, rpm: 12000 },
    car2: { speed: 315, rpm: 11800 }
  },
  weather: { temp: 28 }
}
```

このように、受信メッセージに含まれていない情報（例：`car1`の`rpm`）は保持されます。

---

## `deepMerge`関数

`deepMerge`関数は、効率的な情報保存の要です。目的は、オブジェクトを再帰的に結合し、上書きされていない値を保持することです。

### 基本的な実装例

```js
function deepMerge(target, source) {
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
```

この関数により、ネストされたオブジェクトも正しく更新され、情報の損失を防ぐことができます。

---
