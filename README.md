# list-positions

Efficient "positions" for lists and text - enabling rich documents and collaboration

- [About](#about)
- [Usage](#usage)
- [API](#api)
- [Performance](#performance)
- [Demos ↗️](https://github.com/mweidner037/list-positions-demos)
- [@list-positions/formatting ↗️](https://github.com/mweidner037/list-positions-formatting#readme), a companion library that adds inline formatting (e.g. rich text)

## About

Many apps use a list whose values can change index over time: characters in a text document, items in a todo list, rows in a spreadsheet, etc. Instead of thinking of this list as an array, it's often easier to think of it as an ordered map `(position -> value)`, where a value's _position_ doesn't change over time. So if you insert a new entry `(position, value)` into the map, the other entries stay the same, even though their indices change:

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

This library provides positions (types Position/AbsPosition) and corresponding list-as-ordered-map data structures (classes List/Text/Outline/AbsList). Multiple lists can use the same positions (with the same sort order), including lists on different devices - so you can use this library to implement _collaborative_ lists & text, on top of a variety of network architectures.

### Example Use Cases

1. In a **text document with annotations** (comments/highlights), store the text using our Text class (a list of characters), and indicate each annotation's range using `start` and `end` Positions instead of regular array indices. That way, when the user inserts text in front of an annotation, the annotation stays "in the same place".
2. In a **todo-list app built on top of a database**, store each todo-item's Position as part of its database entry, and sort the items using a List at render time. Using positions lets you insert a new todo-item in the middle of the list (by assigning it a position in that spot) or move a todo-item around (by changing its position). This works even for a collaborative todo-list built on top of a cloud database.
3. In a **text editor with an edit history**, store the history of `(position, char)` pairs that were inserted or deleted. By correlating these positions with the text's current `(position -> char)` map, you can see where text came from ("git blame") and compute exact diffs between historical states. You can even revert edits in the history, or "cherry-pick" edits across history branches.
4. To make a **collaborative text editor**, you just need a way to collaborate on the map `(position -> char)`. This is easy to DIY, and more flexible than using an Operational Transformation or CRDT library. For example:
   - When a user types `char` at `index`, call `[pos] = list.insertAt(index, char)` to insert the char into their local list at a new Position `pos`. Then broadcast `(pos, char)` to all collaborators. Recipients call `list.set(pos, char)` on their own lists.
   - Or, send each `(position, char)` pair to a central server. The server can choose to accept, reject, or modify the change before forwarding it to other users - e.g., enforcing per-paragraph permissions.
   - Or, store the `(position -> char)` map in a cloud database that syncs for you. You can do this efficiently by understanding the [structure of Positions](#bunches). (See our [demos](https://github.com/mweidner037/list-positions-demos) for collaborative rich-text editors on top of various cloud databases.)

### Features

**Performance** Our list data structures have a small memory footprint, fast edits, and small saved states. See our [benchmark results](#performance) for a 260k operation text-editing trace.

**Collaboration** Lists on different devices can share the same positions. Even in the face of concurrent edits, positions are always globally unique, and you can insert a new position anywhere in a list. To make this possible, the library essentially implements a list CRDT ([Fugue](https://arxiv.org/abs/2305.00583)), but without the restrictions that come with CRDTs - ultimately, each List is a local data structure that you can edit at will.

**Non-interleaving** In collaborative scenarios, if two users concurrently insert a (forward or backward) sequence at the same place, their sequences will not be interleaved. For example, in a collaborative text editor, if Alice types "Hello" while Bob types "World" at the same place, then the resulting order will be "HelloWorld" or "WorldHello", not "HWeolrllod".

**Escape hatches** You can make use of the library without storing all of your data in one of our data structures. In particular, you can ask for a [lexicographically-ordered version of a position](#lexicographic-strings) to use independently of this library, or [store list values in your own data structure](#outline) instead of our default List class.

### Related Work

- [Fractional indexing](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/#fractional-indexing),
  a related but less general idea.
- [Blog post](https://mattweidner.com/2022/10/21/basic-list-crdt.html) describing the Fugue list CRDT and how it relates to the "list position" abstraction. This library implements an optimized version of that post's tree implementation (List/Position) and an analog of its string implementation (AbsList/AbsPosition).
- [Paper](https://arxiv.org/abs/2305.00583) with more details about Fugue - in particular, its non-interleaving guarantees.
- [Rope](<https://en.wikipedia.org/wiki/Rope_(data_structure)>), a data structure for efficient text editing that our List class uses as inspiration.

## Usage

Install with npm:

```bash
npm i --save list-positions
```

### AbsList and AbsPosition

An easy way to get started with the library is using the `AbsList<T>` class. It is a list-as-ordered map with value type `T` and positions (keys) of type `AbsPosition`.

Example code:

```ts
import { AbsList, AbsPosition } from "list-positions";

// Make an empty AbsList.
const list = new AbsList();

// Insert some values into the list.
list.insertAt(0, "x");
list.insertAt(1, "a", "b", "c");
list.insertAt(3, "y");
console.log([...list.values()]); // Prints ['x', 'a', 'b', 'y', 'c']

// Other ways to manipulate an AbsList:
list.setAt(1, "A");
list.deleteAt(0);
console.log([...list.values()]); // Prints ['A', 'b', 'y', 'c']

// 2nd way to insert values: insert after an existing position,
// e.g., the current cursor.
const cursorPos = list.cursorAt(3);
const newPos = list.insert(cursorPos, "z");
console.log([...list.values()]); // Prints ['A', 'b', 'y', 'z', 'c'];

// Map-like API:
list.set(newPos, "Z");
list.delete(newPos);
```

AbsPositions are easy to use because they are self-contained: you can use AbsPositions in an AbsList without any prior setup. In other words, their sort order is "absolute", not "relative" to some separate metadata.

The downside of AbsPositions is metadata overhead - their JSON encodings have variable size and can become long in certain scenarios (an average of 187 characters in our [benchmarks](./benchmark_results.md#abslist-direct)).

> Using AbsList is more efficient than storing all of the literal pairs `(absPosition, value)` in your own data structure. If you do need to use your own data structure (e.g., a DB table with one pair per row), it should be practical for short lists of perhaps <1,000 values - e.g., the items in a todo list, or the scenarios where [Figma uses fractional indexing](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/#syncing-trees-of-objects).

### List, Position, and Order

The library's main class is `List<T>`. It is a list-as-ordered-map with value type `T` and positions (keys) of type `Position`.

Example code:

```ts
import { List, MIN_POSITION, Order, Position } from "list-positions";

// Make an empty Order and an empty List on top of it.
const order = new Order();
const list = new List(order);

// Insert some values into the list.
list.insertAt(0, "x");
list.insertAt(1, "a", "b", "c");
list.insertAt(3, "y");
console.log([...list.values()]); // Prints ['x', 'a', 'b', 'y', 'c']

// Other ways to manipulate a List:
list.setAt(1, "A");
list.deleteAt(0);
console.log([...list.values()]); // Prints ['A', 'b', 'y', 'c']

// 2nd way to insert values: insert after an existing position,
// e.g., the current cursor.
const cursorPos: Position = list.cursorAt(3);
const [newPos] = list.insert(cursorPos, "z");
console.log([...list.values()]); // Prints ['A', 'b', 'y', 'z', 'c'];

// Map-like API:
list.set(newPos, "Z");
list.delete(newPos);

// You can create and compare Positions directly in the Order,
// without affecting its Lists.
const [otherPos] = order.createPositions(MIN_POSITION, list.positionAt(0), 1);
console.log(order.compare(MIN_POSITION, otherPos) < 0); // Prints true
console.log(order.compare(otherPos, list.positionAt(0)) < 0); // Prints true

// Optionally, set the value at otherPos sometime later.
// This "inserts" the value at the appropriate index for otherPos.
list.set(otherPos, "w");
console.log([...list.values()]); // Prints ['w', 'A', 'b', 'y', 'c'];
```

Unlike AbsPositions, Positions aren't directly comparable. Instead, their sort order depends on some separate metadata, described in [Managing Metadata](#managing-metadata) below. The upside is that Positions have nearly constant JSON size, so they are more efficient to share and store than AbsPositions (which embed all of their dependent metadata).

Positions are JSON objects with the following format:

```ts
type Position = {
  bunchID: string;
  innerIndex: number;
};
```

<a id="bunches"></a>
The `bunchID` identifies a **bunch** of Positions that share metadata (for efficiency). Each bunch has Positions with `innerIndex` 0, 1, 2, ...; these were originally inserted contiguously (e.g., by a user typing left-to-right) but might not be contiguous anymore. Regardless, bunches makes it easy to store a List's map `(Position -> value)` compactly:

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
- AbsPositions have a similar format to Positions:

  ```ts
  type AbsPosition = {
    // Analogous to bunchID, but also includes all of the bunch's dependent metadata.
    bunchMeta: AbsBunchMeta;
    innerIndex: number;
  };

  type AbsBunchMeta = {
    // Opaque JSON struct...
  };
  ```

  Thus you can store a map `(AbsPosition -> value)` compactly, using representations like those above. For example:

  ```ts
  type AbsListSavedState<T> = Array<{
    // One bunch's metadata.
    bunchMeta: AbsBunchMeta;
    // The bunch's values, in ListSavedState's sparse array format.
    values: (T[] | number)[];
  }>;
  ```

#### Managing Metadata

Each Position depends on some metadata, which is stored separately. (In contrast, an AbsPosition embeds all of its metadata - this is why AbsPositions have a variable size.) To use the same Positions with different instances of the List class (possibly on different devices), you must first transfer this metadata between the Lists.

Specifically, a List's [bunches](#bunches) form a tree. Each bunch, except for the special root with bunchID `"ROOT"`, has a `BunchMeta` that describes its location in the tree:

```ts
type BunchMeta = {
  /** The bunch's ID, which is the same as its Positions' bunchID. */
  bunchID: string;
  /** The parent bunch's ID. */
  parentID: string;
  /** A nonnegative integer used by the tree. */
  offset: number;
};
```

A List's tree of bunches is stored by a separate class `Order`, accessible from the List's `order` property. Multiple List instances can share the same Order via a constructor option. But when Lists have different Order instances, before using a Position from one List in the other (e.g., calling `list.set` or `list.indexOfPosition`), you must call `list.order.addMetas` with:

- The Position's bunch's BunchMeta.
- That bunch's parent's BunchMeta.
- The parent's parent's BunchMeta, etc., up the tree until reaching the root (exclusive). Together, these are the Position's _dependencies_.

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
  // Load the Order's state first, to add the saved BunchMetas.
  list.order.load(orderSave);
  list.load(listSave);
}
```

<a id="newMeta"></a>
**Multiple users** Suppose you have multiple users and a single list order, e.g., a collaborative text editor. Any time a user creates a new Position by calling `list.insertAt`, `list.insert`, or `list.order.createPositions`, they might create a new bunch. Other users must learn of the new bunch's BunchMeta before they can use the new Position.

One option is to always send AbsPositions over the network instead of Positions. Use `list.order.abs` and `list.order.unabs` to translate between the two. This is almost as simple as using [AbsList and AbsPosition](#abslist-and-absposition), but with the same cost in metadata overhead - in our [collaborative list benchmarks](./benchmark_results.md#abslist-direct), it has about 2.5x larger network messages than the second option below. However, the messages are still small in absolute terms (216 bytes/op). <!-- TODO: replicaID rotation benchmarks will make this worse. -->

A second option is to distribute a new BunchMeta immediately when it is created, before/together with its new Position. For example:

```ts
// When a user types "x" at index 7:
const [position, newMeta] = list.insertAt(7, "x");
if (newMeta !== null) {
  // Distribute the new bunch's BunchMeta.
  broadcast(JSON.stringify({ type: "meta", meta: newMeta }));
} // Else position reused an old bunch - no new metadata.
// Now you can distribute position:
broadcast(JSON.stringify({ type: "set", position, value: "x" }));

// Alt: Use an Order.onNewMeta callback.
// list.order.onNewMeta = (newMeta) => { /* Broadcast newMeta... */ }

// When a user receives a message:
function onMessage(message: string) {
  const parsed = JSON.parse(message);
  switch (parsed.type) {
    case "meta":
      list.order.addMetas([parsed.meta]);
      break;
    case "set":
      list.set(parsed.position, parsed.value);
      break;
    // ...
  }
}
```

This works best if your network has ordering guarantees that ensure you won't accidentally receive a Position before a BunchMeta that was sent earlier (e.g., causal-order delivery).

> Errors you might get if you mis-manage metadata:
>
> - "Position references missing bunchID: {...}. You must call Order.addMetas before referencing a bunch."
> - "Received BunchMeta {...}, but we have not yet received a BunchMeta for its parent node."

### Other Data Structures

The library provides additional data structures that are like `List<T>` but optimized for specific scenarios. See [Classes](#classes) below.

### Advanced

The library's internals are conceptually simple. By understanding them, you can unlock additional features and optimizations, or implement compatible libraries in other languages. See [Internals](./internals.md).

## API

This section gives a high-level overview of the library's exports. The implementations have complete docs, which should show up in your IDE's tooltips.

### Classes

#### `List<T>`

A list of values of type `T`, represented as an ordered map with Position keys.

List's API is a hybrid between `Array<T>` and `Map<Position, T>`. Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.

#### `Order`

A total order on Positions, independent of any specific assignment of values.

An Order manages metadata (bunches) for any number of Lists, Texts, Outlines, and AbsLists. You can also use an Order to create Positions independent of a List (`createPositions`), convert between Positions and AbsPositions (`abs` and `unabs`), and directly view the tree of bunches (`getBunch`, `getBunchFor`).

#### `Text`

A list of characters, represented as an ordered map with Position keys.

Text is functionally equivalent to a `List<string>` with single-char values, but it uses strings internally and in bulk methods, instead of arrays of single chars. This reduces memory usage and the size of saved states.

#### `Outline`

An `Outline` is like a List but without values. Instead, you tell the Outline which Positions are currently present, then use it to convert between Positions and their current indices.

Outline is useful when you are already storing a list's values in a different sequence data structure: a traditional array, a rich-text editor's internal state, a server-side search library, etc. Then you don't need to waste memory & storage space storing the values again in a List, but you might still need to:

- Look up the current index of a cursor or annotation that uses Positions.
- Add a `(position, value)` pair to the list that was received from a remote collaborator:
  ```ts
  outline.add(position);
  const index = outline.indexOfPosition(position);
  /* Splice value into your other sequence data structure at index; */
  ```
- Convert the other sequence's changes into `(position, value)` pair updates:

  ```ts
  // When the other sequence inserts `value` at `index`:
  const position = outline.insertAt(index);
  /* Broadcast/store the newly-set pair (position, value); */
  ```

Like List, Outline requires you to [manage metadata](#managing-metadata).

#### `AbsList<T>`

A list of values of type `T`, represented as an ordered map with AbsPosition keys.

AbsList's API is a hybrid between `Array<T>` and `Map<AbsPosition, T>`. Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.

#### Unordered Collections

The library also comes with _unordered_ collections:

- `PositionMap<T>`: A map from Positions to values of type `T`, like `List<T>` but without ordering info.
- `PositionCharMap`: A map from Positions to characters, like `Text` but without ordering info.
- `PositionSet`: A set of Positions, like `Outline` but without ordering info.

These collections do not support in-order or indexed access, but they also do not require managing metadata, and they are slightly more efficient.

For example, you can use a PositionSet to track the set of deleted Positions in a CRDT. See the [ListCrdt implementation](https://github.com/mweidner037/list-positions-crdts/blob/master/src/list_crdt.ts) in @list-positions/crdts for sample code.

### Types

All types are JSON serializable.

Representations of positions:

- `Position`, used in List and Outline.
- `AbsPosition`, used in AbsList.

Metadata:

- `BunchMeta`, used in Order.
- `AbsBunchMeta`, used by each `AbsPosition` to store all of its dependent metadata.

Saved states: Each class lets you save and load its internal states in JSON format. You can treat these saved states as opaque blobs, or read their docs to understand their formats.

- `ListSavedState<T>`
- `OrderSavedState`
- `TextSavedState`
- `OutlineSavedState`
- `AbsListSavedState<T>`

### Utilities

#### Min and Max Positions

The constants `MIN_POSITION` and `MAX_POSITION` are defined to be the minimum and maximum Positions in any Order. They are the only Positions with `bunchID: "ROOT"`. You'll mostly use these to create positions at the beginning or end of a list: e.g., `order.createPositions(p, MAX_POSITION, 1)` will create a position after `p`.

You can also use `MIN_POSITION` and `MAX_POSITION` as List keys, like any other Position. Note: Attempting to insert before `MIN_POSITION` or after `MAX_POSITION` will throw an error.

For AbsPositions, use `AbsPositions.MIN_POSITION` and `AbsPositions.MAX_POSITION`.

#### Cursors

A _cursor_ points to a spot in the list between two values - e.g., a cursor in a text document.

Internally, a cursor is represented as the Position (or AbsPosition, for AbsList) of the value to its left, or `MIN_POSITION` if it is at the start of the list. If that position becomes not-present in the list, the cursor's literal value remains the same, but its current index shifts to the left. (To bind to the Position on the right instead, pass `bind = "right"` to the cursor methods.)

Convert indices to cursors and back using methods `cursorAt` and `indexOfCursor`, on classes List, Text, Outline, and AbsList. These are wrappers around `positionAt` and `indexOfPosition` that get the edge cases correct.

#### Lexicographic Strings

The function `lexicographicString(pos: AbsPosition): string` returns a string with the property: The lexicographic order on strings matches the list order on positions. These are useful as an escape hatch for interacting with external systems (e.g., `ORDER BY` in a database), but they should be used sparingly for efficiency reasons.

> If you plan to use lexicographic strings exclusively, consider using the [position-strings](https://github.com/mweidner037/position-strings#readme) package instead, which is optimized for that use case (smaller JS bundle & more compact strings). Note: Its strings are **not compatible** with this library's.

#### `AbsPositions`

Utilities for manipulating [AbsPositions](#abslist-and-absposition).

For example, `AbsPositions.encodeMetas` and `AbsPositions.decodeMetas` let you convert between a bunch's dependencies (an array of `BunchMeta`s) and an AbsBunchMeta, which encodes those dependencies more compactly than the literal array.

<!-- TODO
AbsPositions's [source code](./src/abs_position.ts) is deliberately simple and dependency-less, so that you can easily re-implement it in another language. That way, you can manipulate AbsPositions on a non-JavaScript backend - e.g., generate new AbsPositions when a server programmatically inserts text.
-->

#### `BunchIDs`

Utitilies for generating bunchIDs.

When a method like `List.insertAt` creates a new Position (or AbsPosition), it may create a new [bunch](#bunches) internally. This bunch is assigned a new bunchID which should be globally unique - or at least, unique among all bunches that this bunch will ever appear alongside (i.e., in the same Order).

<a id="replica-ids"></a>
By default, the library uses [dot IDs](https://mattweidner.com/2023/09/26/crdt-survey-3.html#unique-ids-dots) with a random alphanumeric replicaID, via `BunchIDs.usingReplicaID()`. You can supply a specific replicaID in Order's constructor. E.g., to get reproducible bunchIDs in a test environment:

```ts
import { maybeRandomString } from "maybe-random-string";
import seedrandom from "seedrandom";

const prng = seedrandom("42");
const order = new Order({ replicaID: maybeRandomString({ prng }) });
const list = new List(order);
// Test list...
```

More generally, you can supply an arbitrary `newBunchID` function in Order's constructor.

#### Interface `BunchNode`

An Order's internal tree node corresponding to a [bunch](#bunches) of Positions.

You can access a bunch's BunchNode to retrieve its dependent metadata, using the `meta()` and `dependencies()` methods. For advanced usage, BunchNode also gives low-level access to an Order's [internal tree](./internals.md).

Obtain BunchNodes using `Order.getNode` or `Order.getNodeFor`.

#### Misc Functions

- `expandPositions(startPos: Position, sameBunchCount: number): Position[]` Returns an array of Positions that start at `startPos` and have sequentially increasing `innerIndex`.
- `positionEquals(a: Position, b: Position): boolean` Equality function for Positions.
- `compareSiblingNodes(a: BunchNode, b: BunchNode): number` [Compare function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#comparefn) for BunchNodes with the same parent, giving their order in the [internal tree](./internals.md).

## Performance

The `benchmarks/` folder contains benchmarks using List/Text/Outline/AbsList directly (for local usage or client-server collaboration) and using CRDTs built on top of the library.

Each benchmark applies the [automerge-perf](https://github.com/automerge/automerge-perf) 260k edit text trace and measures various stats, modeled on [crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks/)' B4 experiment.

Results for an op-based/state-based text CRDT built on top of a Text + PositionSet, on my laptop:

- Sender time (ms): 664
- Avg update size (bytes): 86.1
- Receiver time (ms): 412
- Save time (ms): 13
- Save size (bytes): 599805
- Load time (ms): 10
- Save time GZIP'd (ms): 42
- Save size GZIP'd (bytes): 84347
- Load time GZIP'd (ms): 27
- Mem used estimate (MB): 1.8

For more results, see [benchmark_results.md](./benchmark_results.md).

### Performance Considerations

For questions about performance, optimizations, or specific use cases, feel free to open an [issue](https://github.com/mweidner037/list-positions/issues).

Here are some general performance considerations:

1. The library is optimized for forward (left-to-right) insertions. If you primarily insert backward (right-to-left) or at random, you will see worse efficiency - especially storage overhead. (Internally, only forward insertions reuse [bunches](#bunches), so other patterns lead to fewer Positions per bunch.)
2. AbsPositions and Positions are interchangeable, via the `Order.abs` and `Order.unabs` methods. So you could always start off using the simpler-but-larger AbsPositions, then do a data migration to switch to Positions if performance demands it. <!-- TODO: likewise for List/Text/Outline/AbsList, via save-conversion methods. -->
3. The saved states are designed for simplicity, not size. This is why GZIP shrinks them a lot (at the cost of longer save and load times). You can improve on the default performance in various ways: binary encodings, deduplicating [replicaIDs](#replica-ids), etc. Before putting too much effort into this, though, keep in mind that human-written text is small. E.g., the 900 KB CRDT save size above is the size of one image file, even though it represents a 15-page LaTeX paper with 9x overhead.
4. For smaller AbsPositions, saved states, and [lexicographic strings](#lexicographic-strings), you can reduce the size of replicaIDs from their default of 21 chars. E.g., even in a popular document with 10,000 replicaIDs, 8 random alphanumeric chars still guarantee a < 1-in-5,000,000 chance of accidental replicaID reuse (cf. [birthday problem](https://en.wikipedia.org/wiki/Birthday_problem#Square_approximation)):

   ```ts
   import { maybeRandomString } from "maybe-random-string";

   const order = new Order({ replicaID: maybeRandomString({ length: 8 }) });
   ```

5. For very large lists, you can choose to call `List.set` on only the Position-value pairs that are currently scrolled into view. This reduces memory and potentially network usage.
6. The Text and Outline classes have smaller memory usage and saved state sizes than List, so prefer those in situations where they are sufficient.
