# list-positions

Efficient "positions" for lists and text - enabling rich documents and collaboration

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

This library provides positions (type `Position`) and a corresponding ordered map data structure (class `List`). Multiple Lists can use the same Positions (with the same sort order), including Lists on different devices - enabling DIY collaborative lists & text editing.

### Use Cases

1. In a text document with annotations (comments/highlights), store the text as a List of characters, and indicate each annotation's range using a `start` and `end` Position. That way, when the user inserts text in front of an annotation, the annotation stays "in the same place", without needing to update start/end indexes.
2. In a todo-list app built on top of a database, store each todo-item's Position as part of its database entry. That lets you insert a new todo-item in the middle of the list (by assigning it a Position in that spot) or move a todo-item around (by changing its Position). It works even for a collaborative todo-list built on top of a cloud database.
3. In a fancy text editor with suggested changes (from collaborators, AI, or local-user musings), store each suggestion as a collection of `(position, value)` pairs to insert or delete. When the user accepts a suggestion, apply those changes to the main List.
4. To make a collaborative text editor, you just need a way to collaborate on the map `(position -> value)`. This is easy to DIY, and more flexible than using an Operational Transformation or CRDT library. For example:
   - When a user types `char` at `index`, call `[pos] = list.insertAt(index, char)` to insert the char into their local List at a (new) Position `pos`. Then broadcast `(pos, char)` to all collaborators. Recipients call `list.set(pos, char)` on their own Lists.
   - Or, store the map in a cloud database. (Consider using the [optimizations](TODO) below.)
   - Or, send each `(pos, char)` pair to a central server. The server can choose to accept, reject, or modify the change before forwarding it to other users - e.g., enforcing per-paragraph permissions. It can also choose to store the map in a database table, instead of loading each active document into memory.

### Features

**Performance** The List class has a small memory footprint, fast edits, and small saved states. See our [performance measurements](TODO) for a 267k op text-editing trace.

**Collaboration** Lists can share the same Positions even across devices. Even in the face of concurrent edits, Positions are always globally unique, and you can insert a new Position anywhere in a list. To make this possible, the library essentially implements a list CRDT ([Fugue](TODO)), but with a more flexible API.

**Non-interleaving** In collaborative scenarios, if two users concurrently insert a (forward or backward) sequence at the same place, their sequences will not be interleaved. For example, in a collaborative text editor, if Alice types "Hello" while Bob types "World" at the same place, then the resulting order will be "HelloWorld" or "WorldHello", not "HWeolrllod".

**Multiple modes** If you do not want to use our List class (e.g., on a non-JavaScript backend), there are alternative ways to work with the library's positions, described in TODO (incl understanding internals). The different modes are compatible, allowing you to use different modes on different devices or migrate existing data.

### Related Work

- [Fractional indexing](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/#fractional-indexing),
  a related but less general idea.
- [Blog post](https://mattweidner.com/2022/10/21/basic-list-crdt.html) describing the Fugue list CRDT and how it relates to the "list position" abstraction. This library implements optimized versions of that post's tree implementation (Position/List) and string implementation (LexPosition/LexList).
- [Paper](https://arxiv.org/abs/2305.00583) with more details about Fugue - in particular, its non-interleaving guarantees, which this library also achieves.

## Usage
