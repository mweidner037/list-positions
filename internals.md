# Internals

TODO

- By manipulating the BunchMeta that you pass to `Order.receive`, you can manipulate the order on Positions. For example:
  - In a large document, instead of loading every bunch into the Order, only load the subtree corresponding to part of the doc. Pretend that the subtree's root is a direct child of the root bunch.
  - To stitch together lists that originally used independent Orders (e.g., merged text blocks), you can pretend that each Order's tree attaches to a separate child of the root. Use the children's offsets to order the subtrees.
- The Order class provides low-level access to the tree of bunches - in particular, a canonical [Bunch](TODO) object for each bunch. You can use this access to implement your own analog of List.

Idea of rewriting LexUtils in another lang (esp simple).

Idea of in-order database queries w/o LexPosition inefficiency.
