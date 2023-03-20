# position-strings

A source of lexicographically-ordered "position strings" for
collaborative lists and text.

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

This package gives you such positions, in the form
of lexicographically-ordered strings. Specifically, `PositionSource.createBetween`
returns a new "position string" in between two existing position strings.

These strings have the bonus properties:

5. (Non-Interleaving) If two `PositionSource`s concurrently create a (forward or backward)
   sequence of positions at the same place,
   their sequences will not be interleaved.

   For example, if
   Alice types "Hello" while Bob types "World" at the same place,
   and they each use a `PositionSource` to create a position for each
   character, then
   the resulting order will be "HelloWorld" or "WorldHello", not
   "HWeolrllod".

6. If a `PositionSource` creates positions in a forward (increasing)
   sequence, their lengths as strings will only grow logarithmically,
   not linearly.

Position strings are printable ASCII. Specifically, they
contain alphanumeric characters, `','`, and `'.'`.
Also, the special string `PositionSource.LAST` is `'~'`.

### Further reading

- [Fractional indexing](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/#fractional-indexing),
  a related scheme that satisfies 1-3 but not 4-6.
- [List CRDTs](https://mattweidner.com/2022/10/21/basic-list-crdt.html)
  and how they map to position strings. `PositionSource` uses an optimized
  variant of that link's [string implementation](https://mattweidner.com/2022/10/21/basic-list-crdt.html#intro-string-implementation), described in
  [algorithm.md](https://github.com/mweidner037/position-strings/blob/master/algorithm.md).
- [Paper about interleaving](https://www.repository.cam.ac.uk/handle/1810/290391)
  in collaborative text editors.

## Usage

Install with npm:

```bash
npm i --save position-strings
```

Creating position strings:

```ts
import { PositionSource } from "position-strings";

// At the start of your app:
const source = new PositionSource();

// When the user types `char` at `index`:
const position = source.createBetween(
  myListPositions[index - 1],
  myListPositions[index]
  // If index is 0 or myListPositions.length, the above behaves reasonably,
  // since undefined defaults to PositionSource.FIRST or LAST.
);
myListPositions.splice(index, 0, position);
myList.splice(index, 0, char);
// Or insert { position, char } into a database table, ordered map, etc.
```

If your list is collaborative:

```ts
import { findPosition } from "position-strings";

// After creating { char, position }, also broadcast it to other users.
// When you receive `remote = { char, position }` from another user:
const index = findPosition(remote.position, myListPositions).index;
myListPositions.splice(index, 0, remote.position);
myList.splice(index, 0, remote.char);
// Or insert `remote` into a database table and query
// "SELECT char FROM table ORDER BY position".
// Or insert `remote` into an ordered map, etc.
```

To use cursors:

```ts
import { Cursors, PositionSource } from "position-strings";

let cursor: string = PositionSource.FIRST;

// When the user deliberately moves their cursor to `cursorIndex`:
cursor = Cursors.fromIndex(cursorIndex, myListPositions);
// Or run the algorithm in the `Cursors.fromIndex` docs.

// When the text changes, update the displayed cursor:
cursorIndex = Cursors.toIndex(cursor, myListPositions);
// Or run the query in the `Cursors.toIndex` docs.
```

## API

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

[Firebase text-editor](https://firebase-text-editor.herokuapp.com/) uses position-strings to implement collaborative (plain) text editing on top of [Firebase RTDB](https://firebase.google.com/docs/database). Each character is stored together with its position, and a Firebase query is used to list the characters in order.

The app also demonstrates using `Cursors` to track the local user's selection start and end.

[Source code](https://github.com/mweidner037/firebase-text-editor/blob/master/src/site/main.ts)

## Performance

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
- [`PositionSource.createBetween`](#createbetween) is optimized for left-to-right insertions. If you primarily insert right-to-left or at random, you will see worse performance.
