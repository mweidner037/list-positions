# position-structs

A source of memory-efficient "position structs" for collaborative lists and text.

- [About](#about)
- [Usage](#usage)
- [API](#api)
- [Example App](#example-app)
- [Performance](#performance)

## About

In a collaborative list (or text string), you need a way to refer
to "positions" within that list that:

1. Point to a specific list element (or text character).
2. Are global (all users agree on them) and immutable (they do not
   change over time).
3. Can be sorted.
4. Are unique, even if different users concurrently create positions
   at the same place.

This package gives you such positions, as a JSON-serializable struct (flat object) called [Position](#struct-position). Specifically:

- Class [Order](#class-order) manages a [total order](https://en.wikipedia.org/wiki/Total_order) on Positions, letting you create and compare them. It requires some shared metadata, described below.
- Class [List](#class-list) represents a map `Position -> value` in list form, allowing indexed access with low memory overhead.

These Positions have the bonus properties:

5. It is easy to store and edit a map from Positions to values in your own code, including in a database or non-JS backend. You only need the code in this package to compare Positions in the total order or do indexed access. (See [Advanced](TODO) for how to create new Positions on a non-JS backend.)

6. (Forward Non-Interleaving) If two users concurrently create a forward (left-to-right)
   sequence of positions at the same place,
   their sequences will not be interleaved.

   For example, if
   Alice types "Hello" while Bob types "World" at the same place,
   and they each use an Order to create a Position for each
   character, then
   the resulting order will be "HelloWorld" or "WorldHello", not
   "HWeolrllod".

### Further reading

- [position-strings](https://www.npmjs.com/package/position-strings),
  a package that provides positions in the form of lexicographically-ordered strings instead of structs. position-structs is less flexible than position-strings, but it has noticably lower memory/storage overhead, especially for collaborative text.
- [List CRDTs](https://mattweidner.com/2022/10/21/basic-list-crdt.html)
  and how they relate to unique immutable Positions. `Order` is similar to that post's [tree implementation](https://mattweidner.com/2022/10/21/basic-list-crdt.html#tree-implementation), but it uses an optimized variant of [RGA](https://doi.org/10.1016/j.jpdc.2010.12.006) instead of Fugue.
- [Paper about interleaving](https://www.repository.cam.ac.uk/handle/1810/290391)
  in collaborative text editors.

## Usage

Install with npm:

```bash
npm i --save position-structs
```

Create an empty Order and an empty List on top of it:

```ts
import { List, Order, Position } from "position-structs";

const order = new Order();
const list = new List<string>(order);
```

Now you can create Positions and manipulate the List state:

```ts
// Insert some values into the list:
list.insertAt(0, "x");
list.insertAt(1, "a", "b", "c");
list.insertAt(3, "y");
console.log([...list.values()]); // Prints ['x', 'a', 'b', 'y', 'c']
```

Other ways to manipulate a List:

```ts
list.setAt(1, 'A');
list.deleteAt(0);
console.log([...list.values()]); // Prints ['A', 'b', 'y', 'c']

// 2nd way to insert values: insert after an existing Position,
// e.g., the current cursor.
const prevPos: Position = ...;
const { pos: newPos } = list.insert(prevPos, 'z');

list.set(newPos, 'Z');
list.delete(newPos);
```

You can create and compare Positions directly in the Order, without affecting its Lists:

```ts
const { pos: otherPos } = order.createPosition(Order.MIN_POSITION);
console.log(order.compare(Order.MIN_POSITION, otherPos) < 0); // Prints true

// Optionally, set the value at otherPos sometime later.
// This "inserts" the value at the appropriate index for otherPos.
list.set(otherPos, "w");
```

You can have multiple Lists on top of the same Order:

```ts
const bodyText = new List<string>(order);
const suggestedText = new List<string>(order);

bodyText.insertAt(0, ..."Animal: ");

// User makes a suggestion at index 8 in bodyText:
const cursorPos = bodyText.positionAt(8);
suggestedText.insert(cursorPos, ..."cat");

// When the suggestion is accepted:
for (const [pos, value] of suggestedText.entries()) {
  bodyText.set(pos, value);
}
console.log([...bodyText.values()].join("")); // Prints "Animal: cat"
```

### Shared Metadata: NodeMetas

Multiple instances of Order can use the same Positions, including instances on different devices (collaboration) or at different times (loaded from storage). However, you need to share some metadata first.

Specifically, each Position has the form

```ts
type Position = {
  creatorID: string;
  timestamp: number;
  valueIndex: number;
};
```

The pair `{ creatorID, timestamp }` identifies a **node** in a shared tree. Your Order must receive a **[NodeMeta](#types-nodemeta) ("node description")** for this node before you can use the Position in `List.set`, `Order.compare`, etc. Otherwise, you will get an error `"Position references missing OrderNode: <...>. You must call Order.receive before referencing an OrderNode."`.

> Exception: The root node `{ creatorID: "ROOT", timestamp: 0 }` is always valid. Its only Positions are `Order.MIN_POSITION` and `Order.MAX_POSITION`.

Use TODO `Order.save` and `Order.receiveSavedState` to share all of an Order's NodeMetas:

```ts
// Before exiting:
const savedState: OrderSavedState = order.save();
localStorage.setItem("orderSavedState", JSON.stringify(savedState));

// Next time you start the app:
order.receiveSavedState(JSON.parse(localStorage.getItem("orderSavedState")));
```

Use `Order.onCreateNode` and `Order.receive` to share a new node's description when it is created:

```ts
// Just after creating order:
order.onCreateNode = (createdNodeMeta: NodeMeta) => {
  const msg = JSON.stringify(createdNodeMeta);
  // Broadcast msg to all collaborators...
};

function onBroadcastReceive(msg: string) {
  order.receive([JSON.parse(msg)]);
}

// Alternative to order.onCreatedNode:
// Methods that might create a node (List.insertAt, List.insert,
// Order.createPosition) also return its `createdNodeMeta` (or null).
```

Internally, a [NodeMeta](#struct-nodemeta) indicates a node's **parent Position**:

```ts
type NodeMeta = {
  // Node ID, matching the node's Positions.
  readonly creatorID: string;
  readonly timestamp: number;
  // The node's parent Position.
  readonly parent: Position;
};
```

It is okay if an Order receives the same NodeMeta multiple times, or if different instances receive NodeMetas in different orders. However, before receiving a NodeMeta, its parent Position must itself be valid: the Order must have already received the parent's NodeMeta (or the parent is part of the same `Order.receive` call). Otherwise, you will get an error `"Received NodeMeta <...>, but we have not yet received a NodeMeta for its parent node <...>."`.

> You can think of an Order's state as a Grow-Only Set of NodeMetas. TODO `Order.save` and `Order.receiveSavedState` form a [state-based CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#State-based_CRDTs), while `Order.onCreateNode` and `Order.receive` form an [op-based CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#Operation-based_CRDTs). You can also implement your own sync strategies - e.g., two peers compare their largest timestamps for each creatorID and only exchange the ones they're missing.

### Storage and Collaboration

The List class does not handle storage or collaboration - it is just a local data structure. (This contrasts with most collaborative text-editing libraries.) You are free to manage its state however you like. For example, in a collaborative text editor, each client's List could be an optimistic cache of a server-side database, allowing the server to enforce consistency, fine-grained permissions (per-paragraph access controls?), etc.

Fundamentally, a List's state is a map `Position -> value`. Some ways to store this state outside of a List:

- A database table with columns `creatorID: string; timestamp: uint; valueIndex: uint; value: T`.
- More efficiently, a database table with columns `creatorID: string; timestamp: uint; values: (T | null)[]`. Here you represent all of a node's values in a single array, indexed by `valueIndex`.
- A triple-layered map `creatorID -> (timestamp -> (valueIndex -> value))`. The methods `List.save()` and `List.load()` use this representation. <!-- TODO: link, at least to ListSavedState type? -->

Likewise, an Order's state is fundamentally an array of NodeMetas. Some ways to store this state:

- A database table with columns `creatorID: string; timestamp: uint; parentCreatorID: string, parentTimestamp: uint, parentValueIndex: uint`.
- A double-layered map `creatorID -> (timestamp -> Position)`. TODO: only w/ default nodeIDs. Instead/also: discuss array of NodeMetas vs map id -> rest.

Tips:

- `valueIndex` is an array index assigned consecutively (0, 1, 2, ...). This lets you store all of a node's values in a single array, although note that the array may have holes (from deleted values).
- `timestamp` is a non-negative integer that increases over time, but it is **not** assigned consecutively - there may be gaps.
- Each `creatorID` corresponds to a specific instance of Order: that instance's [replicaID](#TODO). So you can expect to see the same `creatorID`s repeated many times. In particular, a NodeMeta's `creatorID` is usually the same as its `parent.creatorID`.
- You can improve over Position and NodeMeta's JSON encodings using [protobufs](https://www.npmjs.com/package/protobufjs) or similar.

### Advanced

By understanding Order's underlying tree structure, you can:

- Create Positions on a non-JS backend, without importing this library, or without loading the entire list.
- Lazy-load only the NodeMetas that you need, e.g., when viewing part of a large text document.
- Stitch together total orders that were created separately but should be displayed in sequence, e.g., after merging independent blocks of text.

See the [Advanced Guide](./advanced.md). TODO

## API

TODO

<!--
- [Class `PositionSource`](#class-positionsource)
- [Function `findPosition`](#function-findposition)
- [Class `Cursors`](#class-cursors)
- [Class `IDs`](#class-ids)

### Class `PositionSource`

#### constructor

```ts
constructor(options?: { ID?: string })
```

Constructs a new `PositionSource`.

It is okay to share a single `PositionSource` between
all documents (lists/text strings) in the same JavaScript runtime.

For efficiency (shorter position strings),
within each JavaScript runtime, you should not use
more than one `PositionSource` for the same document.
An exception is if multiple logical users share the same runtime;
we then recommend one `PositionSource` per user.

_@param_ `options.ID` A unique ID for this `PositionSource`. Defaults to
`IDs.random()`.

If provided, `options.ID` must satisfy:

- It is unique across the entire collaborative application, i.e.,
  all `PositionSource`s whose positions may be compared to ours. This
  includes past `PositionSource`s, even if they correspond to the same
  user/device.
- It does not contain `','` or `'.'`.
- The first character is lexicographically less than `'~'` (code point 126).

If `options.ID` contains non-alphanumeric characters, then created
positions will contain those characters in addition to
alphanumeric characters, `','`, and `'.'`.

#### createBetween

```ts
createBetween(
  left: string = PositionSource.FIRST,
  right: string = PositionSource.LAST
): string
```

Returns a new position between `left` and `right`
(`left < new < right`).

The new position is unique across the entire collaborative application,
even in the face of concurrent calls to this method on other
`PositionSource`s.

_@param_ `left` Defaults to `PositionSource.FIRST` (insert at the beginning).

_@param_ `right` Defaults to `PositionSource.LAST` (insert at the end).

#### Properties

```ts
readonly ID: string
```

The unique ID for this `PositionSource`.

```ts
static readonly FIRST: string = ""
```

A string that is less than all positions.

```ts
static readonly LAST: string = "~"
```

A string that is greater than all positions.

### Function `findPosition`

```ts
function findPosition(
  position: string,
  positions: ArrayLike<string>
): { index: number; isPresent: boolean };
```

Returns `{ index, isPresent }`, where:

- `index` is the current index of `position` in `positions`,
  or where it would be if added.
- `isPresent` is true if `position` is present in `positions`.

If this method is inconvenient (e.g., the positions are in a database
instead of an array), you can instead compute
`index` by finding the number of positions less than `position`.
For example, in SQL, use:

```sql
SELECT COUNT(*) FROM table WHERE position < $position
```

See also: `Cursors.toIndex`.

_@param_ `positions` The target list's positions, in lexicographic order.
There should be no duplicate positions.

### Class `Cursors`

Utilities for working with cursors in a collaborative list
or text string.

A cursor points to a particular spot in a list, in between
two list elements (or text characters). This class handles
cursors for lists that use our position strings.

A cursor is represented as a string.
Specifically, it is the position of the element
to its left, or `PositionSource.FIRST` if it is at the beginning
of the list. If that position is later deleted, the cursor stays the
same, but its index shifts to next element on its left.

You can use cursor strings as ordinary cursors, selection endpoints,
range endpoints for a comment or formatting span, etc.

#### fromIndex

```ts
static fromIndex(index: number, positions: ArrayLike<string>): string
```

Returns the cursor at `index` within the given list of positions. Invert with `Cursors.toIndex`.

That is, the cursor is between the list elements at `index - 1` and `index`.

If this method is inconvenient (e.g., the positions are in a database
instead of an array), you can instead run the following algorithm yourself:

- If `index` is 0, return `PositionSource.FIRST = ""`.
- Else return `positions[index - 1]`.

_@param_ `positions` The target list's positions, in lexicographic order.
There should be no duplicate positions.

#### toIndex

```ts
static toIndex(cursor: string, positions: ArrayLike<string>): number
```

Returns the current index of `cursor` within the given list of
positions. Inverse of `Cursors.fromIndex`.

That is, the cursor is between the list elements at `index - 1` and `index`.

If this method is inconvenient (e.g., the positions are in a database
instead of an array), you can instead compute
`index` by finding the number of positions less than
or equal to `position`.
For example, in SQL, use:

```sql
SELECT COUNT(*) FROM table WHERE position <= $position
```

See also: `findPosition`.

_@param_ `positions` The target list's positions, in lexicographic order.
There should be no duplicate positions.

### Class `IDs`

Utitilies for generating `PositionSource` IDs (the `options.ID` constructor argument).

#### random

```ts
static random(options?: { length?: number; chars?: string }): string
```

Returns a cryptographically random ID made of alphanumeric characters.

_@param_ `options.length` The length of the ID, in characters.
Default: `IDs.DEFAULT_LENGTH`.

_@param_ `options.chars` The characters to draw from. Default: `IDs.DEFAULT_CHARS`.

If specified, only the first 256 elements are used, and you achieve
about `log_2(chars.length)` bits of entropy per `length`.

#### pseudoRandom

```ts
static pseudoRandom(
    rng: seedrandom.prng,
    options?: { length?: number; chars?: string }
  ): string
```

Returns a psuedorandom ID made of alphanumeric characters,
generated using `rng` from package [seedrandom](https://www.npmjs.com/package/seedrandom).

> Note: If you install `@types/seedrandom` yourself instead of relying on our
> dependency, install version `2.4.28`, even though `seedrandom` itself
> has version `3.0.5`.

Pseudorandom IDs with a fixed seed are recommended for
tests and benchmarks, to make them deterministic.

_@param_ `options.length` The length of the ID, in characters.
Default: `IDs.DEFAULT_LENGTH`.

_@param_ `options.chars` The characters to draw from. Default: `IDs.DEFAULT_CHARS`.

If specified, only the first 256 elements are used, and you achieve
about `log_2(chars.length)` bits of entropy per `length`.

#### validate

```ts
static validate(ID: string): void
```

Throws an error if `ID` does not satisfy the
following requirements from `PositionSource`'s constructor:

- It does not contain `','` or `'.'`.
- The first character is lexicographically less than `'~'` (code point 126).

#### Properties

```ts
static readonly DEFAULT_LENGTH: number = 10
```

The default length of an ID, in characters.

```ts
static readonly DEFAULT_CHARS: string =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
```

Default characters used in IDs: alphanumeric chars.

## Example App

TODO (update from position-strings)

[Firebase text-editor](https://firebase-text-editor.herokuapp.com/) uses position-strings to implement collaborative (plain) text editing on top of [Firebase RTDB](https://firebase.google.com/docs/database). Each character is stored together with its position, and a Firebase query is used to list the characters in order.

The app also demonstrates using `Cursors` to track the local user's selection start and end.

[Source code](https://github.com/mweidner037/firebase-text-editor/blob/master/src/site/main.ts)

## Performance

TODO (update from position-strings)

_Position string length_ is our main performance metric. This determines the memory, storage, and network overhead due to a collaborative list's positions.

> Additionally, each `PositionSource` instance uses some memory, and `PositionSource.createBetween` takes some time, but these are usually small enough to ignore.

To measure position string length in a realistic setting, we benchmark against [Martin Kleppmann's text trace](https://github.com/automerge/automerge-perf). That is, we pretend a user is typing into a collaborative text editor that attaches a position string to each character, then output statistics for those positions.

For the complete trace (182k positions, 260k total edits) typed by a single `PositionSource`, the average position length is **33 characters**, and the max length is 55.

For a more realistic scenario with 260 `PositionSource`s (a new one every 1,000 edits), the average position length is **111 characters**, and the max length is 237. "Rotating" `PositionSource`s in this way simulates the effect of multiple users, or a single user who occasionally reloads the page. (The extra length comes from referencing multiple [IDs](#properties) per position: an average of 8 IDs/position x 8 chars/ID = 64 chars/position.)

If we only consider the first 10,000 edits, the averages decrease to **23 characters** (single `PositionSource`) and **50 characters** (new `PositionSource` every 1,000 edits).

More stats for these four scenarios are in [stats.md](https://github.com/mweidner037/position-strings/blob/master/stats.md). For full data, run `npm run benchmarks` (after `npm ci`) and look in `benchmark_results/`.

### Performance Considerations

- In realistic scenarios with multiple `PositionSource`s, most of the positions' length comes from referencing [IDs](#properties). By default, IDs are 8 random alphanumeric characters to give a low probability of collisions, but you can pass your own shorter IDs to [`PositionSource`'s constructor](#constructor). For example, you could assign IDs sequentially from a server.
- A set of positions from the same list compress reasonably well together, since they represent different paths in the same tree. In particular, a list's worth of positions should compress well under gzip or prefix compression. However, compressing individual positions is not recommended.
- [`PositionSource.createBetween`](#createbetween) is optimized for left-to-right insertions. If you primarily insert right-to-left or at random, you will see worse performance. -->
