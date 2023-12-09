# list-positions

Efficient "positions" for lists and text - enabling rich documents and collaboration

- [About](#about)
- [Usage](#usage)
- [API](#api)
- [Performance](#performance)

## About

Many apps use a list whose values can change index over time: characters in a text document, items in a todo list, rows in a spreadsheet, etc. Instead of thinking of this list as an array, it's easier to think of it as an ordered map `(position -> value)`, where a value's _position_ doesn't change over time. So if you insert a new entry `(position, value)` into the map, the other entries stay the same, even though their indices change:

```
Before:

Index    | 0       1       2
Position | pos123  posLMN  posXYZ
Value    | 'C'     'a'     't'

After calling list.set(posABC, 'h') where pos123 < posABC < posLMN:

Index    | 0       1       2       3
Position | pos123  posABC  posLMN  posXYZ
Value    | 'C'     'h'     'a'     't'
```

This library provides positions (types `Position`/`LexPosition`) and corresponding list-as-ordered-map data structures (classes `List`/`LexList`/`Outline`). Multiple lists can use the same positions (with the same sort order), including lists on different devices - enabling DIY collaborative lists & text editing.

### Example Use Cases

1. In a **text document with annotations** (comments/highlights), store the text as a List of characters, and indicate each annotation's range using a `start` and `end` Position. That way, when the user inserts text in front of an annotation, the annotation stays "in the same place", without needing to update start/end indexes.
2. In a **todo-list app built on top of a database**, store each todo-item's LexPosition as part of its database entry, and `ORDER BY` that column to query the items in order. That lets you insert a new todo-item in the middle of the list (by assigning it a position in that spot) or move a todo-item around (by changing its position). It works even for a collaborative todo-list built on top of a cloud database.
3. In a **text editor with suggested changes** (from collaborators, AI, or local drafts), store each suggestion as a collection of `(position, char)` pairs to insert or delete. When the user accepts a suggestion, apply those changes to the main List.
4. To make a **collaborative text editor**, you just need a way to collaborate on the map `(position -> char)`. This is easy to DIY, and more flexible than using an Operational Transformation or CRDT library. For example:
   - When a user types `char` at `index`, call `[position] = list.insertAt(index, char)` to insert the char into their local List at a (new) Position `position`. Then broadcast `(position, char)` to all collaborators. Recipients call `list.set(position, char)` on their own Lists.
   - Or, store the map in a cloud database. You can do this efficiently by understanding the [structure of Positions](TODO).
   - Or, send each `(position, char)` pair to a central server. The server can choose to accept, reject, or modify the change before forwarding it to other users - e.g., enforcing per-paragraph permissions. It can also choose to store the map in a database table, instead of loading each active document into memory.

### Features

**Performance** Our list data structures have a small memory footprint, fast edits, and small saved states. <!-- See our [performance measurements](TODO) for a 260k op text-editing trace. -->

**Collaboration** Lists can share the same positions even across devices. Even in the face of concurrent edits, Positions are always globally unique, and you can insert a new position anywhere in a list. To make this possible, the library essentially implements a list CRDT ([Fugue](TODO)), but with a more flexible API.

**Non-interleaving** In collaborative scenarios, if two users concurrently insert a (forward or backward) sequence at the same place, their sequences will not be interleaved. For example, in a collaborative text editor, if Alice types "Hello" while Bob types "World" at the same place, then the resulting order will be "HelloWorld" or "WorldHello", not "HWeolrllod".

**Flexible usage** There are multiple inter-compatible ways to work with our positions and lists. For example, you can ask for a [lexicographically-sortable version of a position](TODO: lex) to use indendently of this library, or [store list values in your own data structure](TODO: outline) instead of our default List class.

### Related Work

- [Fractional indexing](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/#fractional-indexing),
  a related but less general idea.
- [Blog post](https://mattweidner.com/2022/10/21/basic-list-crdt.html) describing the Fugue list CRDT and how it relates to the "list position" abstraction. This library implements optimized versions of that post's tree implementation (List/Position) and string implementation (LexList/LexPosition).
- [Paper](https://arxiv.org/abs/2305.00583) with more details about Fugue - in particular, its non-interleaving guarantees.

## Usage

### LexList and LexPosition

An easy way to get started with the library is using the `LexList<T>` class. It is a list-as-ordered map with value type `T` and positions (keys) of type `LexPosition`.

Example code:

```ts
TODO;
```

Internally, LexPositions are just strings. LexPositions have the nice property that **their lexicographic order matches the list order**. So you can `ORDER BY` LexPositions in a database table, or store them in a different [ordered](https://www.npmjs.com/package/functional-red-black-tree) [map](https://docs.oracle.com/javase/8/docs/api/java/util/TreeMap.html) [data](https://en.cppreference.com/w/cpp/container/map) [structure](https://doc.rust-lang.org/std/collections/struct.BTreeMap.html).

The downside of using LexPositions is metadata overhead - they have variable length and can become long in certain scenarios<!-- (TODO in our benchmarks)-->. Also, if you store all of the literal pairs `(lexPosition, value)`, then you have per-value metadata overhead. Nonetheless, LexPositions are a convenient option for short lists of perhaps <1,000 values - e.g., the items in a todo list, or the scenarios where [Figma uses fractional indexing](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/#syncing-trees-of-objects).

> Using LexList is more efficient than storing all of the literal pairs `(lexPosition, value)` - in fact, it is as memory-efficient as the next section's List class. Likewise, LexList's saved states (type [LexListSavedState](TODO)) are more compact than the naive representation, though they are larger than the equivalent List/Order saved states. <!-- GZIP mostly closes the gap (TODO: data). -->

See also: [LexUtils](TODO)

### List, Position, and Order

The library's main class is `List<T>`. It is a list-as-ordered-map with value type `T` and positions (keys) of type `Position`.

Example code:

```ts
TODO;
```

Unlike LexPositions, Positions aren't directly comparable. Instead, their sort order depends on some extra metadata, described in [Managing Metadata](TODO) below. The upside is that Positions have nearly constant size, so they are more efficient to share and store than LexPositions (which embed all of their dependent metadata).

Positions are JSON objects with the following format:

```ts
type Position = {
  bunchID: string;
  innerIndex: number;
};
```

<a id="bunches"></a>
The `bunchID` identifies a _bunch_ of Positions that were share metadata (for efficiency). Each bunch has Positions with `innerIndex` 0, 1, 2, ...; these were originally inserted contiguously (e.g., by a user typing left-to-right) but might not be contiguous anymore. Regardless, bunches makes it easy to store a List's map `(Position -> value)` compactly:

<a id="compact-list"></a>

```ts
// As a double map:
{
  [bunchID: string]: {
    [innerIndex: number]: T;
  };
};

// As a sparse array for each bunch's Positions:
{
  [bunchID: string]: (T | null)[];
};

// Using our internal sparse array format:
type ListSavedState<T> = {
  // The sparse array alternates between "runs" of present and deleted
  // values. Each even index is an array of present values; each odd
  // index is a count of deleted values.
  // E.g. [["a", "b"], 3, ["c"]] means ["a", "b", null, null, null, "c"].
  [bunchID: string]: (T[] | number)[];
};
```

Notes:

- A Position's `innerIndex` is unrelated to its current list index. Indeed, Positions are immutable, but their list index can change over time.
- Do not create a never-seen-before Position from a bunchID and innerIndex unless you know what you're doing. Instead, use a method like `List.insertAt`, `List.insert`, or `Order.createPositions` to obtain new Positions. (Reconstructing previously-created Positions is fine, e.g., deserializing a Position received from a collaborator.)
- A similar bunch-to-sparse-array representation is also possible with LexPositions: instead of keying each bunch by its bunchID, use its "bunchPrefix", which can be combined with an innerIndex to yield a LexPosition. See [LexUtils](TODO).

#### Managing Metadata

Each Position depends on some metadata, which is stored separately. (In contrast, a LexPosition embeds all of its metadata - this is why LexPositions have a variable length.) To use the same Positions with different instances of the List class (possibly on different devices), you must first transfer this metadata between the Lists.

Specifically, a List's [bunches](#bunches) form a tree. Each bunch, except for the special root with bunchID `"ROOT"`, has a `BunchMeta` that describes its location in the tree:

```ts
type BunchMeta = {
  /** The bunch's ID, same as its Positions' bunchID. */
  bunchID: string;
  /** The parent bunch's ID. */
  parentID: string;
  /** A nonnegative integer used by the tree. */
  offset: number;
};
```

A List's tree of bunches is stored by a separate class `Order`, accessible from the List's `order` property. Multiple List instances can share the same Order via a constructor option. But when Lists have different Order instances, before using a Position from one List in the other (e.g., calling `list.set` or `list.indexOfPosition`), you must call `list.order.receive` with:

- The Position's bunch's BunchMeta.
- That bunch's parent's BunchMeta.
- The parent's parent's BunchMeta, etc., up the tree until reaching the root (exclusive).

Here are some scenarios, in order of difficulty.

**Single List** If you only ever use Positions with the List instance that created them (via `list.insert`, `list.insertAt`, or `list.order.createPositions`), you don't need to manage metadata at all.

**Single session, multiple Lists** Suppose you have multiple Lists in the same session (JavaScript runtime). E.g., a rich-text document might be represented as a List of characters and a List of formatting info. Then it suffices for those Lists to share an Order instance: `const list2 = new List(list1.order)`.

<a id="save-load"></a>
**Single user, multiple sessions** Consider a single-user app that saves and loads a List to disk. Then you must also save and load the List's Order:

```ts
function save<T>(list: List<T>): string {
  // Save the List's state *and* its Order's state (an array of BunchMetas).
  return JSON.stringify({
    orderSave: list.order.save(),
    listSave: list.save(),
  });
}

function load<T>(savedState: string): List<T> {
  const list = new List<T>();
  const { orderSave, listSave } = JSON.parse(savedState);
  // Load the Order's state first, to receive the saved BunchMetas.
  list.order.load(orderSave);
  list.load(listSave);
}
```

<a id="createdBunch"></a>
**Multiple users** The most complicated scenarios involve multiple users and a single list order, e.g., a collaborative text editor. Any time a user creates a new Position by calling `list.insertAt`, `list.insert`, or `list.order.createPositions`, they might create a new bunch. The new bunch will be returned; you must distribute its BunchMeta before/together with the new Position. For example:

```ts
// When a user types "x" at index 7:
const [position, createdBunch] = list.insertAt(7, "x");
if (createdBunch !== null) {
  // Distribute the new bunch's BunchMeta.
  broadcast(JSON.stringify({ type: "meta", meta: createdBunch.meta() }));
} // Else position reused an old bunch - no new metadata.
// Now you can distribute position:
broadcast(JSON.stringify({ type: "set", position, value: "x" }));

// Alt: Use an Order.onCreatedBunch callback.
// list.order.onCreatedBunch = (createdBunch) => { /* Broadcast createdBunch.meta()... */ }

// When a user receives a message:
function onMessage(message: string) {
  const parsed = JSON.parse(message);
  switch (parsed.type) {
    case "meta":
      list.order.receive([parsed.meta]);
      break;
    case "set":
      list.set(parsed.position, parsed.value);
      break;
    // ...
  }
}
```

If you ever want to extract all of a Position's dependencies for sending to another device, you can use `list.order.lex(position)` to convert it to a LexPosition (and `unlex` on the other side). Or, you can directly obtain the dependent BunchMetas using `list.order.getNodeFor(position).ancestors().map(node => node.meta())`.

> Errors you might get if you mis-manage metadata:
>
> - TODO

### Outline

An `Outline` is like a List but without values. Instead, you tell the Outline which Positions are currently present (set), then use it to convert between Positions and their current indices.

Outline is useful when you are already storing a list's values in a different sequence data structure: a traditional array, a rich-text editor's internal state, a server-side search library, etc. Then you don't need to waste memory & storage space storing the values again in a List, but you might still need to:

- Look up the current index of a cursor or annotation that uses Positions.
- Add a `(position, value)` pair to the list that was received from a remote collaborator:
  ```ts
  outline.set(position);
  const index = outline.indexOfPosition(position);
  /* Splice value into the other list at index; */
  ```
- Convert the other sequence's changes into `(position, value)` pair updates:

  ```ts
  // When the other sequence inserts `value` at `index`:
  const position = outline.insertAt(index);
  /* Broadcast/store the newly-set pair (position, value); */
  ```

Like List, Outline requires you to [manage metadata](#managing-metadata).

### Advanced

The library's internals are conceptually simple. By understanding them, you can unlock additional features and optimizations, or implement compatible libraries in other languages. See [Internals](./internals.md).

## API

This section gives a high-level overview of the library's exports. The implementations have complete docs, which should show up in your IDE's tooltips.

### Classes

#### `List<T>`

A list of values of type `T`, represented as an ordered map with [Position](#position) keys.

List's API is a hybrid between `Array<T>` and `Map<Position, T>`. Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.

#### `Order`

A total order on [Positions](#position), independent of any specific assignment of values.

An Order manages metadata (bunches) for any number of Lists, LexLists, and Outlines. You can also use an Order to create Positions independent of a List (`createPositions`), convert between Positions and LexPositions (`lex` and `unlex`), and directly view the tree of bunches (`getBunch`, `getBunchFor`).

Static utilities include `Order.MIN_POSITION` and `Order.MAX_POSITION`.

#### `Outline`

An outline for a list of values. It represents an ordered map with [Position](#type-position) keys, but unlike [List](#class-listt), it only tracks which Positions are present - not their associated values.

Outline is useful when you are already storing a list's values in a different sequence data structure, but you still need to convert between Positions and list indices.

#### `LexList<T>`

A list of values of type `T`, represented as an ordered map with [LexPosition](#type-lexposition) keys.

LexList's API is a hybrid between `Array<T>` and `Map<LexPosition, T>`. Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.

### Types

All types are JSON serializable.

Representations of positions:

- `Position`, used in List and Outline.
- `LexPosition = string`, used in LexList.

Metadata:

- `BunchMeta`, used in Order.

Saved states: Each class lets you save and load its internal states in JSON format. You can treat these saved states as opaque blobs, or read their docs to understand their formats.

- `ListSavedState<T>`
- `OrderSavedState`
- `OutlineSavedState`
- `LexListSavedState<T>`

### Utilities

#### Cursors

A _cursor_ points to a spot in the list between two values - e.g., a cursor in a text document.

Internally, a cursor is represented as the Position (or LexPosition, for LexList) of the value to its left, or `Order.MIN_POSITION` if it is at the start of the list. If that position becomes not-present in the list, the cursor's literal value remains the same, but its current index shifts to the left.

Convert indices to cursors and back using methods `cursorAt` and `indexOfCursor`, on classes List, Outline, and LexList. (These are wrappers around `positionAt` and `indexOfPosition` that get the edge cases right.)

#### `LexUtils`

Utilities for manipulating [LexPositions](#lexlist-and-lexposition).

For example, `LexUtils.splitPos` and `LexUtils.combinePos` let you split a LexPosition into its `innerIndex` and a _bunch prefix_ - a string that embeds all of its bunch's dependencies (including its ancestors' BunchMetas). That lets you store a LexList's map `(LexPosition -> value)` almost as [compactly](#compact-list) as a List's map `(Position -> value)` while still embedding all metadata. E.g., use a double map

```ts
{
  [bunchPrefix: string]: {
    [innerIndex: number]: T;
  };
};
```

(You can also obtain a bunch's prefix from its BunchNode using the `lexPrefix()` method - e.g., `order.getBunch(bunchID)!.lexPrefix()`.)

LexUtil's [source code](./src/lex_utils.ts) is deliberately simple and dependency-less, so that you can easily re-implement it in another language. That way, you can manipulate LexPositions on a non-JavaScript backend - e.g., generate new LexPositions when a server programmatically inserts text.

#### `BunchIDs`

Utitilies for generating `bunchIDs`.

When a method like `List.insertAt` creates a new Position (or LexPosition), it may create a new [bunch](#bunches) internally. This bunch is assigned a new bunchID which should be globally unique - or at least, unique among all bunches that this bunch will ever appear alongside (i.e., in the same Order).

By default, the library uses `BunchIDs.usingReplicaID()`, which returns [causal dots](https://mattweidner.com/2022/10/21/basic-list-crdt.html#causal-dot). You can supply a different bunchID generator in Order's constructor. E.g., to get reproducible bunchIDs in a test environment:

```ts
import seedrandom from "seedrandom";

const rng = seedrandom("42");
const order = new Order({ newBunchID: BunchIDs.usingReplicaID({ rng }) });
const list = new List(order);
// Test list...
```

#### Interface `BunchNode`

An Order's internal tree node corresponding to a [bunch](#bunches) of Positions.

You can access a bunch's BunchNode to retrieve its dependent metadata, using the `meta()` and `ancestors()` methods. For [Advanced](#advanced) usage, BunchNode also gives low-level access to an Order's tree of bunches.

Obtain BunchNodes using `Order.getNode` or `Order.getNodeFor`.

## Performance

Benchmarks are a WIP and will be reported here.

<!--
TODO: benchmarks
-->

### Performance Considerations

- The library is optimized for forward (left-to-right) insertions. If you primarily insert backward (right-to-left) or at random, you will see worse efficiency - especially storage overhead. (Internally, only forward insertions reuse [bunches](#bunches), so other patterns lead to fewer Positions per bunch.)

<!-- TODO
Custom serialization: protobufs; parse default bunchID format; exploit recurrences in replicaIDs.
-->
