# LiaisonScape ユーザーガイド

LiaisonScapeは、E2R Datasetに含まれるEntity同士のつながりを確認し、軽く編集するrelationship explorerです。

## Datasetを開く

1. `ファイルを選択`からE2R JSONを選びます。
2. ValidatorでCore構造を検証します。
3. 有効なDatasetであれば、Entityをノード、Entity間のRelationをエッジとして表示します。

Eventを端点に持つRelationは、Entity-first MVPのグラフには表示されません。データ自体は削除されず、エクスポート時にも保持されます。

Metadata Extensionに`title`や`datasetId`がある場合、LiaisonScapeはDataset情報として表示します。値がない場合もDatasetは有効であり、LiaisonScapeが読み込みだけでIDを生成することはありません。

## グラフを見る

- ノードをクリックまたはタップすると、グラフ上のモーダルにEntity Detailが開きます。
- エッジの線をクリックまたはタップすると、そのエッジが選択されて曲率ハンドルが現れます。
- エッジラベルをクリックまたはタップすると、グラフ上のモーダルにRelation Detailが開きます。名前のないRelationは線を選択して`Edit Relation`を使います。
- Detailモーダルは`Close`ボタン、外側の暗い領域、Escapeキーのいずれかで閉じられます。
- エッジを選択し、紫色の曲率ハンドルをドラッグすると経路を一時的に調整できます。自己Relationではドラッグ方向で輪が回転し、ドラッグ距離で輪の大きさが変わります。
- 手動調整したエッジはノードを動かしても手動経路を維持します。`Use automatic route`を選ぶと、そのエッジを自動経路へ戻せます。
- エッジラベルは上下左右へ自由にドラッグできます。`Use automatic label position`を選ぶと、衝突回避を使った自動位置へ戻せます。
- ノードやエッジへマウスを重ねると、利用できる補足情報を確認できます。
- Relationの矢印はCoreの`sourceId`から`targetId`への構造方向です。因果、所有、時間順などの意味を自動的に表すものではありません。

グラフは、ノードやエッジの重なりを減らすよう自動的に配置・経路計算されます。この自動表示だけではDatasetは変更されません。

## 移動とズーム

- 余白またはエッジをドラッグするとグラフをパンできます。
- マウスホイール、`Zoom in`、`Zoom out`で拡大縮小できます。
- スマートフォンでは1本指でパンし、2本指でピンチズームできます。
- `Reset view`は現在のノード全体が収まる表示へ戻し、選択と手動ラベル位置を解除します。

## ノードを移動する

ノードをドラッグすると位置を変更できます。移動直後の座標は一時状態です。

`Save node coordinates`を押すと、移動したEntity座標が未登録のE2R Coordinate相互運用プロトタイプへ書き込まれます。LiaisonScapeはDatasetレベルに論理的な旧`linkscape-graph` Spaceを定義し、EntityへComponent IDで指定した`x`と`y`を書き込みます。旧Linkscapeの`extensions.coordinate.positions`がある場合、明示保存時に`linkscape`位置だけを移行し、それ以外の旧データは保持します。Datasetに未対応のCoordinate版、互換性のない、または重複した`linkscape-graph`定義、LiaisonScapeが安全に維持できないSpecification宣言がある場合は、座標を一時状態のまま残し、保存しなかったことを表示します。互換性のある追加Componentと未知フィールドは、`x`と`y`を更新しても保持します。エッジ曲率とラベル位置は含まれません。Datasetを開く、パンする、ズームする、明示保存せずにエクスポートするだけでは、座標の生成や移行は行われません。

## Entityを編集する

1. ノードを選択します。
2. Entity Detailで`Name`または`Description`を編集します。
3. `Save Entity`を押します。

名前と説明はグラフ上のラベルへ反映されます。空欄で保存すると、その任意フィールドは削除されます。ID、未知フィールド、未知Extensionは保持されます。

## Entity / Relationを作成する

`Add Entity`で新しいEntityの名前と説明を入力し、`Save Entity`または
`Cancel`を選びます。名前は空欄でも作成できます。

`Add Relation`では既存EntityからSourceとTargetを選びます。作成できるのは
EntityからEntityへのRelationです。self Relationと同じ端点間のparallel
Relationは許可されます。作成後は新しいオブジェクトが選択されます。

作成直後の配置は一時表示であり、Coordinateは自動保存されません。

## Relationを編集する

1. エッジを選択します。
2. Relation Detailで`Name`または`Description`を編集します。
3. `Save Relation`を押します。

Relationの`Name`は水平なエッジラベルとして表示されます。これは人が読むCoreラベルであり、Relationの意味的な型ではありません。

## ラベルを移動する

- Entityの名前と説明は一つのラベルとして自由にドラッグできます。
- Entityラベルをアイコン内または近くへ置くと補助線が消えます。
- Relationラベルはドラッグするとエッジ上の最寄り位置へ移動します。

手動ラベル位置は現在のLiaisonScape表示だけに属し、Datasetへは保存されません。`Reset view`または再インポートで解除されます。

## エクスポートする

`Export E2R JSON`を押すと、現在のDatasetをValidatorで再確認してダウンロードします。

保存済みのEntity／Relation編集と座標は出力されます。ズーム、パン、選択、手動エッジ曲率、手動ラベル位置、表示レイヤー順は出力されません。未知フィールドと未知Extensionは可能な限りそのまま保持されます。

## 現在のMVP制限

- EventノードとEvent編集は未対応です。
- Entity / Entity-to-Entity Relationの作成と削除に対応しています。Entityは
  参照Relationが0件の場合だけ削除できます。cascade削除は行いません。
  Relationの接続先変更、Eventの削除・作成、Undo/Redoは未対応です。
- 意味的なRelation型、矢印表示方式、永続レイヤー順は未対応です。
- 手動エッジ曲率とラベル位置はDatasetへ保存されません。
- Coordinate payloadはauthority-qualifiedな`0.1.0`実験であり、登録済みStable Extensionではありません。Layoutの標準化も今後の検討事項です。
