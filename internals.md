# Internals

## Tree Order

list-positions' core concept is a special kind of tree. Here is an example:

![Example tree](./images/tree.png)

In general, the tree alternates between two kinds of layers:

- **Bunch layers** in which each node is labeled by a _bunchID_ - a string that is unique among the whole tree. (Blue nodes in the image.)
- **Offset layers** in which each node is labeled by a nonnegative integer _offset_. (Orange nodes in the image.)

The tree's root is a bunch node with bunchID `"ROOT"` (`BunchIDs.ROOT`).

The tree's nodes are totally ordered using a depth-first search: visit the root, then traverse each of its child nodes recursively. A node's children are traversed in the order:

- For bunch layers, visit the children in order by bunchID (lexicographically).
- For offset layers, visit the children in order by offset.

Each Order instance stores a tree of the above form. The tree's bunch nodes correspond to the bunches described in the readme. A bunch's BunchMeta `{ bunchID, parentID, offset }` says: I am a grandchild of the bunch node `parentID`, a child of its child `offset`.

The Position `{ bunchID, innerIndex }` indicates the offset node that is a child of `bunchID` and has offset `2 * innerIndex + 1`. Note that its offset is _not_ `innerIndex` (for reasons explained [later](#details)), but we still get an infinite sequence of Positions for each bunch. The sort order on Positions is just their order in the tree.

![Positions in the above example tree](./images/positions.png)

Now you can see why a Position depends on the BunchMeta of its bunch and all ancestors: you need these to know where the Position is in the tree. Once two Orders agree on some Positions' BunchMeta, they'll agree on the relative order of those Positions.

### Min and Max Positions

As a special case, the offset layer below the root always has exactly two nodes:

- Offset 1, which is `MIN_POSITION` (innerIndex 0) and the ancestor of all other nodes.
- Offset 3, which is `MAX_POSITION` (innerIndex 1).

This ensures that all other Positions are strictly between the min and max.

## Representing the Tree

We could choose to represent the tree literally, with one object per node and a pointer to its parent. But this would use a lot of memory and storage.

Instead, Order only stores an object per bunch node, of type [BunchNode](./README.md#interface-bunchnode); offset nodes are implied. Each BunchNode stores a pointer to the bunch node's "parent bunch node" (actually its grandparent), its offset (which tells you the actual parent node), and pointers to its "children bunch nodes" in tree order (actually its grandchildren). This info is sufficient to compare Positions and traverse the tree.

List, Text, Outline, and AbsList likewise avoid storing an object per Position/value. Instead, they store a map (BunchNode -> sparse array), where the sparse array represents the sub-map (innerIndex -> value) corresponding to that bunch. The sparse arrays come from the [sparse-array-rled](https://github.com/mweidner037/sparse-array-rled#readme) package, which uses run-length encoded deletions, both in memory and in saved states.

## AbsPositions

> For code implementing this section, see [AbsPositions' source code](./src/abs_position.ts).

An AbsPosition encodes a Position together with all of its dependent metadata: the offsets and bunchIDs on its path to root. (The position's `innerIndex` is stored separately.)

We could store this path as two arrays, `bunchIDs: string[]` and `offsets: number[]`. For compactness, we instead use a few encoding tricks:

- Since the last bunchID is always `"ROOT"` and the last offset is always 1, we omit those.
- Instead of storing `bunchIDs: string[]` directly, we attempt to parse each bunchID into the default form `` `${replicaID}_${counter.toString(36)}` ``. (If a bunchID is not of this form, we treat it as `replicaID = bunchID`, `counter = -1`). Then we store the parts as:
  - `replicaIDs`: All replicaIDs that occur, each only once (deduplicated).
  - `replicaIndices`: Indices into `replicaIDs`, in order up the tree.
  - `counterIncs`: Counters-plus-1 (so that they are all uints), in order up the tree.

The actual format is:

```ts
type AbsPosition = {
  bunchMeta: AbsBunchMeta;
  innerIndex: number;
};

type AbsBunchMeta = {
  /**
   * Deduplicated replicaIDs, indexed into by replicaIndices.
   */
  replicaIDs: readonly string[];
  /**
   * Non-negative integers.
   */
  replicaIndices: readonly number[];
  /**
   * Non-negative integers. Same length as replicaIndices.
   */
  counterIncs: readonly number[];
  /**
   * Non-negative integers. One shorter than replicaIndices, unless both are empty.
   */
  offsets: readonly number[];
};
```

## Lexicographic strings

> For code implementing this section, see [lexicographicString's source code](./src/lexicographic_string.ts).

We can address any node in the tree by the sequence of node labels on the path from the root to that node:

```ts
[bunchID0 = "ROOT", offset0, bunchID1, offset1, bunchID2, offset2, ...]
```

For positions besides the min and max, we always have `bunchID0 = "ROOT"` and `offset0 = 1`, so we can skip those. The rest we can combine into a string:

```ts
`${bunchID1},${offset1}.${bunchID2},${offset2}.${bunchID3},${...}`
```

It turns out that the lexicographic order on these strings _almost_ matches the tree order. Thus with a few corrections, we obtain the `lexicographicString` function, which inputs an AbsPosition and outputs an equivalently-ordered string.

As special cases, we encode `MIN_POSITION` as `""` and `MAX_POSITION` as `"~"`. These are less/greater than all other lexicographic strings.

The corrections are:

1. We can't encode offsets directly as strings, because the lexicographic order on numeric strings doesn't match the numeric order: `2 < 11` but `"2" > "11"`. Instead, we use the [lex-sequence](https://github.com/mweidner037/lex-sequence/#readme) package to convert offsets to strings that have the correct lexicographic order, while still growing slowly for large numbers (the encoding of `n` has `O(log(n))` chars).
2. Consider the case when one bunchID is a prefix of another, e.g., `"abc"` vs `"abcde"`. If these bunches are siblings, the tree will sort them prefix-first: `"abc" < "abcde"`.

   In the lexicographic strings, the bunchIDs may be followed by other chars, starting with a `','` delimiter: `abc,rest_of_string` vs `abcde,rest_of_string`. So the lexicographic order is really comparing `"abc,"` to `"abcde,"`. If `'d'` were replaced by a character less than `','`, we would get the wrong answer here.

   To fix this, we escape bunchID chars `<= ','`, prefixing them with a `'-'`. (We then also need to escape `'-'`.)

3. To ensure that all strings are less than the max position's `"~"`, we also escape the first char in a bunchID if it is `>= '~'`, prefixing it with `'}'`. (We then also need to escape `}`.)

## Creating Positions

You don't need to understand this section for the Applications below, but it's here for curiosity.

`Order.createPositions`, and its wrappers like `List.insertAt`, return Positions with the following guarantees:

1. They are unique among all Positions returned by this Order and its replicas. This holds even if a replica on a different device concurrently creates Positions at the same place.
2. Non-interleaving: If two replicas concurrently insert a (forward or backward) sequence of Positions at the same place, their sequences will not be interleaved.
3. The returned Positions will re-use an existing bunch if possible, to reduce metadata overhead. (You can override this behavior by supplying `options.bunchID`.)

To do this, we map Order's tree to a double-sided [Fugue list CRDT](https://arxiv.org/abs/2305.00583) tree, use a variant of Fugue's insert logic to create new nodes, then map those nodes back to Order's tree. Since Fugue is non-interleaving, so is list-positions. (Except in rare situations where Fugue interleaves backward insertions, documented in the linked paper.)

### Details

The conversion from list-position's tree to a Fugue tree is:

- Each Position becomes a Fugue node.
- A Position with nonzero innerIndex is a right child of the Position with one lower innerIndex. So each bunch's Positions form a rightward chain.
- For a bunch's first Position `pos = { bunchID, innerIndex: 0 }`, let the bunch's BunchMeta be `{ bunchID, parentID, offset }`.
  - If `offset` is even, then `pos` is a _left_ child of `{ bunchID: parentID, innerIndex: offset / 2 }`.
  - If `offset` is odd, then `pos` is a _right_ child of `{ bunchID: parentID, innerIndex: (offset - 1) / 2 }`.

![Fugue subtree corresponding to a bunch's Positions](./images/fugue_tree.png)

Observe that the relation `offset = 2 * innerIndex + 1` lets each Position have both left and right children. Furthermore, there is a distinction between `innerIndex`'s right children and `(innerIndex + 1)`'s left children; that is necessary to prevent some backward interleaving.

Pedantic notes:

- list-positions makes different choices than the Fugue paper when inserting around tombstones. See the comments in [Order.createPositions' source code](./src/order.ts).
- The converted tree uses a slightly different sort order on same-side siblings than the Fugue paper: same-side siblings are in order by `bunchID + ","`, except that a right-side child created by the same Order as its parent is always last (because it increments `innerIndex` instead of creating a new right-child bunch). This does not affect non-interleaving because Fugue treats the same-side sibling sort order as arbitrary.

## Applications

Here are some advanced things you can do once you understand list-positions' internals. To request more info, or to ask about your own ideas, feel free to open an [issue](https://github.com/mweidner037/list-positions/issues).

1. Manipulate BunchMetas to make a custom tree. For example, to insert some initial text identically for all users - without explicitly loading the same state - you can start each session by creating "the same" bunch and setting the text there. Order.createPositions' `bunchID` option can help here:

   ```ts
   const INITIAL_TEXT = "Type something here.";
   const text = new Text();
   // Creates a new bunch with bunchID "INIT" that is a child of MIN_POSITION,
   // with identical BunchMeta every time.
   const [initStartPos] = text.order.createPositions(
     MIN_POSITION,
     MAX_POSITION,
     INITIAL_TEXT.length,
     { bunchID: "INIT" }
   );
   text.set(initStartPos, INITIAL_TEXT);
   // Now use text normally...
   ```

2. Rewrite list-positions in another language, with compatible Positions and LexPositions.
<!-- 3. Rewrite just AbsPositions in another language, so that you can at least manipulate AbsPositions. This is much easier than rewriting the whole library, and sufficient for basic backend tasks like programmatically inserting text. TODO: needs AbsPositions createPositions, compare. -->
3. Supply a custom `newBunchID: (parent: BunchNode, offset: number) => string` function to Order's constructor that incorporates a hash of `parent.bunchID`, `offset`, and the local replicaID. That way, a malicious user cannot reuse the same (valid) bunchID for two different bunches.
4. Write your own analog of our List class - e.g., to use a more efficient data representation, or to add new low-level features. You can use Order's BunchNodes to access the tree structure - this is needed for traversals, computing a Position's current index, etc.
5. Store a List's state in a database table that can be queried in order. For efficiency, you can probably store one _item_ per row, instead of just one value - see `List.items()`. Note that you'll have to "split" an item when Positions are inserted between its values. To allow in-order queries, each item could store a reference to its neighboring items in the list order (forming a doubly-linked list), or the [lexicographic string](TODO) of its first entry.
