# position-strings

A source of lexicographically-ordered "position strings" for
collaborative lists and text.

## About

In a collaborative list (or text string), you need a way to refer
to "positions" within that list that:

1. Point to a specific list element (or text character).
2. Are global (all users agree on them) and immutable (they do not
   change over time).
3. Can be sorted.
4. Are unique, even if different users concurrently create positions
   at the same place.

`PositionSource` gives you such positions, in the form
of lexicographically-ordered strings. Specifically, `PositionSource.createBetween`
returns a new position string in between two existing position strings.

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
contain alphanumeric characters and `','`.
Also, the special string `PositionSource.LAST` is `'~'`.

### Further reading

- [Fractional indexing](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/#fractional-indexing),
  a related scheme that satisfies 1-3 but not 4-6.
- [List CRDTs](https://mattweidner.com/2022/10/21/basic-list-crdt.html)
  and how they map to position strings. PositionSource uses an optimized
  variant of that link's string implementation.
- [Paper](https://www.repository.cam.ac.uk/handle/1810/290391) about
  interleaving in collaborative text editors.

## Usage

```ts
import { PositionSource } from "position-strings";

// At the start of your app:
const source = new PositionSource();

// When the user types `char` at `index`:
const position = source.createBetween(
  myList[index - 1].position,
  myList[index].position
);
myList.splice(index, 0, { char, position });
// Or insert it into a database table, ordered map, etc.
```

If your list is collaborative:

```ts
import { findPosition } from "position-strings";

// After creating { char, position }, also broadcast it to other users.
// When you receive `remote = { char, position }` from another user:
const index = findPosition(remote.position).index;
myList.splice(index, remote);
// Or insert `remote` into a database table and query
// "SELECT char FROM table ORDER BY position".
```

To use cursors:

```ts
import { Cursors } from "position-strings";

let cursor: string = "";
// When the user deliberately moves their cursor to `cursorIndex`:
cursor = Cursors.fromIndex(cursorIndex, myListPositions);
// Or run the algorithm in the `Cursors.fromIndex` docs.

// When the text changes, update the displayed cursor:
cursorIndex = Cursors.toIndex(cursor, myListPositions);
// Or run the query in the `Cursors.toIndex` docs.
```

<!-- TODO: test usage snippets -->

## API

### Class `PositionSource`

```ts
constructor(options?: { ID?: string })
```

Constructs a new PositionSource.

It is okay to share a single PositionSource between
all documents (lists/text strings) in the same JavaScript runtime.

For efficiency, within each JavaScript runtime, you should not use
more than one PositionSource for the same document (list/text string).
An exception is if multiple logical users share the same runtime;
we then recommend one PositionSource per user.

- `options.id` A unique ID for this PositionSource. Defaults to `IDs.random()`.

  If provided, `options.id` must satisfy:

  - It is unique across the entire collaborative application, i.e.,
    all PositionSources whose positions may be compared to ours. This
    includes past PositionSources, even if they correspond to the same
    user/device.
  - All characters are lexicographically greater than `','` (code point 44).
  - The first character is lexicographically less than `'~'` (code point 126).

  If `options.id` contains non-alphanumeric characters, created positions
  will contain those characters and `','`.

```ts
createBetween(
  left: string = PositionSource.FIRST,
  right: string = PositionSource.LAST
): string
```

Returns a new position between `left` and `right`
(`left < new < right`).

The new position is unique across the entire collaborative application,
even in the face on concurrent calls to this method on other
PositionSources.

## Developing

### Files

- `src/`: Source folder. Entry point is `index.ts`. Built to `build/esm` and `build/commonjs`.
- `test/`: Test folder. Runs using mocha.

### Commands

- Build with `npm run build`.
- Test, lint, etc. with `npm run test`.
- Publish with `npm publish`.
